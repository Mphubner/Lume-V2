-- Apply reviewed category suggestions only to still-uncategorized staging rows.
-- Source data, economic nature and ledger approval remain separate operations.
BEGIN;
CREATE FUNCTION public.apply_import_category_suggestions(p_actor uuid,p_import uuid,p_suggestions jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 job public.imports; staged public.import_rows; category public.categories; item jsonb;
 row_ids uuid[]:='{}'; row_count integer; categorized integer:=0; skipped integer:=0;
BEGIN
 SELECT * INTO job FROM public.imports WHERE id=p_import FOR UPDATE;
 IF job.id IS NULL OR job.status<>'needs_review' OR NOT public.actor_can_access_workspace(p_actor,job.workspace_id,true) THEN
  RAISE EXCEPTION 'Importação indisponível para categorizar';
 END IF;
 IF jsonb_typeof(p_suggestions) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Sugestões inválidas'; END IF;
 row_count:=jsonb_array_length(p_suggestions);
 IF row_count NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Selecione entre 1 e 500 sugestões'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_suggestions) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Sugestão inválida'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN ('id','category_id','subcategory'))
   OR jsonb_typeof(item->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'category_id') IS DISTINCT FROM 'string'
   OR coalesce(item->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR coalesce(item->>'category_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR (item?'subcategory' AND jsonb_typeof(item->'subcategory') NOT IN ('string','null'))
   OR length(coalesce(item->>'subcategory',''))>120 THEN RAISE EXCEPTION 'Sugestão inválida'; END IF;
  row_ids:=array_append(row_ids,(item->>'id')::uuid);
 END LOOP;
 IF (SELECT count(DISTINCT id) FROM unnest(row_ids) id)<>row_count THEN RAISE EXCEPTION 'Linhas de sugestão repetidas'; END IF;
 IF (SELECT count(*) FROM public.import_rows WHERE id=ANY(row_ids) AND import_id=job.id AND workspace_id=job.workspace_id)<>row_count THEN
  RAISE EXCEPTION 'Linha fora da importação';
 END IF;
 -- The same job-then-row lock order is used by manual review and approval.
 PERFORM id FROM public.import_rows WHERE id=ANY(row_ids) ORDER BY id FOR UPDATE;
 FOR item IN SELECT value FROM jsonb_array_elements(p_suggestions) LOOP
  SELECT * INTO staged FROM public.import_rows WHERE id=(item->>'id')::uuid;
  IF staged.economic_kind<>'standard' OR staged.linked_transaction_id IS NOT NULL OR staged.reversal_of IS NOT NULL THEN
   RAISE EXCEPTION 'Categoria sugerida exige receita ou despesa padrão';
  END IF;
  IF staged.review_state NOT IN ('pending','potential_duplicate','duplicate') THEN RAISE EXCEPTION 'Linha indisponível para revisão'; END IF;
  SELECT * INTO category FROM public.categories WHERE id=(item->>'category_id')::uuid FOR SHARE;
  IF category.id IS NULL OR NOT coalesce(category.workspace_id=job.workspace_id OR (category.is_system AND category.user_id IS NULL AND category.workspace_id IS NULL),false) THEN
   RAISE EXCEPTION 'Categoria indisponível';
  END IF;
  IF category.type IS NULL OR category.type NOT IN ('both',CASE WHEN staged.amount_cents<0 THEN 'expense' ELSE 'income' END) THEN
   RAISE EXCEPTION 'Categoria incompatível com o sinal do movimento';
  END IF;
  IF item->>'subcategory' IS NOT NULL AND NOT coalesce((item->>'subcategory')=ANY(coalesce(category.subcategories,'{}'::text[])),false) THEN
   RAISE EXCEPTION 'Subcategoria indisponível';
  END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(p_suggestions) LOOP
  SELECT * INTO staged FROM public.import_rows WHERE id=(item->>'id')::uuid;
  IF staged.category_id IS NOT NULL THEN skipped:=skipped+1; CONTINUE; END IF;
  PERFORM public.update_import_row(p_actor,staged.id,jsonb_build_object('category_id',item->>'category_id','subcategory',item->>'subcategory'));
  categorized:=categorized+1;
 END LOOP;
 RETURN jsonb_build_object('categorized',categorized,'skipped',skipped,'review_required',true);
END $$;
REVOKE ALL ON FUNCTION public.apply_import_category_suggestions(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_import_category_suggestions(uuid,uuid,jsonb) TO service_role;
COMMIT;

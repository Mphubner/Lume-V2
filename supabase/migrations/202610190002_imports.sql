-- Depends on 202610190001_integrity.sql. No historical transaction is deleted.
BEGIN;
ALTER TABLE public.imports DROP CONSTRAINT IF EXISTS imports_status_check;
ALTER TABLE public.imports ADD CONSTRAINT imports_status_check CHECK(status IN ('uploading','queued','processing','needs_review','completed','failed','cancelled','reversed'));
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS document_hash text;
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS file_size bigint;
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS parser_options jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS statement_metadata jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS balance_check jsonb;
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS lease_token uuid;
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS lease_until timestamptz;
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS source_expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days';
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS source_deleted_at timestamptz;
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS last_error_code text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS content_fingerprint text;
CREATE INDEX IF NOT EXISTS transaction_content_candidates ON public.transactions(account_id,date,amount);
CREATE UNIQUE INDEX IF NOT EXISTS import_document_identity ON public.imports(account_id,document_hash) WHERE document_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS import_queue ON public.imports(next_attempt_at,created_at) WHERE status IN ('queued','processing');

CREATE TABLE IF NOT EXISTS public.import_rows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), import_id uuid NOT NULL REFERENCES public.imports(id) ON DELETE RESTRICT,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id), account_id uuid NOT NULL REFERENCES public.accounts(id),
 row_number integer NOT NULL CHECK(row_number BETWEEN 1 AND 5000), date date NOT NULL,
 description text NOT NULL CHECK(length(description) BETWEEN 1 AND 2000), amount_cents bigint NOT NULL CHECK(amount_cents<>0 AND abs(amount_cents)<=999999999999999),
 amount numeric(15,2) GENERATED ALWAYS AS (amount_cents::numeric/100) STORED,
 external_id text, source_identity text NOT NULL, source_key text NOT NULL, content_fingerprint text NOT NULL,
 source jsonb NOT NULL, payment_method text, category_id uuid REFERENCES public.categories(id), subcategory text,
 economic_kind text NOT NULL DEFAULT 'standard' CHECK(economic_kind IN ('standard','transfer','card_payment','investment_principal','refund','loan_principal','owner_contribution','owner_withdrawal')),
 reversal_of uuid REFERENCES public.transactions(id), linked_transaction_id uuid REFERENCES public.transactions(id),
 review_state text NOT NULL DEFAULT 'pending' CHECK(review_state IN ('pending','potential_duplicate','duplicate','posted','voided')),
 duplicate_of uuid REFERENCES public.transactions(id), distinct_confirmed boolean NOT NULL DEFAULT false,
 learn_rule boolean NOT NULL DEFAULT false, transaction_id uuid REFERENCES public.transactions(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(import_id,row_number)
);
CREATE INDEX IF NOT EXISTS import_rows_batch ON public.import_rows(import_id,row_number);
ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.import_rows FROM anon,authenticated;
GRANT SELECT ON public.import_rows TO authenticated;
GRANT ALL ON public.import_rows TO service_role;
DROP POLICY IF EXISTS import_rows_workspace_read ON public.import_rows;
CREATE POLICY import_rows_workspace_read ON public.import_rows FOR SELECT TO authenticated USING(public.can_access_workspace(workspace_id));

-- Storage objects can only be read through the authenticated backend's short-lived URL.
DO $$ BEGIN
 IF to_regclass('storage.buckets') IS NOT NULL THEN
  INSERT INTO storage.buckets(id,name,public,file_size_limit)
   VALUES('financial-imports','financial-imports',false,5242880)
   ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=5242880;
 END IF;
 IF to_regclass('storage.objects') IS NOT NULL THEN
  -- A restrictive policy also defeats an older broad permissive policy without
  -- changing access to any other bucket in the project.
  DROP POLICY IF EXISTS lume_import_sources_private ON storage.objects;
  CREATE POLICY lume_import_sources_private ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated
   USING(bucket_id<>'financial-imports') WITH CHECK(bucket_id<>'financial-imports');
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.reserve_import_job(p_actor uuid,p_id uuid,p_account uuid,p_hash text,p_filename text,p_type text,p_size bigint,p_options jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.accounts; job public.imports; BEGIN
 -- Serializes quota and same-document reservation for this actor, even on multiple API instances.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text,41));
 SELECT * INTO a FROM public.accounts WHERE id=p_account FOR UPDATE;
 IF a.id IS NULL OR NOT public.actor_can_access_workspace(p_actor,a.workspace_id,true) THEN RAISE EXCEPTION 'Conta indisponível para importação'; END IF;
  IF p_type IS NULL OR p_type NOT IN ('csv','ofx','pdf') OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 5242880 OR coalesce(p_hash,'') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Arquivo inválido'; END IF;
 SELECT * INTO job FROM public.imports WHERE account_id=p_account AND document_hash=p_hash;
  IF job.id IS NOT NULL THEN
   IF job.user_id=p_actor AND job.status='failed' AND job.last_error_code IN ('UPLOAD_FAILED','UPLOAD_INTERRUPTED') THEN
    UPDATE public.imports SET status='uploading',parser_options=p_options,last_error_code=null,error_message=null,
     source_deleted_at=null,source_expires_at=now()+interval '30 days',updated_at=now() WHERE id=job.id RETURNING * INTO job;
    RETURN to_jsonb(job)||jsonb_build_object('existing',false,'reupload',true);
   END IF;
   RETURN to_jsonb(job)||jsonb_build_object('existing',true);
  END IF;
 IF (SELECT count(*) FROM public.imports WHERE user_id=p_actor AND status IN ('uploading','queued','processing','needs_review'))>=5 THEN RAISE EXCEPTION 'Há cinco lotes pendentes. Revise ou cancele antes de importar.'; END IF;
 IF (SELECT count(*) FROM public.imports WHERE user_id=p_actor AND created_at>now()-interval '24 hours')>=20 THEN RAISE EXCEPTION 'Limite de 20 importações em 24 horas atingido'; END IF;
 INSERT INTO public.imports(id,user_id,workspace_id,account_id,filename,file_type,status,document_hash,storage_path,file_size,parser_options)
 VALUES(p_id,p_actor,a.workspace_id,p_account,left(p_filename,240),p_type,'uploading',p_hash,a.workspace_id::text||'/'||p_id::text||'/source.'||p_type,p_size,p_options)
 RETURNING * INTO job;
 RETURN to_jsonb(job)||jsonb_build_object('existing',false);
END $$;

CREATE OR REPLACE FUNCTION public.enqueue_import_job(p_actor uuid,p_import uuid)
RETURNS public.imports LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job public.imports; BEGIN
 SELECT * INTO job FROM public.imports WHERE id=p_import FOR UPDATE;
 IF job.id IS NULL OR job.user_id<>p_actor OR NOT public.actor_can_access_workspace(p_actor,job.workspace_id,true) THEN RAISE EXCEPTION 'Importação indisponível'; END IF;
 IF job.status<>'uploading' THEN RAISE EXCEPTION 'Importação já enviada'; END IF;
 UPDATE public.imports SET status='queued',updated_at=now() WHERE id=p_import RETURNING * INTO job;
 RETURN job;
END $$;

CREATE OR REPLACE FUNCTION public.retry_import_job(p_actor uuid,p_import uuid,p_options jsonb DEFAULT '{}')
RETURNS public.imports LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job public.imports; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text,41));
 SELECT * INTO job FROM public.imports WHERE id=p_import FOR UPDATE;
 IF job.id IS NULL OR NOT public.actor_can_access_workspace(p_actor,job.workspace_id,true) THEN RAISE EXCEPTION 'Importação indisponível'; END IF;
 IF job.status NOT IN ('failed','cancelled') OR job.source_deleted_at IS NOT NULL OR job.storage_path IS NULL OR job.source_expires_at<=now()
  OR job.last_error_code IN ('UPLOAD_FAILED','UPLOAD_INTERRUPTED') THEN RAISE EXCEPTION 'Arquivo indisponível para retentativa. Envie o arquivo novamente.'; END IF;
 IF (SELECT count(*) FROM public.imports WHERE user_id=job.user_id AND status IN ('uploading','queued','processing','needs_review'))>=5 THEN RAISE EXCEPTION 'Há cinco lotes pendentes. Revise ou cancele antes de retentar.'; END IF;
 IF EXISTS(SELECT 1 FROM public.import_rows WHERE import_id=job.id) THEN
  UPDATE public.imports SET status='needs_review',lease_token=null,lease_until=null,error_message=null,last_error_code=null,updated_at=now() WHERE id=job.id RETURNING * INTO job;
 ELSE
  IF job.attempts>=3 THEN RAISE EXCEPTION 'Três tentativas esgotadas. Revise o erro e exporte novo arquivo.'; END IF;
  UPDATE public.imports SET status='queued',parser_options=p_options,lease_token=null,lease_until=null,error_message=null,last_error_code=null,
   next_attempt_at=now(),updated_at=now() WHERE id=job.id RETURNING * INTO job;
 END IF;
 RETURN job;
END $$;

CREATE OR REPLACE FUNCTION public.claim_import_job()
RETURNS SETOF public.imports LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job public.imports; BEGIN
 -- Enforces a global cap; SKIP LOCKED alone does not limit the number of active workers.
 PERFORM pg_advisory_xact_lock(71606219);
 UPDATE public.imports SET status='failed',last_error_code='UPLOAD_INTERRUPTED',error_message='Upload interrompido. Reenvie o arquivo.',updated_at=now()
  WHERE status='uploading' AND updated_at<now()-interval '15 minutes';
 UPDATE public.imports SET status='failed',last_error_code='ATTEMPTS_EXHAUSTED',error_message='Processamento interrompido após três tentativas.',lease_token=null,lease_until=null,updated_at=now()
  WHERE status='processing' AND lease_until<now() AND attempts>=3;
 IF (SELECT count(*) FROM public.imports WHERE status='processing' AND lease_until>now())>=2 THEN RETURN; END IF;
 SELECT i.* INTO job FROM public.imports i WHERE
  (i.status='queued' OR (i.status='processing' AND i.lease_until<now())) AND i.attempts<3 AND i.next_attempt_at<=now()
  AND NOT EXISTS(SELECT 1 FROM public.imports active WHERE active.user_id=i.user_id AND active.status='processing' AND active.lease_until>now())
  ORDER BY i.created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF job.id IS NULL THEN RETURN; END IF;
 IF NOT public.actor_can_access_workspace(job.user_id,job.workspace_id,true) THEN
  UPDATE public.imports SET status='failed',last_error_code='ACCESS_REVOKED',error_message='Acesso do autor ao espaço foi revogado.',updated_at=now() WHERE id=job.id;
  RETURN;
 END IF;
 RETURN QUERY UPDATE public.imports SET status='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',updated_at=now(),error_message=null,last_error_code=null WHERE id=job.id RETURNING *;
END $$;

CREATE OR REPLACE FUNCTION public.heartbeat_import_job(p_import uuid,p_lease uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE public.imports SET lease_until=now()+interval '90 seconds',updated_at=now() WHERE id=p_import AND status='processing' AND lease_token=p_lease AND lease_until>now();
 RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.fail_import_job(p_import uuid,p_lease uuid,p_code text,p_message text,p_retry boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE public.imports SET status=CASE WHEN p_retry AND attempts<3 THEN 'queued' ELSE 'failed' END,
  next_attempt_at=now()+make_interval(secs=>least(300,15*attempts)),lease_token=null,lease_until=null,
  last_error_code=left(p_code,80),error_message=left(p_message,1000),updated_at=now()
 WHERE id=p_import AND status='processing' AND lease_token=p_lease;
 RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.stage_import_rows(p_import uuid,p_lease uuid,p_rows jsonb,p_metadata jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job public.imports; item jsonb; key text; existing public.transactions; row_count integer:=0; state text; BEGIN
 SELECT * INTO job FROM public.imports WHERE id=p_import FOR UPDATE;
 IF job.id IS NULL OR job.status<>'processing' OR job.lease_token IS DISTINCT FROM p_lease OR job.lease_until<=now() THEN RAISE EXCEPTION 'Lease expirado'; END IF;
 IF NOT public.actor_can_access_workspace(job.user_id,job.workspace_id,true) THEN RAISE EXCEPTION 'Acesso revogado'; END IF;
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 5000 OR p_metadata->>'document_hash' IS DISTINCT FROM job.document_hash THEN RAISE EXCEPTION 'Extração inválida'; END IF;
 IF EXISTS(SELECT 1 FROM public.import_rows WHERE import_id=p_import) THEN RAISE EXCEPTION 'Lote já possui linhas'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  row_count:=row_count+1;
  IF (item->>'row_number')::integer IS DISTINCT FROM row_count OR coalesce(item->>'source_identity','') !~ '^[a-f0-9]{64}$'
   OR coalesce(item->>'content_fingerprint','') !~ '^[a-f0-9]{64}$' OR jsonb_typeof(item->'source') IS DISTINCT FROM 'object'
   OR coalesce(item->>'amount_cents','') !~ '^-?[0-9]+$' OR length(coalesce(item->>'external_id',''))>256
   OR (item->>'date')::date NOT BETWEEN '1900-01-01'::date AND '2200-12-31'::date THEN RAISE EXCEPTION 'Proveniência inválida'; END IF;
  key:=CASE WHEN nullif(item->>'external_id','') IS NOT NULL
   THEN 'ext:'||encode(digest(coalesce(p_metadata->>'bank_id','')||':'||coalesce(p_metadata->>'account_reference','')||':'||(item->>'external_id'),'sha256'),'hex')
   ELSE 'doc:'||(item->>'source_identity') END;
  SELECT * INTO existing FROM public.transactions WHERE account_id=job.account_id AND source_key=key;
  IF EXISTS(SELECT 1 FROM public.import_rows WHERE import_id=p_import AND source_key=key) THEN RAISE EXCEPTION 'Identificador bancário repetido no arquivo'; END IF;
  IF existing.id IS NOT NULL AND (existing.date<>(item->>'date')::date OR existing.amount<>((item->>'amount_cents')::bigint::numeric/100) OR existing.ledger_status<>'posted' OR NOT existing.is_reconciled OR existing.legacy_needs_review OR existing.content_fingerprint IS DISTINCT FROM item->>'content_fingerprint') THEN
   RAISE EXCEPTION 'Identificador bancário já existe com conteúdo diferente ou anulado. Revise a origem.';
  END IF;
  state:=CASE WHEN existing.id IS NOT NULL THEN 'duplicate' WHEN EXISTS(
   SELECT 1 FROM public.transactions t WHERE t.account_id=job.account_id AND t.date=(item->>'date')::date AND t.amount=((item->>'amount_cents')::bigint::numeric/100) AND t.ledger_status='posted'
   AND (t.content_fingerprint=item->>'content_fingerprint' OR lower(trim(coalesce(t.raw_description,t.description)))=lower(trim(item->>'description')))
  ) THEN 'potential_duplicate' ELSE 'pending' END;
  INSERT INTO public.import_rows(import_id,workspace_id,account_id,row_number,date,description,amount_cents,external_id,source_identity,source_key,content_fingerprint,source,payment_method,review_state,duplicate_of)
   VALUES(job.id,job.workspace_id,job.account_id,row_count,(item->>'date')::date,item->>'description',(item->>'amount_cents')::bigint,item->>'external_id',item->>'source_identity',key,item->>'content_fingerprint',item->'source',item->>'payment_method',state,existing.id);
 END LOOP;
 IF (p_metadata->>'row_count')::integer IS DISTINCT FROM row_count OR (p_metadata->>'sum_cents')::numeric IS DISTINCT FROM (SELECT sum(amount_cents) FROM public.import_rows WHERE import_id=p_import) THEN RAISE EXCEPTION 'Totais da extração não conferem'; END IF;
 UPDATE public.imports SET status='needs_review',total_transactions=row_count,imported_transactions=0,
  duplicates_skipped=(SELECT count(*) FROM public.import_rows WHERE import_id=p_import AND review_state='duplicate'),
  statement_metadata=p_metadata,lease_token=null,lease_until=null,updated_at=now() WHERE id=p_import;
 RETURN jsonb_build_object('status','needs_review','total_transactions',row_count);
END $$;

CREATE OR REPLACE FUNCTION public.update_import_row(p_actor uuid,p_row uuid,p_patch jsonb)
RETURNS public.import_rows LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE row public.import_rows; job public.imports; ref public.transactions; category uuid; BEGIN
 SELECT * INTO row FROM public.import_rows WHERE id=p_row;
 SELECT * INTO job FROM public.imports WHERE id=row.import_id FOR UPDATE;
 SELECT * INTO row FROM public.import_rows WHERE id=p_row FOR UPDATE;
 IF row.id IS NULL OR job.status<>'needs_review' OR NOT public.actor_can_access_workspace(p_actor,row.workspace_id,true) THEN RAISE EXCEPTION 'Linha indisponível para revisão'; END IF;
 IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Revisão inválida'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN ('category_id','subcategory','economic_kind','reversal_of','linked_transaction_id','duplicate_of','distinct_confirmed','learn_rule')) THEN RAISE EXCEPTION 'Campo de origem não pode ser alterado'; END IF;
 category:=CASE WHEN p_patch?'category_id' THEN (p_patch->>'category_id')::uuid ELSE row.category_id END;
 IF category IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.categories c WHERE c.id=category AND (c.workspace_id=row.workspace_id OR(c.is_system AND c.user_id IS NULL AND c.workspace_id IS NULL))) THEN RAISE EXCEPTION 'Categoria indisponível'; END IF;
 IF p_patch?'duplicate_of' AND p_patch->>'duplicate_of' IS NOT NULL THEN
  SELECT * INTO ref FROM public.transactions WHERE id=(p_patch->>'duplicate_of')::uuid;
   IF ref.id IS NULL OR ref.account_id<>row.account_id OR ref.date<>row.date OR ref.amount<>row.amount OR ref.ledger_status<>'posted' OR NOT ref.is_reconciled OR ref.legacy_needs_review THEN RAISE EXCEPTION 'Duplicata deve apontar para o mesmo movimento já registrado e conferido'; END IF;
 END IF;
 UPDATE public.import_rows SET category_id=category,
  subcategory=CASE WHEN p_patch?'subcategory' THEN left(p_patch->>'subcategory',120) ELSE subcategory END,
  economic_kind=CASE WHEN p_patch?'economic_kind' THEN p_patch->>'economic_kind' ELSE economic_kind END,
  reversal_of=CASE WHEN p_patch?'reversal_of' THEN (p_patch->>'reversal_of')::uuid ELSE reversal_of END,
  linked_transaction_id=CASE WHEN p_patch?'linked_transaction_id' THEN (p_patch->>'linked_transaction_id')::uuid ELSE linked_transaction_id END,
  duplicate_of=CASE WHEN p_patch?'duplicate_of' THEN (p_patch->>'duplicate_of')::uuid ELSE duplicate_of END,
  distinct_confirmed=CASE WHEN p_patch?'distinct_confirmed' THEN (p_patch->>'distinct_confirmed')::boolean ELSE distinct_confirmed END,
  review_state=CASE WHEN p_patch->>'duplicate_of' IS NOT NULL THEN 'duplicate' WHEN (p_patch->>'distinct_confirmed')::boolean IS TRUE THEN 'pending' WHEN p_patch?'duplicate_of' AND p_patch->>'duplicate_of' IS NULL THEN 'potential_duplicate' ELSE review_state END,
  learn_rule=CASE WHEN p_patch?'learn_rule' THEN (p_patch->>'learn_rule')::boolean ELSE learn_rule END,updated_at=now()
 WHERE id=p_row RETURNING * INTO row;
 RETURN row;
END $$;

CREATE OR REPLACE FUNCTION public.approve_import_rows(p_actor uuid,p_import uuid,p_ids uuid[],p_balance jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job public.imports; a public.accounts; row public.import_rows; existing public.transactions; ref public.transactions;
 n integer; sum_cents bigint; opening numeric(15,2); closing numeric(15,2); first_day date; last_day date;
 posted integer:=0; duplicates integer:=0; txn uuid; rule_id uuid; transfer_group uuid;
BEGIN
 SELECT * INTO job FROM public.imports WHERE id=p_import FOR UPDATE;
 IF job.id IS NULL OR NOT public.actor_can_access_workspace(p_actor,job.workspace_id,true) THEN RAISE EXCEPTION 'Importação indisponível'; END IF;
 IF job.status='completed' THEN RETURN jsonb_build_object('status','completed','imported',job.imported_transactions,'duplicates',job.duplicates_skipped,'idempotent',true); END IF;
 IF job.status<>'needs_review' THEN RAISE EXCEPTION 'Lote ainda não pode ser aprovado'; END IF;
 SELECT * INTO a FROM public.accounts WHERE id=job.account_id FOR UPDATE;
 SELECT count(*),sum(amount_cents) INTO n,sum_cents FROM public.import_rows WHERE import_id=p_import;
 IF n=0 OR cardinality(p_ids) IS DISTINCT FROM n OR (SELECT count(DISTINCT id) FROM unnest(p_ids) id)<>n
  OR EXISTS(SELECT 1 FROM public.import_rows WHERE import_id=p_import AND NOT(id=ANY(p_ids))) THEN RAISE EXCEPTION 'Selecione explicitamente todas as linhas do lote'; END IF;
 IF (p_balance->>'source_confirmed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Confira o documento e a conta de origem'; END IF;
 IF coalesce(p_balance->>'opening_balance','') !~ '^-?[0-9]+(\.[0-9]{1,2})?$' OR coalesce(p_balance->>'closing_balance','') !~ '^-?[0-9]+(\.[0-9]{1,2})?$' THEN RAISE EXCEPTION 'Informe abertura e fechamento com centavos'; END IF;
 opening:=(p_balance->>'opening_balance')::numeric; closing:=(p_balance->>'closing_balance')::numeric;
 first_day:=(p_balance->>'period_start')::date; last_day:=(p_balance->>'period_end')::date;
 IF first_day IS NULL OR last_day IS NULL OR first_day>last_day OR EXISTS(SELECT 1 FROM public.import_rows WHERE import_id=p_import AND date NOT BETWEEN first_day AND last_day) THEN RAISE EXCEPTION 'Período não cobre todas as linhas'; END IF;
 IF opening+sum_cents::numeric/100<>closing THEN RAISE EXCEPTION 'Abertura + movimentos difere do fechamento. Nenhum lançamento foi aplicado.'; END IF;
 IF job.statement_metadata?'opening_balance' AND (job.statement_metadata->>'opening_balance')::numeric<>opening THEN RAISE EXCEPTION 'Saldo inicial difere do documento'; END IF;
 IF job.statement_metadata?'closing_balance' AND coalesce((job.statement_metadata->>'balance_requires_confirmation')::boolean,false)=false AND (job.statement_metadata->>'closing_balance')::numeric<>closing THEN RAISE EXCEPTION 'Saldo final difere do documento'; END IF;
 FOR row IN SELECT * FROM public.import_rows WHERE import_id=p_import ORDER BY row_number FOR UPDATE LOOP
  IF row.review_state='potential_duplicate' AND NOT row.distinct_confirmed AND row.duplicate_of IS NULL THEN RAISE EXCEPTION 'Resolva todas as possíveis duplicatas antes de aprovar'; END IF;
  SELECT * INTO existing FROM public.transactions WHERE account_id=row.account_id AND source_key=row.source_key;
  IF existing.id IS NOT NULL THEN
   IF existing.date<>row.date OR existing.amount<>row.amount OR existing.ledger_status<>'posted' OR NOT existing.is_reconciled OR existing.legacy_needs_review OR existing.content_fingerprint IS DISTINCT FROM row.content_fingerprint THEN RAISE EXCEPTION 'Identidade de origem conflitante'; END IF;
   UPDATE public.import_rows SET review_state='duplicate',duplicate_of=existing.id,updated_at=now() WHERE id=row.id;
   duplicates:=duplicates+1; CONTINUE;
  END IF;
  IF row.duplicate_of IS NOT NULL THEN
   SELECT * INTO existing FROM public.transactions WHERE id=row.duplicate_of FOR SHARE;
   IF existing.id IS NULL OR existing.account_id<>row.account_id OR existing.date<>row.date OR existing.amount<>row.amount OR existing.ledger_status<>'posted' OR NOT existing.is_reconciled OR existing.legacy_needs_review THEN RAISE EXCEPTION 'Duplicata informada não é mais válida'; END IF;
   UPDATE public.import_rows SET review_state='duplicate',updated_at=now() WHERE id=row.id;
   duplicates:=duplicates+1; CONTINUE;
  END IF;
  -- Another batch may have been approved since this batch was extracted.
  IF NOT row.distinct_confirmed AND EXISTS(SELECT 1 FROM public.transactions t WHERE t.account_id=row.account_id AND t.date=row.date AND t.amount=row.amount AND t.ledger_status='posted' AND t.import_id IS DISTINCT FROM p_import AND (t.content_fingerprint=row.content_fingerprint OR lower(trim(coalesce(t.raw_description,t.description)))=lower(trim(row.description)))) THEN RAISE EXCEPTION 'Possível duplicata surgiu após extração. Revise novamente.'; END IF;
  transfer_group:=null;
  IF row.economic_kind IN ('transfer','card_payment') THEN
   SELECT * INTO ref FROM public.transactions WHERE id=row.linked_transaction_id FOR UPDATE;
   IF ref.id IS NULL OR ref.workspace_id<>row.workspace_id OR ref.account_id=row.account_id OR ref.amount<>-row.amount OR ref.ledger_status<>'posted' OR NOT ref.is_reconciled OR ref.legacy_needs_review OR ref.linked_transaction_id IS NOT NULL OR ref.transfer_group_id IS NOT NULL OR ref.reversal_of IS NOT NULL OR ref.economic_kind<>'standard' OR abs(ref.date-row.date)>3
    OR EXISTS(SELECT 1 FROM public.transactions t WHERE t.reversal_of=ref.id AND t.ledger_status='posted') THEN RAISE EXCEPTION 'Movimentação interna exige contrapartida autorizada, conferida, sem vínculos, de mesmo valor, sinal oposto e data próxima'; END IF;
   IF row.economic_kind='card_payment' AND a.type<>'credit_card' AND NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=ref.account_id AND type='credit_card') THEN RAISE EXCEPTION 'Pagamento de cartão exige conta de cartão'; END IF;
   transfer_group:=gen_random_uuid();
  ELSIF row.linked_transaction_id IS NOT NULL THEN RAISE EXCEPTION 'Contrapartida só se aplica a transferência ou pagamento de cartão'; END IF;
  IF row.economic_kind='refund' THEN
   SELECT * INTO ref FROM public.transactions WHERE id=row.reversal_of FOR UPDATE;
   IF ref.id IS NULL OR ref.workspace_id<>row.workspace_id OR ref.account_id<>row.account_id OR ref.amount*row.amount>=0 OR ref.ledger_status<>'posted' OR NOT ref.is_reconciled OR ref.legacy_needs_review OR ref.economic_kind<>'standard' OR ref.is_internal_transfer OR ref.type NOT IN ('income','expense') THEN RAISE EXCEPTION 'Estorno exige transação original válida, conferida e da mesma conta'; END IF;
  ELSIF row.reversal_of IS NOT NULL THEN RAISE EXCEPTION 'Referência de estorno só se aplica à natureza estorno'; END IF;
  INSERT INTO public.transactions(user_id,workspace_id,account_id,family_id,member_id,category_id,subcategory,description,raw_description,amount,type,economic_kind,date,payment_method,account_type,origin,is_internal_transfer,linked_transaction_id,reversal_of,source_key,external_id,content_fingerprint,import_hash,import_id,is_confirmed,is_reconciled,ledger_status,reviewed_by,reviewed_at)
   VALUES(job.user_id,row.workspace_id,row.account_id,a.family_id,p_actor,row.category_id,row.subcategory,row.description,row.description,row.amount,
   CASE WHEN row.economic_kind IN ('transfer','card_payment') THEN 'transfer' WHEN row.amount<0 THEN 'expense' ELSE 'income' END,
   row.economic_kind,row.date,row.payment_method,a.account_type,'import',row.economic_kind IN ('transfer','card_payment'),row.linked_transaction_id,row.reversal_of,row.source_key,row.external_id,row.content_fingerprint,row.source_identity,p_import,true,true,'posted',p_actor,now()) RETURNING id INTO txn;
  IF row.linked_transaction_id IS NOT NULL THEN
   UPDATE public.transactions SET transfer_group_id=transfer_group WHERE id=txn;
   UPDATE public.transactions SET linked_transaction_id=txn,transfer_group_id=transfer_group,economic_kind=row.economic_kind,type='transfer',is_internal_transfer=true WHERE id=row.linked_transaction_id;
  END IF;
  UPDATE public.import_rows SET review_state='posted',transaction_id=txn,updated_at=now() WHERE id=row.id;
  posted:=posted+1;
  IF row.learn_rule AND row.category_id IS NOT NULL THEN
   SELECT id INTO rule_id FROM public.ai_rules WHERE user_id=p_actor AND workspace_id=row.workspace_id AND keyword=lower(trim(row.description)) ORDER BY created_at LIMIT 1 FOR UPDATE;
   IF rule_id IS NOT NULL THEN UPDATE public.ai_rules SET category_id=row.category_id,subcategory=row.subcategory,is_active=true,usage_count=coalesce(usage_count,0)+1 WHERE id=rule_id;
   ELSE INSERT INTO public.ai_rules(user_id,workspace_id,keyword,category_id,subcategory,is_active,usage_count) VALUES(p_actor,row.workspace_id,lower(trim(row.description)),row.category_id,row.subcategory,true,1); END IF;
  END IF;
 END LOOP;
 UPDATE public.imports SET status='completed',imported_transactions=posted,duplicates_skipped=duplicates,balance_check=p_balance,approved_by=p_actor,approved_at=now(),updated_at=now() WHERE id=p_import;
 UPDATE public.profiles SET needs_insight_recalc=true WHERE id IN(SELECT user_id FROM public.workspace_members WHERE workspace_id=job.workspace_id);
 INSERT INTO public.audit_log(user_id,action,details) VALUES(p_actor,'import_approved',jsonb_build_object('import_id',p_import,'posted',posted,'duplicates',duplicates,'balance_check',p_balance));
 RETURN jsonb_build_object('status','completed','imported',posted,'duplicates',duplicates);
END $$;

CREATE OR REPLACE FUNCTION public.reverse_import_job(p_actor uuid,p_import uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job public.imports; n integer; BEGIN
 SELECT * INTO job FROM public.imports WHERE id=p_import FOR UPDATE;
 IF job.id IS NULL OR NOT public.actor_can_access_workspace(p_actor,job.workspace_id,true) THEN RAISE EXCEPTION 'Importação indisponível'; END IF;
 IF job.status='reversed' THEN RETURN jsonb_build_object('status','reversed','idempotent',true); END IF;
 IF job.status<>'completed' OR length(trim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Informe motivo para reverter um lote concluído'; END IF;
 PERFORM 1 FROM public.accounts WHERE id=job.account_id FOR UPDATE;
 PERFORM 1 FROM public.transactions WHERE import_id=p_import ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.transactions t WHERE t.import_id=p_import AND t.ledger_status='posted' AND (t.linked_transaction_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.transactions ref WHERE ref.ledger_status='posted' AND (ref.reversal_of=t.id OR ref.linked_transaction_id=t.id))))
 OR EXISTS(SELECT 1 FROM public.recurring_occurrences o JOIN public.transactions t ON t.id=o.transaction_id WHERE t.import_id=p_import)
 THEN RAISE EXCEPTION 'Desfaça vínculos e conciliações dependentes antes de reverter o lote'; END IF;
 UPDATE public.transactions SET ledger_status='voided',notes=concat_ws(E'\n',notes,'Lote revertido: '||left(p_reason,500)) WHERE import_id=p_import AND ledger_status='posted';
 GET DIAGNOSTICS n=ROW_COUNT;
 UPDATE public.import_rows SET review_state='voided',updated_at=now() WHERE import_id=p_import AND review_state='posted';
 UPDATE public.imports SET status='reversed',updated_at=now() WHERE id=p_import;
 UPDATE public.profiles SET needs_insight_recalc=true WHERE id IN(SELECT user_id FROM public.workspace_members WHERE workspace_id=job.workspace_id);
 INSERT INTO public.audit_log(user_id,action,details) VALUES(p_actor,'import_reversed',jsonb_build_object('import_id',p_import,'voided',n,'reason',left(p_reason,500)));
 RETURN jsonb_build_object('status','reversed','voided',n);
END $$;

-- No caller-controlled actor argument is exposed to public PostgREST roles.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN
 ('reserve_import_job','enqueue_import_job','retry_import_job','claim_import_job','heartbeat_import_job','fail_import_job','stage_import_rows','update_import_row','approve_import_rows','reverse_import_job') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
COMMIT;

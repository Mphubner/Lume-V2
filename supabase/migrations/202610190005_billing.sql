BEGIN;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_check;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS event_created bigint NOT NULL DEFAULT 0;
CREATE TABLE public.checkout_intents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.profiles(id),
 plan_id text NOT NULL REFERENCES public.plans(id),request_key uuid NOT NULL,
 price_id text NOT NULL,amount numeric(10,2) NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','open','unknown','completed','expired')),
 provider_session_id text UNIQUE,checkout_url text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,request_key)
);
CREATE UNIQUE INDEX checkout_one_pending ON public.checkout_intents(user_id) WHERE status IN ('pending','open','unknown');
ALTER TABLE public.checkout_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkout_intents FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.checkout_intents TO service_role;
CREATE FUNCTION public.begin_checkout(p_user_id uuid,p_plan_id text,p_request_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE i public.checkout_intents; p public.plans; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('checkout:'||p_user_id::text,0));
 SELECT * INTO i FROM public.checkout_intents WHERE user_id=p_user_id AND request_key=p_request_key;
 IF FOUND THEN
  IF i.plan_id<>p_plan_id THEN RAISE EXCEPTION 'Chave já usada para outro plano'; END IF;
  RETURN to_jsonb(i);
 END IF;
 IF EXISTS(SELECT 1 FROM public.subscriptions WHERE user_id=p_user_id AND status NOT IN ('canceled','incomplete_expired')) THEN RAISE EXCEPTION 'Uma assinatura já existe. Use o portal para gerenciá-la.'; END IF;
 SELECT * INTO i FROM public.checkout_intents WHERE user_id=p_user_id AND status IN ('pending','open','unknown');
 IF FOUND THEN RAISE EXCEPTION 'Há uma solicitação de cobrança pendente. Retome a solicitação anterior.'; END IF;
 SELECT * INTO p FROM public.plans WHERE id=p_plan_id AND is_active AND interval='month' AND stripe_price_id IS NOT NULL AND price>0;
 IF NOT FOUND THEN RAISE EXCEPTION 'Plano indisponível para cobrança'; END IF;
 INSERT INTO public.checkout_intents(user_id,plan_id,request_key,price_id,amount) VALUES(p_user_id,p.id,p_request_key,p.stripe_price_id,p.price) RETURNING * INTO i;
 RETURN to_jsonb(i);
END $$;
-- Signature verification and current provider retrieval occur before this atomic handler.
CREATE FUNCTION public.apply_subscription_event(p_event_id text,p_type text,p_created bigint,p_intent_id uuid,p_subscription jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE i public.checkout_intents; s public.subscriptions; uid uuid; pid text; st text; BEGIN
 INSERT INTO public.payment_events(id,type,payload,status,attempts) VALUES(p_event_id,p_type,jsonb_build_object('subscription_id',p_subscription->>'id'),'processing',1) ON CONFLICT(id) DO NOTHING;
 PERFORM 1 FROM public.payment_events WHERE id=p_event_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.payment_events WHERE id=p_event_id AND status='completed') THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('subscription:'||(p_subscription->>'id'),0));
 SELECT * INTO s FROM public.subscriptions WHERE stripe_subscription_id=p_subscription->>'id' FOR UPDATE;
 SELECT * INTO i FROM public.checkout_intents WHERE id=p_intent_id FOR UPDATE;
 uid:=coalesce(s.user_id,i.user_id); pid:=coalesce(s.plan_id,i.plan_id); st:=p_subscription->>'status';
 IF uid IS NULL OR pid IS NULL OR st NOT IN ('active','trialing','past_due','unpaid','canceled','incomplete','incomplete_expired','paused') THEN RAISE EXCEPTION 'Assinatura sem intenção ou estado reconhecido'; END IF;
 IF s.id IS NOT NULL AND i.id IS NOT NULL AND (s.user_id<>i.user_id OR s.plan_id<>i.plan_id) THEN RAISE EXCEPTION 'Assinatura não corresponde à intenção'; END IF;
 IF i.id IS NOT NULL AND p_subscription->>'price_id' IS DISTINCT FROM i.price_id THEN RAISE EXCEPTION 'Preço não corresponde à intenção'; END IF;
 IF s.id IS NULL OR s.event_created<=p_created THEN
  INSERT INTO public.subscriptions(user_id,plan_id,stripe_subscription_id,stripe_customer_id,status,current_period_start,current_period_end,cancel_at_period_end,event_created)
  VALUES(uid,pid,p_subscription->>'id',p_subscription->>'customer',st,(p_subscription->>'current_period_start')::timestamptz,(p_subscription->>'current_period_end')::timestamptz,coalesce((p_subscription->>'cancel_at_period_end')::boolean,false),p_created)
  ON CONFLICT(stripe_subscription_id) DO UPDATE SET status=excluded.status,current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,event_created=excluded.event_created;
  UPDATE public.profiles SET plan=pid,plan_status=CASE WHEN st IN ('active','trialing') THEN 'active' WHEN st IN ('canceled','incomplete_expired') THEN 'cancelled' ELSE 'inactive' END WHERE id=uid;
 END IF;
 UPDATE public.checkout_intents SET status='completed',updated_at=now() WHERE id=i.id;
 UPDATE public.payment_events SET status='completed',processed_at=now(),last_error=NULL WHERE id=p_event_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.begin_checkout(uuid,text,uuid),public.apply_subscription_event(text,text,bigint,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_checkout(uuid,text,uuid),public.apply_subscription_event(text,text,bigint,uuid,jsonb) TO service_role;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS source_key text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id);
CREATE UNIQUE INDEX notification_source_unique ON public.notifications(user_id,source_key) WHERE source_key IS NOT NULL;
COMMIT;

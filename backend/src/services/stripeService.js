import Stripe from 'stripe';
import 'dotenv/config';
import { HTTPError } from './access.js';
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 20000, maxNetworkRetries: 1 }) : null;
export function billingOrigin() {
  const url = new URL((process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim());
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new HTTPError(503, 'Endereço de cobrança não configurado.');
  return url.origin;
}
export function normalizeSubscription(sub) {
  if (!sub?.id || sub.items?.data?.length !== 1) throw new HTTPError(409, 'Assinatura exige conciliação manual.');
  const item = sub.items.data[0];
  const iso = value => value ? new Date(value * 1000).toISOString() : null;
  return { id: sub.id, customer: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
    status: sub.status, price_id: item.price.id,
    current_period_start: iso(item.current_period_start ?? sub.current_period_start),
    current_period_end: iso(item.current_period_end ?? sub.current_period_end),
    cancel_at_period_end: Boolean(sub.cancel_at_period_end) };
}

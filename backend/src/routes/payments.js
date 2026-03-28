import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import * as stripeService from '../services/stripeService.js';
// import * as pagarmeService from '../services/pagarmeService.js'; // To be integrated

const router = Router();

// =========================================
// 1. Create Subscription
// =========================================
router.post('/create-subscription', authMiddleware, async (req, res) => {
  try {
    const { planId, paymentMethodId, gateway = 'stripe' } = req.body;
    const { user } = req;

    if (!paymentMethodId) {
      return res.status(400).json({ error: 'Método de pagamento não fornecido' });
    }

    // Get gateway config from platform settings
    const { data: settings } = await supabase.from('platform_settings').select('key, value');
    const getSetting = (k) => settings?.find(s => s.key === k)?.value;

    const activeGateway = getSetting('payment_gateway') || 'stripe';
    if (gateway !== activeGateway) {
      return res.status(400).json({ error: 'Gateway de pagamento inválido ou desativado' });
    }

    // Get Price ID for the chosen plan
    const priceIdKey = planId === 'family' ? 'stripe_price_family' : 'stripe_price_individual';
    const priceId = getSetting(priceIdKey) || process.env[priceIdKey.toUpperCase()];

    if (!priceId && activeGateway === 'stripe') {
      return res.status(500).json({ error: 'Planos não configurados no painel.' });
    }

    let subscription;
    let customerId;

    if (activeGateway === 'stripe') {
      // 1. Create or get Customer
      const customer = await stripeService.createCustomer(user.email, user.full_name || user.email, {
        userId: user.id
      });
      customerId = customer.id;

      // 2. Create Subscription
      subscription = await stripeService.createSubscription(customerId, priceId, paymentMethodId);
    } else {
      // return pagarme logic
      return res.status(501).json({ error: 'Pagar.me não implementado ainda' });
    }

    // 3. Save to database (subscriptions table)
    await supabase.from('subscriptions').insert({
      user_id: user.id,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      plan: planId,
      status: subscription.status,
    });

    // 4. Update Profile
    await supabase.from('profiles').update({
      plan: planId,
      plan_status: subscription.status === 'active' || subscription.status === 'trialing' ? 'active' : 'pending',
      plan_started_at: new Date().toISOString()
    }).eq('id', user.id);

    // Return the client secret to the frontend so it can confirm the payment if 3D Secure is required
    const clientSecret = subscription.latest_invoice?.payment_intent?.client_secret;

    res.json({ success: true, status: subscription.status, clientSecret });
  } catch (error) {
    console.error('Create subscription error:', error);
    res.status(500).json({ error: error.message || 'Erro ao processar pagamento' });
  }
});

// =========================================
// 2. Cancel Subscription
// =========================================
router.post('/cancel', authMiddleware, async (req, res) => {
  try {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id, plan')
      .eq('user_id', req.user.id)
      .eq('status', 'active')
      .single();

    if (!sub || !sub.stripe_subscription_id) {
      return res.status(404).json({ error: 'Assinatura não encontrada' });
    }

    await stripeService.cancelSubscription(sub.stripe_subscription_id);

    // Note: status updates happen via webhook, but we mark cancel_at here
    await supabase.from('subscriptions').update({ status: 'canceling' }).eq('user_id', req.user.id);

    res.json({ success: true, message: 'Assinatura cancelada com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =========================================
// 3. Webhooks (No auth middleware, uses raw body)
// =========================================
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripeService.constructWebhookEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('⚠️  Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  try {
    const data = event.data.object;
    
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const status = data.status; // active, past_due, canceled, trialing
        const subId = data.id;
        
        // Update subscription record
        await supabase.from('subscriptions')
          .update({ 
            status,
            current_period_start: new Date(data.current_period_start * 1000).toISOString(),
            current_period_end: new Date(data.current_period_end * 1000).toISOString(),
          })
          .eq('stripe_subscription_id', subId);

        // Update profile plan status
        const { data: dbSub } = await supabase.from('subscriptions').select('user_id').eq('stripe_subscription_id', subId).single();
        if (dbSub) {
          const profileStatus = status === 'active' || status === 'trialing' ? 'active' : status === 'past_due' ? 'inactive' : 'cancelled';
          await supabase.from('profiles').update({ plan_status: profileStatus }).eq('id', dbSub.user_id);
        }
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subId = data.id;
        await supabase.from('subscriptions').update({ status: 'canceled' }).eq('stripe_subscription_id', subId);
        
        const { data: dbSub } = await supabase.from('subscriptions').select('user_id').eq('stripe_subscription_id', subId).single();
        if (dbSub) {
          await supabase.from('profiles').update({ plan_status: 'cancelled', plan: 'free' }).eq('id', dbSub.user_id);
        }
        break;
      }
      
      case 'invoice.payment_failed': {
        const subId = data.subscription;
        // The subscription status will also update to 'past_due', but we could trigger an email here
        // EmailService.sendPaymentFailedEmail(...)
        console.log('Payment failed for subscription:', subId);
        break;
      }
      
      case 'invoice.payment_succeeded': {
        // Trigger generic success email or unlock features
        break;
      }
      
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    res.status(500).send('Webhook handler error');
  }
});

export default router;

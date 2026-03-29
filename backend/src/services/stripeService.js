import Stripe from 'stripe';
import dotenv from 'dotenv';
dotenv.config();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
export const stripe = stripeSecretKey ? new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' }) : null;

export const createCustomer = async (email, name, metadata = {}) => {
  if (!stripe) throw new Error('Stripe not configured');
  
  // Check if customer exists
  const existingCustomers = await stripe.customers.list({ email, limit: 1 });
  if (existingCustomers.data.length > 0) {
    return existingCustomers.data[0];
  }

  // Create new customer
  return stripe.customers.create({
    email,
    name,
    metadata,
  });
};

export const createProductAndPrice = async (name, amount, interval = 'month') => {
  if (!stripe) throw new Error('Stripe not configured');
  
  // Create product
  const product = await stripe.products.create({
    name,
    description: `Plano ${name} da Lume`,
  });

  // Create price
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: Math.round(amount * 100), // Stripe expects cents
    currency: 'brl',
    recurring: { interval },
  });

  return { productId: product.id, priceId: price.id };
};

export const createSubscription = async (customerId, priceId, paymentMethodId) => {
  if (!stripe) throw new Error('Stripe not configured');

  // Attach payment method to customer
  await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });

  // Set it as default for invoices
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  // Create the subscription
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    expand: ['latest_invoice.payment_intent'],
  });

  return subscription;
};

export const cancelSubscription = async (subscriptionId) => {
  if (!stripe) throw new Error('Stripe not configured');
  // Cancels at the end of the current billing period
  return stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
};

export const getSubscription = async (subscriptionId) => {
  if (!stripe) throw new Error('Stripe not configured');
  return stripe.subscriptions.retrieve(subscriptionId);
};

export const constructWebhookEvent = (body, signature, secret) => {
  if (!stripe) throw new Error('Stripe not configured');
  return stripe.webhooks.constructEvent(body, signature, secret);
};

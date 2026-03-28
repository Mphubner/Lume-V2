import dotenv from 'dotenv';
dotenv.config();

// Stub for Pagar.me API integration
const pagarmeKey = process.env.PAGARME_SECRET_KEY;

export const createCustomer = async (email, name, metadata = {}) => {
  if (!pagarmeKey) throw new Error('Pagar.me not configured');
  // TODO: Implement Pagar.me customer creation API
  // return await fetch('https://api.pagar.me/core/v5/customers', { ... })
  throw new Error('Pagar.me implementation pending');
};

export const createSubscription = async (customerId, priceId, paymentMethodId) => {
  if (!pagarmeKey) throw new Error('Pagar.me not configured');
  // TODO: Implement Pagar.me subscription creation API
  throw new Error('Pagar.me implementation pending');
};

export const cancelSubscription = async (subscriptionId) => {
  if (!pagarmeKey) throw new Error('Pagar.me not configured');
  // TODO: Implement Pagar.me cancellation
  throw new Error('Pagar.me implementation pending');
};

export const getSubscription = async (subscriptionId) => {
  if (!pagarmeKey) throw new Error('Pagar.me not configured');
  // TODO: Implement Pagar.me retrieval
  throw new Error('Pagar.me implementation pending');
};

export const verifyWebhookSignature = (body, signature, secret) => {
  if (!pagarmeKey) throw new Error('Pagar.me not configured');
  // TODO: Verify Pagar.me signature via crypto module
  throw new Error('Pagar.me implementation pending');
};

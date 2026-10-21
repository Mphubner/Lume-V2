import api from './api';

class PaymentService {
  async createSubscription(planId, paymentMethodId, billingCycle) {
    return api.request('/payments/create-subscription', {
      method: 'POST',
      body: { planId, paymentMethodId, billingCycle, gateway: 'stripe' },
    });
  }

  async cancelSubscription() {
    return api.request('/payments/cancel', {
      method: 'POST',
    });
  }
}

export const paymentService = new PaymentService();
export default paymentService;

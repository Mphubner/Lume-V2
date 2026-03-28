import api from './api';

class PaymentService {
  async createSubscription(planId, paymentMethodId) {
    return api.request('/payments/create-subscription', {
      method: 'POST',
      body: { planId, paymentMethodId, gateway: 'stripe' },
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

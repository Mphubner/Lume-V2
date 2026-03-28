import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useAuth } from '../../context/AuthContext';
import paymentService from '../../services/paymentService';
import { ShieldCheck, CheckCircle, ArrowLeft } from 'lucide-react';

// Load Stripe (ensure env var exists)
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || 'pk_test_dummy');

const PLANS = {
  individual: { name: 'Individual', price: 19.90, period: '/mês', icon: '💎' },
  family: { name: 'Família', price: 39.90, period: '/mês', icon: '👨‍👩‍👧‍👦' },
};

function CheckoutForm({ planId }) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const plan = PLANS[planId];

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!stripe || !elements || !planId) return;

    setLoading(true);
    setError(null);

    try {
      // 1. Create Payment Method via Stripe Elements
      const cardElement = elements.getElement(CardElement);
      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
        billing_details: {
          email: user.email,
          name: user.user_metadata?.full_name || '',
        },
      });

      if (pmError) throw new Error(pmError.message);

      // 2. Call backend to create Subscription
      const res = await paymentService.createSubscription(planId, paymentMethod.id);

      // 3. Handle 3D Secure / SCA if required
      if (res.status === 'incomplete' && res.clientSecret) {
        const { paymentIntent, error: confirmError } = await stripe.confirmCardPayment(res.clientSecret);
        if (confirmError) throw new Error(confirmError.message);
        if (paymentIntent.status !== 'succeeded') throw new Error('Pagamento não autorizado.');
      }

      setSuccess(true);
      await refreshProfile();
      setTimeout(() => navigate('/dashboard'), 3000);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Ocorreu um erro ao processar seu pagamento.');
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <CheckCircle size={64} style={{ fill: 'var(--color-success)', color: 'var(--bg-card)', margin: '0 auto 1.5rem' }} />
        <h2>Assinatura confirmada!</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Tudo certo. Redirecionando você para o dashboard...
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form" style={{ marginTop: '1rem' }}>
      <div className="checkout-summary" style={{ background: 'var(--bg-input)', padding: '1.5rem', borderRadius: '12px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '2rem' }}>{plan?.icon}</span>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Plano {plan?.name}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Faturamento anual não compromete seu limite</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--accent-gold)' }}>R$ {plan?.price?.toFixed(2).replace('.', ',')}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{plan?.period}</div>
        </div>
      </div>

      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Dados do cartão</label>
      <div className="auth-field" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1rem' }}>
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#f8fafc',
                fontFamily: 'Inter, sans-serif',
                '::placeholder': { color: '#64748b' },
                iconColor: '#d4a843',
              },
              invalid: { color: '#f43f5e', iconColor: '#f43f5e' },
            },
            hidePostalCode: true,
          }}
        />
      </div>

      {error && <div className="auth-error" style={{ marginTop: '1rem' }}>{error}</div>}

      <div style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
        <ShieldCheck size={16} /> Pagamento 100% seguro via Stripe
      </div>

      <button type="submit" className="auth-submit-btn" disabled={!stripe || loading} style={{ marginTop: '1rem' }}>
        {loading ? <span className="spinner" style={{ width: 20, height: 20 }} /> : `Assinar Plano ${plan?.name}`}
      </button>
      
      <div style={{ textAlign: 'center', marginTop: '1rem' }}>
        <button type="button" onClick={() => navigate('/dashboard')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline' }}>
          Pular por enquanto / Teste 14 dias grátis
        </button>
      </div>
    </form>
  );
}

export default function CheckoutPage() {
  const location = useLocation();
  const planId = new URLSearchParams(location.search).get('plan') || 'individual';

  return (
    <div className="auth-page">
      <div className="auth-bg-pattern" />
      <div className="auth-container auth-container-centered" style={{ maxWidth: '520px' }}>
        <div className="auth-form-panel" style={{ padding: '2.5rem' }}>
          <div className="auth-form-wrapper" style={{ maxWidth: '100%' }}>
            
            <Link to="/onboarding" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
              <ArrowLeft size={16} /> Voltar para os planos
            </Link>

            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Finalizar Assinatura</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              Insira seus dados para ativar o plano e começar a usar o Lume com todos os recursos.
            </p>

            <Elements stripe={stripePromise}>
              <CheckoutForm planId={planId} />
            </Elements>

          </div>
        </div>
      </div>
    </div>
  );
}

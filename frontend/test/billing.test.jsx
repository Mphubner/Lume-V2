import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CheckoutPage from '../src/pages/auth/CheckoutPage';
import SubscriptionSettings from '../src/components/ui/SubscriptionSettings';
import api from '../src/services/api';
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'marcos' } }) }));
vi.mock('../src/services/api', () => ({ default: { request: vi.fn() } }));
const catalog = { billing_enabled: true, plans: [{ id: 'family', name: 'Família', price: 20, billing_cycle: 'month', features: [] }] };
const checkoutRequests = () => api.request.mock.calls.filter(([path]) => path === '/payments/create-subscription');
function checkoutView() { return render(<MemoryRouter initialEntries={['/checkout?plan=family']}><Routes><Route path="/checkout" element={<CheckoutPage />} /><Route path="/configuracoes" element={<p>Consultar assinatura confirmada</p>} /></Routes></MemoryRouter>); }
describe('Cobrança: idempotência e confirmação do provedor', () => {
  beforeEach(() => { sessionStorage.clear(); vi.spyOn(window, 'confirm').mockReturnValue(true); });
  it('reutiliza a mesma chave de checkout após resultado incerto', async () => {
    api.request.mockImplementation(async path => { if (path === '/plans') return catalog; throw new Error('Resposta de cobrança indisponível'); });
    checkoutView(); fireEvent.click(await screen.findByRole('button', { name: 'Continuar para pagamento' }));
    await screen.findByText('Resposta de cobrança indisponível');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar para pagamento' }));
    await waitFor(() => expect(checkoutRequests()).toHaveLength(2));
    expect(checkoutRequests()[0][1].body.idempotencyKey).toBe(checkoutRequests()[1][1].body.idempotencyKey);
  });
  it('permite nova chave somente após expiração comprovada pelo serviço', async () => {
    api.request.mockImplementation(async path => { if (path === '/plans') return catalog; const error = new Error('Checkout expirado'); error.code = 'checkout_expired'; throw error; });
    checkoutView(); fireEvent.click(await screen.findByRole('button', { name: 'Continuar para pagamento' }));
    await screen.findByText('Checkout expirado');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar para pagamento' }));
    await waitFor(() => expect(checkoutRequests()).toHaveLength(2));
    expect(checkoutRequests()[0][1].body.idempotencyKey).not.toBe(checkoutRequests()[1][1].body.idempotencyKey);
  });
  it('checkout já concluído direciona para consultar assinatura sem cobrar de novo', async () => {
    api.request.mockImplementation(async path => { if (path === '/plans') return catalog; const error = new Error('Checkout concluído'); error.code = 'checkout_completed'; throw error; });
    checkoutView(); fireEvent.click(await screen.findByRole('button', { name: 'Continuar para pagamento' }));
    await screen.findByText('Consultar assinatura confirmada'); expect(checkoutRequests()).toHaveLength(1);
  });
  it('cancelamento usa endpoint real e só mostra agendamento confirmado', async () => {
    let canceled = false;
    api.request.mockImplementation(async path => {
      if (path === '/plans') return { ...catalog, billing_enabled: false };
      if (path === '/payments/subscription') return { plan_id: 'family', status: 'active', cancel_at_period_end: canceled, current_period_end: '2026-11-01T00:00:00Z' };
      if (path === '/payments/cancel') { canceled = true; return { message: 'Solicitação aceita pelo provedor' }; }
      throw new Error(`Unexpected endpoint ${path}`);
    });
    render(<MemoryRouter><SubscriptionSettings /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar assinatura' }));
    await screen.findByText('Cancelamento agendado para o fim do período pago.');
    expect(api.request).toHaveBeenCalledWith('/payments/cancel', { method: 'POST' });
    expect(screen.getByRole('button', { name: 'Cancelar assinatura' }).disabled).toBe(true);
  });
});

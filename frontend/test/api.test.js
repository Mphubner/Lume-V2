import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import api from '../src/services/api';
import { queryClient } from '../src/services/queryClient';
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
describe('API: escopo, identidade e erros verificáveis', () => {
  beforeEach(() => { api.sessionId = 'session-A'; api.workspace = 'all'; api.token = 'test-token'; vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ok: true }))); vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { vi.unstubAllGlobals(); queryClient.clear(); });
  it('envia contexto consolidado explicitamente em dashboard e notificações', async () => {
    await api.getDashboard(); await api.request('/notifications');
    for (const [url] of fetch.mock.calls) expect(new URL(url).searchParams.get('workspace')).toBe('all');
  });
  it('mantém o escopo escolhido e não acrescenta campos proibidos à edição de linha', async () => {
    api.workspace = 'family-A';
    await api.request('/import/rows/row-A', { method: 'PATCH', body: { distinct_confirmed: true } });
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get('workspace')).toBe('family-A');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ distinct_confirmed: true });
  });
  it('não envia contexto financeiro aos contratos públicos ou cobrança', async () => {
    await api.request('/plans'); await api.request('/payments/create-subscription', { method: 'POST', body: { planId: 'pilot', idempotencyKey: 'key' } });
    expect(fetch.mock.calls.every(([url]) => !new URL(url).searchParams.has('workspace'))).toBe(true);
  });
  it.each(['session', 'workspace'])('descarta resposta atrasada após alteração de %s', async change => {
    let complete;
    fetch.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const pending = api.getDashboard();
    if (change === 'session') api.sessionId = 'session-B'; else api.workspace = 'family-B';
    complete(response({ stats: { balance: 999999 } }));
    await expect(pending).rejects.toThrow('Sessão alterada');
  });
  it('preserva o código de intenção encerrada sem tratá-la como pagamento confirmado', async () => {
    fetch.mockResolvedValueOnce(response({ error: 'Checkout expirado', code: 'checkout_expired' }, 409));
    await expect(api.request('/payments/create-subscription', { method: 'POST', body: {} })).rejects.toMatchObject({ message: 'Checkout expirado', code: 'checkout_expired', status: 409 });
  });
  it('propaga indisponibilidade em vez de inventar dados financeiros', async () => {
    fetch.mockResolvedValueOnce(response({ error: 'Serviço indisponível' }, 503));
    const event = vi.fn(); window.addEventListener('lume:api-error', event);
    await expect(api.getDashboard()).rejects.toThrow('Serviço indisponível');
    expect(event).toHaveBeenCalledOnce(); window.removeEventListener('lume:api-error', event);
  });
});

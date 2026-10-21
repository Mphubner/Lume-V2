import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDescription, suggestTransactionCategory, suggestTransactionCategories } from '../src/domain/categorization.js';

const workspaceId = 'workspace-a';
const category = (id, name, type = 'expense', extra = {}) => ({ id, name, type, workspace_id: null, user_id: null, is_system: true, ...extra });
const categories = [
  category('food', 'Alimentação', 'expense', { subcategories: ['Supermercado', 'Restaurantes', 'Delivery'] }),
  category('transport', 'Transporte', 'expense', { subcategories: ['Aplicativos', 'Combustível'] }),
  category('health', 'Saúde', 'expense', { subcategories: ['Farmácia', 'Consultas'] }),
  category('bills', 'Contas e Serviços', 'expense', { subcategories: ['Energia elétrica', 'Telefone', 'Internet'] }),
  category('education', 'Educação'), category('leisure', 'Lazer'), category('salary', 'Salário', 'income'),
  category('other', 'Outros', 'both'), category('investment', 'Investimentos', 'income'),
];
const transaction = (description, extra = {}) => ({ description, amount_cents: '-2050', workspace_id: workspaceId, ...extra });
function suggest(description, extra = {}) {
  return suggestTransactionCategory({ transaction: transaction(description), workspaceId, categories, ...extra });
}
function rule(keyword, categoryId, extra = {}) {
  return { id: `rule-${keyword}`, keyword, category_id: categoryId, workspace_id: workspaceId, is_active: true, ...extra };
}
function reviewed(id, description, categoryId = 'food', extra = {}) {
  return { id, description, category_id: categoryId, workspace_id: workspaceId, amount: '-20.50', type: 'expense',
    ledger_status: 'posted', is_reconciled: true, is_confirmed: true, economic_kind: 'standard', legacy_needs_review: false,
    reviewed_at: '2026-10-20T12:00:00Z', reviewed_by: 'reviewer-a', ...extra };
}

test('normalizes accents, punctuation and whitespace without dropping identity-bearing numbers', () => {
  assert.equal(normalizeDescription('  PIX * FARMÁCIA São José / 1234  '), 'pix farmacia sao jose 1234');
  assert.equal(normalizeDescription(null), '');
});

test('recognizes grocery merchants using only accessible existing category IDs and stored subcategories', () => {
  for (const description of ['PIX ENVIADO EXTRABOM', 'ITAPOA COMERCIO DE ALIMENTOS', 'Supermercados exemplo', 'ASSAÍ ATACADISTA']) {
    const result = suggest(description);
    assert.equal(result.category_id, 'food', description);
    assert.equal(result.subcategory, 'Supermercado');
    assert.equal(result.source, 'merchant');
    assert.ok(result.confidence >= 0.86 && result.confidence <= 1);
  }
});

test('recognizes pharmacy, utilities, phone, internet, fuel and education conservatively', () => {
  const cases = [
    ['DROGASIL LOJA 12', 'health', 'Farmácia'], ['PAGAMENTO EDP', 'bills', 'Energia elétrica'],
    ['FATURA CLARO MOVEL', 'bills', 'Telefone'], ['PROVEDOR INTERNET', 'bills', 'Internet'],
    ['POSTO DE COMBUSTIVEL CENTRAL', 'transport', 'Combustível'], ['MENSALIDADE ESCOLAR', 'education', null],
  ];
  for (const [description, categoryId, subcategory] of cases) {
    const result = suggest(description);
    assert.equal(result.category_id, categoryId, description);
    assert.equal(result.subcategory, subcategory);
  }
  assert.equal(suggest('PIX MARIA CLARO').category_id, null);
});

test('uses the current taxonomy and abstains from paint repairs without an existing matching subcategory', () => {
  const currentCatalog = [category('food-now', 'Alimentação', 'expense', { subcategories: ['Mercado'] }),
    category('home-now', 'Moradia', 'expense', { subcategories: ['Aluguel', 'Manutenção'] }),
    category('bills-now', 'Contas Residenciais', 'expense', { subcategories: ['Energia'] }),
    category('pets-now', 'Pets', 'expense', { subcategories: ['Rações'] }), category('subscriptions-now', 'Assinaturas')];
  const options = { categories: currentCatalog };
  assert.equal(suggest('EXTRABOM', options).subcategory, 'Mercado');
  assert.equal(suggest('EDP', options).category_id, 'bills-now');
  assert.equal(suggest('PETSHOP CENTRAL', options).category_id, 'pets-now');
  assert.equal(suggest('AGROCAMPO RACOES', options).subcategory, 'Rações');
  assert.equal(suggest('NETFLIX', options).category_id, 'subscriptions-now');
  assert.equal(suggest('LOJA DE TINTAS CENTRAL', options).subcategory, 'Manutenção');
  assert.equal(suggest('LOJA DE TINTAS CENTRAL', { categories: [category('home-no-sub', 'Moradia')] }).category_id, null);
});

test('recognizes explicit concatenated brands and preserves exact subcategory labels from the current catalog', () => {
  const currentCatalog = [category('food-now', 'Alimentação', 'expense', { subcategories: ['Delivery e Lanches', 'Restaurantes e Bares', 'Padaria/Café', 'Mercado'] }),
    category('home-now', 'Moradia', 'expense', { subcategories: ['Manutenção/Reparos'] }),
    category('transport-now', 'Transporte', 'expense', { subcategories: ['App (Uber/99)'] }),
    category('bills-now', 'Contas Residenciais', 'expense', { subcategories: ['Internet/TV'] }), category('pets-now', 'Pets')];
  const cases = [
    ['Agrocamporacoes Exemplo', 'pets-now', null], ['Feirao Das Tintas Exemplo', 'home-now', 'Manutenção/Reparos'],
    ['Uber Trip Exemplo', 'transport-now', 'App (Uber/99)'], ['IFood Exemplo', 'food-now', 'Delivery e Lanches'],
    ['Restaurante Exemplo', 'food-now', 'Restaurantes e Bares'], ['Padaria Exemplo', 'food-now', 'Padaria/Café'],
    ['Extrabom Exemplo', 'food-now', 'Mercado'], ['Internet Exemplo', 'bills-now', 'Internet/TV'],
  ];
  for (const [description, categoryId, subcategory] of cases) {
    const result = suggest(description, { categories: currentCatalog });
    assert.equal(result.category_id, categoryId, description);
    assert.equal(result.subcategory, subcategory, description);
  }
  assert.equal(suggest('Tinta Exemplo', { categories: currentCatalog }).category_id, null);
  assert.equal(suggest('Feirao Das Tintas Exemplo', { categories: [category('home-no-sub', 'Moradia')] }).category_id, null);
});

test('Uber Eats is food while Uber trips and explicit 99 merchants are transport', () => {
  assert.equal(suggest('UBER * EATS BR').category_id, 'food');
  assert.equal(suggest('UBER * TRIP').category_id, 'transport');
  assert.equal(suggest('99 TECNOLOGIA LTDA').category_id, 'transport');
  assert.equal(suggest('PIX ENVIADO PROTOCOLO 99').category_id, null);
  assert.equal(suggest('UBERLANDIA COMERCIO').category_id, null);
});

test('does not invent income from a merchant, PIX person or numeric reference', () => {
  const result = suggestTransactionCategory({ transaction: transaction('PIX RECEBIDO JOAO DA SILVA', { amount_cents: '50000' }), workspaceId, categories });
  assert.equal(result.category_id, null);
  assert.equal(result.nature_hint.economic_kind, 'unknown');
  assert.equal(suggestTransactionCategory({ transaction: transaction('EXTRABOM', { amount_cents: '50000' }), workspaceId, categories }).category_id, null);
});

test('active explicit workspace rules precede history and merchant signals', () => {
  const result = suggest('EXTRABOM', { rules: [rule('extrabom', 'other')],
    history: [reviewed('h1', 'extrabom'), reviewed('h2', 'extrabom')] });
  assert.equal(result.category_id, 'other');
  assert.equal(result.source, 'rule');
  assert.equal(result.confidence, 0.99);
});

test('explicit income rules require a matching direction and income-compatible accessible category', () => {
  const incoming = transaction('SALARIO EMPRESA EXEMPLO', { amount_cents: '300000', type: 'income' });
  const rules = [rule('empresa exemplo', 'salary', { transaction_type: 'income' })];
  const result = suggestTransactionCategory({ transaction: incoming, workspaceId, categories, rules });
  assert.equal(result.category_id, 'salary');
  assert.equal(result.source, 'rule');
  assert.equal(suggest('SALARIO EMPRESA EXEMPLO', { rules }).category_id, null);
});

test('rule priority precedes specificity and otherwise longer complete phrases win', () => {
  const description = 'FARMACIA CENTRAL';
  const rules = [rule('farmacia', 'health'), rule('farmacia central', 'other')];
  assert.equal(suggest(description, { rules }).category_id, 'other');
  assert.equal(suggest(description, { rules: [{ ...rules[0], priority: 2 }, rules[1]] }).category_id, 'health');
});

test('ignores inactive, foreign workspace, wrong direction and inaccessible category rules', () => {
  const rules = [rule('extrabom', 'other', { is_active: false }), rule('extrabom', 'other', { workspace_id: 'workspace-b' }),
    rule('extrabom', 'other', { transaction_type: 'income' }), rule('extrabom', 'foreign'),
    rule('extrabom', 'salary')];
  assert.equal(suggest('EXTRABOM', { rules }).category_id, 'food');
});

test('generic financial rules cannot categorize every PIX or transfer as income or spending', () => {
  for (const keyword of ['pix', 'pix recebido', 'pagamento de boleto', 'transferencia via pix', 'recebimento pix', 'pagamento']) {
    const result = suggest(`${keyword} MARCOS PESSOA`, { rules: [rule(keyword, 'other')] });
    assert.equal(result.category_id, null, keyword);
  }
});

test('matches complete rule tokens instead of substrings inside unrelated words', () => {
  const rules = [rule('bar', 'leisure')];
  assert.equal(suggest('EMBARQUE DE VIAGEM', { rules }).category_id, null);
  assert.equal(suggest('BAR CENTRAL', { rules }).category_id, 'leisure');
  assert.equal(suggest('BARBEARIA CENTRAL', { rules }).category_id, null);
});

test('equally ranked conflicting rules abstain instead of selecting an arbitrary category', () => {
  const result = suggest('EXTRABOM', { rules: [rule('extrabom', 'food'), rule('extrabom', 'other', { id: 'other-rule' })] });
  assert.equal(result.category_id, null);
  assert.equal(result.source, 'none');
  assert.match(result.reason, /Regras/);
});

test('an explicit rule direction outranks a preserved unrestricted rule but equal typed conflicts still abstain', () => {
  const unrestricted = rule('loja familiar', 'other', { transaction_type: null });
  const typed = rule('loja familiar', 'food', { id: 'typed-expense-rule', transaction_type: 'expense' });
  assert.equal(suggest('LOJA FAMILIAR', { rules: [unrestricted, typed] }).category_id, 'food');
  assert.equal(suggest('LOJA FAMILIAR', { rules: [typed, unrestricted] }).category_id, 'food');
  assert.equal(suggest('LOJA FAMILIAR', { rules: [{ ...unrestricted, priority: 1 }, typed] }).category_id, 'other');
  const conflicting = { ...typed, id: 'conflicting-typed-rule', category_id: 'other' };
  assert.equal(suggest('LOJA FAMILIAR', { rules: [unrestricted, typed, conflicting] }).category_id, null);
});

test('subcategory is copied only from its selected category catalog', () => {
  assert.equal(suggest('LOJA FAMILIAR', { rules: [rule('loja familiar', 'food', { subcategory: 'supermercado' })] }).subcategory, 'Supermercado');
  const invalid = suggest('LOJA FAMILIAR', { rules: [rule('loja familiar', 'food', { subcategory: 'Farmácia' })] });
  assert.equal(invalid.category_id, 'food');
  assert.equal(invalid.subcategory, null);
});

test('learns exact normalized description and direction only from at least two consistent reviewed rows', () => {
  const history = [reviewed('h1', 'LOJA * FAMILIAR'), reviewed('h2', 'Loja Familiar')];
  const result = suggest('loja familiar', { history });
  assert.equal(result.category_id, 'food');
  assert.equal(result.source, 'history');
  assert.equal(suggest('loja familiar', { history: history.slice(0, 1) }).category_id, null);
  assert.equal(suggest('loja familiar 123', { history }).category_id, null);
  assert.equal(suggest('loja familiar', { history: [history[0], history[0]] }).category_id, null);
});

test('does not learn unreviewed, pending, legacy, nonstandard, direction-inconsistent or foreign history', () => {
  for (const invalid of [{ reviewed_at: null }, { reviewed_by: null }, { ledger_status: 'pending' }, { is_reconciled: false },
    { is_confirmed: false }, { legacy_needs_review: true }, { economic_kind: 'refund' }, { is_internal_transfer: true },
    { workspace_id: 'workspace-b' }, { type: 'income' }, { type: 'transfer' }, { category_id: 'missing' }]) {
    const history = [reviewed('h1', 'LOJA FAMILIAR'), reviewed('h2', 'LOJA FAMILIAR', 'food', invalid)];
    assert.equal(suggest('LOJA FAMILIAR', { history }).category_id, null, JSON.stringify(invalid));
  }
});

test('conflicting reviewed history abstains even when a merchant dictionary could match', () => {
  const result = suggest('EXTRABOM', { history: [reviewed('h1', 'EXTRABOM'), reviewed('h2', 'EXTRABOM', 'other')] });
  assert.equal(result.category_id, null);
  assert.match(result.reason, /histórico/);
});

test('foreign IDs and fake system categories never leak into suggestions', () => {
  const invalidCategories = [category('foreign', 'Alimentação', 'expense', { workspace_id: 'workspace-b', user_id: 'other-user' }),
    category('fake', 'Alimentação', 'expense', { user_id: 'other-user' }),
    category('missing-scope', 'Alimentação', 'expense', { is_system: false })];
  assert.equal(suggest('EXTRABOM', { categories: invalidCategories, rules: [rule('extrabom', 'foreign')] }).category_id, null);
  const own = category('own', 'Alimentação', 'expense', { workspace_id: workspaceId, user_id: 'owner-a', is_system: false });
  assert.equal(suggest('EXTRABOM', { categories: [own] }).category_id, 'own');
  assert.equal(suggestTransactionCategory({ transaction: transaction('EXTRABOM', { workspace_id: 'workspace-b' }), workspaceId, categories }).category_id, null);
});

test('specific semantic category is preferred to broad food category and equal candidates abstain', () => {
  assert.equal(suggest('EXTRABOM', { categories: [...categories, category('grocery', 'Supermercado')] }).category_id, 'grocery');
  assert.equal(suggest('EXTRABOM', { categories: [...categories, category('food-duplicate', 'Alimentação')] }).category_id, 'food');
  assert.equal(suggest('EXTRABOM', { categories: [...categories, category('food-duplicate', 'Alimentação', 'expense', { subcategories: ['Supermercado'] })] }).category_id, null);
  assert.equal(suggest('EXTRABOM', { categories: [category('salary-food', 'Alimentação', 'income')] }).category_id, null);
  assert.equal(suggest('EXTRABOM FARMACIA CENTRAL').category_id, null);
});

test('both category type is permitted but amount/type direction inconsistencies abstain', () => {
  const rules = [rule('loja familiar', 'other')];
  assert.equal(suggest('LOJA FAMILIAR', { rules }).category_id, 'other');
  for (const change of [{ amount_cents: '0' }, { amount_cents: '20.5' }, { amount_cents: 'NaN' },
    { amount_cents: '-100', amount: '10.00' }, { type: 'income' }, { amount_cents: null, amount: '0.00' }]) {
    assert.equal(suggestTransactionCategory({ transaction: transaction('LOJA FAMILIAR', change), workspaceId, categories, rules }).category_id, null, JSON.stringify(change));
  }
  assert.equal(suggestTransactionCategory({ transaction: { description: 'LOJA FAMILIAR', amount: '-2.50' }, workspaceId, categories, rules }).category_id, 'other');
});

test('refunds, principal withdrawals and internal transfers receive a hint without a spending/income label', () => {
  const cases = [['ESTORNO EXTRABOM', 'refund'], ['RESGATE CDB', 'investment_principal'], ['PIX MESMA TITULARIDADE', 'transfer']];
  for (const [description, economicKind] of cases) {
    const result = suggest(description, { rules: [rule(description, 'food')] });
    assert.equal(result.category_id, null);
    assert.equal(result.nature_hint.economic_kind, economicKind);
  }
  const preserved = suggestTransactionCategory({ transaction: transaction('EXTRABOM', { economic_kind: 'loan_principal' }), workspaceId, categories });
  assert.equal(preserved.category_id, null);
  assert.equal(preserved.nature_hint.economic_kind, 'loan_principal');
});

test('returned PIX and explicit chargebacks abstain even for recognized merchants with an active rule', () => {
  const rules = [rule('extrabom', 'food')];
  for (const label of ['Pix enviado devolvido', 'Pix recebido devolvido', 'Pix enviada devolvida', 'Pix recebida devolvida',
    'Pix enviado reembolso', 'Chargeback', 'Charged back', 'Chargedback']) {
    for (const amount_cents of ['-2050', '2050']) {
      const result = suggestTransactionCategory({ transaction: transaction(`${label} EXTRABOM`, { amount_cents }), workspaceId, categories, rules });
      assert.equal(result.category_id, null, `${label} ${amount_cents}`);
      assert.equal(result.source, 'none');
      assert.equal(result.nature_hint.economic_kind, 'refund');
    }
  }
});

test('existing reversal and transfer references prevent merchant suggestions and learning even with standard nature', () => {
  for (const [field, kind] of [['reversal_of', 'refund'], ['linked_transaction_id', 'transfer'], ['transfer_group_id', 'transfer']]) {
    const linked = transaction('EXTRABOM', { economic_kind: 'standard', [field]: 'existing-reference' });
    const result = suggestTransactionCategory({ transaction: linked, workspaceId, categories, rules: [rule('extrabom', 'food')] });
    assert.equal(result.category_id, null, field);
    assert.equal(result.nature_hint.economic_kind, kind, field);
    const history = [reviewed('h1', 'LOJA FAMILIAR'), reviewed('h2', 'LOJA FAMILIAR', 'food', { [field]: 'existing-reference' })];
    assert.equal(suggest('LOJA FAMILIAR', { history }).category_id, null, field);
  }
});

test('never overwrites an existing classification or changes financial/source fields', () => {
  const original = transaction('EXTRABOM', { category_id: 'salary', date: '2026-10-01', economic_kind: 'standard', source_key: 'immutable-source' });
  const before = structuredClone(original);
  const result = suggestTransactionCategory({ transaction: Object.freeze(original), workspaceId, categories });
  assert.equal(result.category_id, null);
  assert.match(result.reason, /preservada/);
  assert.deepEqual(original, before);
  assert.equal(Object.hasOwn(result, 'amount_cents'), false);
  assert.equal(Object.hasOwn(result, 'economic_kind'), false);
});

test('batch preserves input order and does not mutate transactions, catalog, history or rules', () => {
  const input = { transactions: [transaction('IFood'), transaction('Pessoa desconhecida'), transaction('DROGASIL')],
    workspaceId, categories, rules: [rule('desconhecida', 'other', { is_active: false })], history: [] };
  const before = structuredClone(input);
  const results = suggestTransactionCategories(input);
  assert.deepEqual(results.map(result => result.category_id), ['food', null, 'health']);
  assert.deepEqual(input, before);
});

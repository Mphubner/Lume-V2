// This module only suggests labels. It never changes a transaction or its economic nature.
export function normalizeDescription(value) {
  return typeof value === 'string' ? value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ') : '';
}

const hasPhrase = (text, phrase) => (` ${text} `).includes(` ${phrase} `);
const hasAny = (text, phrases) => phrases.some(phrase => hasPhrase(text, phrase));
const labelKey = value => normalizeDescription(value);
const none = (reason, natureHint) => ({ category_id: null, subcategory: null, confidence: 0, source: 'none', reason,
  ...(natureHint ? { nature_hint: natureHint } : {}) });
const NATURES = new Set(['transfer', 'investment_principal', 'refund', 'loan_principal', 'owner_contribution']);
const GENERIC_RULES = new Set(['pix', 'ted', 'doc', 'transferencia', 'transferencia pix', 'pix transferencia', 'pagamento',
  'pagamento pix', 'pix pagamento', 'compra', 'compras', 'debito', 'credito', 'boleto', 'dinheiro', 'recebido', 'enviado',
  'pix recebido', 'pix enviado', 'pix recebida', 'pix enviada', 'transferencia recebida', 'transferencia enviada',
  'resgate', 'estorno', 'deposito', 'saque']);
const PAYMENT_WORDS = new Set(['pix', 'ted', 'doc', 'transferencia', 'pagamento', 'compra', 'compras', 'debito', 'credito',
  'boleto', 'dinheiro', 'recebido', 'enviado', 'recebida', 'enviada', 'realizado', 'realizada', 'efetuado', 'efetuada',
  'recebimento', 'deposito', 'saque', 'de', 'do', 'da', 'para', 'por', 'via', 'com', 'em', 'conta', 'banco', 'bancaria']);
const genericRule = keyword => GENERIC_RULES.has(keyword) || keyword.split(' ').every(word => PAYMENT_WORDS.has(word));

function sign(value, integer = false) {
  if (typeof value === 'number') return Number.isFinite(value) && (!integer || Number.isSafeInteger(value)) ? Math.sign(value) : null;
  if (typeof value !== 'string' || !(integer ? /^[+-]?\d+$/ : /^[+-]?\d+(?:\.\d+)?$/).test(value.trim())) return null;
  const unsigned = value.trim().replace(/^[+-]/, '').replace(/[.0]/g, '');
  return unsigned ? (value.trim().startsWith('-') ? -1 : 1) : 0;
}

function direction(transaction) {
  const centsSign = transaction.amount_cents == null ? null : sign(transaction.amount_cents, true);
  const amountSign = transaction.amount == null ? null : sign(transaction.amount);
  if (transaction.amount_cents != null && centsSign === null || transaction.amount != null && amountSign === null) return null;
  if (centsSign !== null && amountSign !== null && centsSign !== amountSign) return null;
  const signed = centsSign ?? amountSign;
  const declared = ['income', 'expense'].includes(transaction.type) ? transaction.type : null;
  if (signed === 0) return null;
  const inferred = signed === null ? declared : signed > 0 ? 'income' : 'expense';
  return declared && inferred !== declared ? null : inferred;
}

function accessibleCategories(categories, workspaceId, transactionDirection) {
  const byId = new Map();
  const collisions = new Set();
  for (const category of categories) {
    if (!category || typeof category.id !== 'string' || !category.id || collisions.has(category.id)) continue;
    const official = category.is_system === true && category.user_id == null && category.workspace_id == null;
    if (!(official || category.workspace_id === workspaceId) || category.is_active === false
      || ![transactionDirection, 'both'].includes(category.type)) continue;
    if (byId.has(category.id)) {
      byId.delete(category.id);
      collisions.add(category.id);
    } else byId.set(category.id, category);
  }
  return byId;
}

function validSubcategory(category, value) {
  const key = labelKey(value);
  if (!key || !Array.isArray(category.subcategories)) return null;
  return category.subcategories.find(label => typeof label === 'string' && labelKey(label) === key) ?? null;
}

function natureHint(transaction, description) {
  if (NATURES.has(transaction.economic_kind)) return { economic_kind: transaction.economic_kind,
    reason: 'A natureza já informada deve ser conferida sem ser alterada pela categorização.' };
  if (transaction.reversal_of != null) return { economic_kind: 'refund',
    reason: 'O movimento já referencia uma transação original. Confira o estorno sem substituir sua classificação.' };
  if (transaction.type === 'transfer' || transaction.is_internal_transfer === true
    || transaction.linked_transaction_id != null || transaction.transfer_group_id != null
    || hasAny(description, ['entre contas', 'mesma titularidade', 'propria titularidade', 'conta propria'])) {
    return { economic_kind: 'transfer', reason: 'Possível movimentação entre contas. Confirme a contrapartida antes de tratar como receita ou despesa.' };
  }
  if (hasAny(description, ['estorno', 'refund', 'reembolso', 'devolucao de compra', 'devolucao pix', 'pix devolvido',
    'pix enviado devolvido', 'pix recebido devolvido', 'pix enviada devolvida', 'pix recebida devolvida',
    'chargeback', 'charged back', 'chargedback'])) {
    return { economic_kind: 'refund', reason: 'Possível estorno ou devolução. Confira o vínculo com o movimento original.' };
  }
  if (hasAny(description, ['resgate', 'aplicacao financeira', 'aplicacao cdb', 'aplicacao rdb', 'investimento cdb', 'investimento rdb'])) {
    return { economic_kind: 'investment_principal', reason: 'Pode haver movimentação de principal investido. Separe o principal de eventual rendimento antes de classificar.' };
  }
  if (transaction.economic_kind && transaction.economic_kind !== 'standard') {
    return { economic_kind: 'unknown', reason: 'A natureza especial já informada exige conferência específica.' };
  }
  if (hasAny(description, ['pix', 'transferencia', 'ted', 'doc'])) return { economic_kind: 'unknown',
    reason: 'O meio de pagamento não identifica a finalidade. Confirme se é compra, receita ou movimentação entre contas.' };
  return null;
}

function fromRules({ rules, workspaceId, description, transactionDirection, categories }) {
  const matches = [];
  for (const rule of rules) {
    if (!rule || rule.workspace_id !== workspaceId || rule.is_active !== true
      || rule.transaction_type != null && rule.transaction_type !== transactionDirection) continue;
    const keyword = normalizeDescription(rule.keyword);
    if (keyword.length < 3 || genericRule(keyword) || !hasPhrase(description, keyword)) continue;
    const category = categories.get(rule.category_id);
    if (!category) continue;
    matches.push({ rule, category, keyword, priority: Number.isFinite(rule.priority) ? rule.priority : 0,
      subcategory: validSubcategory(category, rule.subcategory) });
  }
  matches.sort((left, right) => right.priority - left.priority || right.keyword.length - left.keyword.length
    || Number(right.rule.transaction_type != null) - Number(left.rule.transaction_type != null));
  if (!matches.length) return null;
  const best = matches[0];
  const peers = matches.filter(match => match.priority === best.priority && match.keyword.length === best.keyword.length
    && (match.rule.transaction_type != null) === (best.rule.transaction_type != null));
  if (peers.some(match => match.category.id !== best.category.id || match.subcategory !== best.subcategory)) {
    return none('Regras ativas igualmente específicas indicam categorias diferentes. Revise as regras deste espaço.');
  }
  return { category_id: best.category.id, subcategory: best.subcategory, confidence: 0.99, source: 'rule',
    reason: 'Regra ativa e específica deste espaço, compatível com a direção do movimento.' };
}

function fromHistory({ history, workspaceId, description, transactionDirection, categories }) {
  const examples = new Map();
  for (const row of history) {
    if (!row || typeof row.id !== 'string' || !row.id || row.workspace_id !== workspaceId
      || row.ledger_status !== 'posted' || row.is_reconciled !== true || row.is_confirmed === false
      || row.legacy_needs_review === true || row.is_internal_transfer === true || row.economic_kind !== 'standard'
      || row.reversal_of != null || row.linked_transaction_id != null || row.transfer_group_id != null
      || !['income', 'expense'].includes(row.type)
      || !row.reviewed_by || !row.reviewed_at || normalizeDescription(row.description) !== description
      || direction(row) !== transactionDirection) continue;
    const category = categories.get(row.category_id);
    if (!category) continue;
    examples.set(row.id, { category, subcategory: validSubcategory(category, row.subcategory) });
  }
  const known = [...examples.values()];
  if (known.length < 2) return null;
  const first = known[0];
  if (known.some(example => example.category.id !== first.category.id || example.subcategory !== first.subcategory)) {
    return none('O histórico revisado desta descrição possui classificações diferentes. É necessário escolher a categoria.');
  }
  return { category_id: first.category.id, subcategory: first.subcategory, confidence: Math.min(0.97, 0.92 + known.length * 0.01),
    source: 'history', reason: 'Descrição e direção coincidem com pelo menos dois movimentos revisados e classificados de forma consistente neste espaço.' };
}

const TARGETS = {
  supermarket: [
    { names: ['Supermercado', 'Supermercados', 'Mercado', 'Mercados', 'Mercearia'] },
    { names: ['Alimentação', 'Alimentação e bebidas'], subcategories: ['Supermercado', 'Supermercados', 'Mercado', 'Mercados', 'Mercearia'] },
  ],
  food: [
    { names: ['Restaurantes', 'Restaurante', 'Lanches'] },
    { names: ['Alimentação', 'Alimentação e bebidas'], subcategories: ['Restaurantes', 'Restaurantes e Bares', 'Restaurante', 'Lanches', 'Delivery e Lanches', 'Refeições'] },
  ],
  delivery: [
    { names: ['Delivery', 'Entrega de refeições'] },
    { names: ['Alimentação', 'Alimentação e bebidas'], subcategories: ['Delivery', 'Delivery e Lanches', 'Lanches', 'Refeições'] },
  ],
  bakery: [
    { names: ['Padaria', 'Padaria/Café'] },
    { names: ['Alimentação', 'Alimentação e bebidas'], subcategories: ['Padaria/Café', 'Padaria', 'Café'] },
  ],
  pharmacy: [
    { names: ['Farmácia', 'Farmácias', 'Medicamentos'] },
    { names: ['Saúde'], subcategories: ['Farmácia', 'Farmácias', 'Medicamentos'] },
  ],
  transport: [
    { names: ['Transporte por aplicativo', 'Transporte de aplicativo', 'Aplicativos de transporte', 'Mobilidade'] },
    { names: ['Transporte', 'Transportes'], subcategories: ['Aplicativos', 'App (Uber/99)', 'Transporte por aplicativo', 'Uber', 'Táxi', 'Taxi'] },
  ],
  energy: [
    { names: ['Energia', 'Energia elétrica', 'Luz'] },
    { names: ['Contas e Serviços', 'Contas Residenciais', 'ContasResidenciais', 'Moradia', 'Casa'], subcategories: ['Energia', 'Energia elétrica', 'Luz'] },
  ],
  phone: [
    { names: ['Telefone', 'Telefonia', 'Celular'] },
    { names: ['Contas e Serviços', 'Contas Residenciais', 'ContasResidenciais', 'Comunicação', 'Moradia'], subcategories: ['Telefone', 'Telefonia', 'Celular'] },
  ],
  internet: [
    { names: ['Internet', 'Banda larga'] },
    { names: ['Contas e Serviços', 'Contas Residenciais', 'ContasResidenciais', 'Comunicação', 'Moradia'], subcategories: ['Internet', 'Internet/TV', 'Banda larga'] },
  ],
  fuel: [
    { names: ['Combustível', 'Combustíveis'] },
    { names: ['Transporte', 'Transportes'], subcategories: ['Combustível', 'Combustíveis', 'Gasolina'] },
  ],
  education: [
    { names: ['Educação'], subcategories: ['Escola', 'Mensalidade escolar', 'Cursos'] },
  ],
  entertainment: [
    { names: ['Assinaturas', 'Streaming'] },
    { names: ['Lazer', 'Entretenimento'], subcategories: ['Streaming', 'Assinaturas'] },
  ],
  pets: [
    { names: ['Pets', 'Animais de estimação'], subcategories: ['Rações', 'Ração', 'Alimentação', 'Pet shop', 'Petshop'] },
  ],
  paint: [
    { names: ['Moradia', 'Casa e Construção'], subcategories: ['Reforma', 'Reformas', 'Manutenção', 'Manutenção/Reparos', 'Materiais de construção'], requireSubcategory: true },
  ],
};

function targetCategory(target, categories) {
  for (const tier of TARGETS[target]) {
    const candidates = [...categories.values()].filter(category => tier.names.some(name => labelKey(name) === labelKey(category.name)));
    if (!candidates.length) continue;
    const withSubcategory = candidates.map(category => ({ category,
      subcategory: (tier.subcategories ?? []).map(name => validSubcategory(category, name)).find(Boolean) ?? null }));
    const mostSpecific = tier.requireSubcategory || withSubcategory.some(candidate => candidate.subcategory)
      ? withSubcategory.filter(candidate => candidate.subcategory) : withSubcategory;
    if (!mostSpecific.length) continue;
    // Equal semantic names in different categories are ambiguous; do not choose an arbitrary ID.
    if (mostSpecific.length !== 1) return null;
    return mostSpecific[0];
  }
  return null;
}

function merchantTarget(description) {
  const targets = new Set();
  if (hasAny(description, ['supermercado', 'supermercados', 'extrabom', 'extra bom', 'itapoa', 'carrefour', 'assai', 'atacadao', 'hortifruti', 'mercearia'])) targets.add('supermarket');
  if (hasAny(description, ['uber eats', 'ifood', 'i food', 'delivery de comida'])) targets.add('delivery');
  if (hasAny(description, ['restaurante', 'restaurantes', 'lanchonete', 'pizzaria'])) targets.add('food');
  if (hasAny(description, ['padaria'])) targets.add('bakery');
  if (hasAny(description, ['farmacia', 'farmacias', 'drogaria', 'drogarias', 'drogasil', 'droga raia', 'pague menos', 'pacheco', 'drogaven'])) targets.add('pharmacy');
  if (!hasAny(description, ['uber eats']) && hasAny(description, ['uber', '99app', '99 app', '99 taxi', '99pop', '99 pop', '99 tecnologia', 'taxi'])) targets.add('transport');
  if (hasAny(description, ['edp', 'enel', 'cemig', 'celesc', 'energisa', 'cpfl', 'neoenergia', 'energia eletrica', 'conta de luz'])) targets.add('energy');
  if (hasAny(description, ['telefonia', 'telecom', 'telefonica', 'tim celular', 'recarga celular', 'conta de telefone'])
    || hasAny(description, ['claro', 'vivo', 'tim']) && hasAny(description, ['celular', 'movel', 'fatura', 'boleto', 'recarga', 'sa'])) targets.add('phone');
  if (hasAny(description, ['internet', 'banda larga'])) targets.add('internet');
  if (hasAny(description, ['posto de combustivel', 'posto gasolina', 'abastecimento', 'combustivel', 'combustiveis'])) targets.add('fuel');
  if (hasAny(description, ['mensalidade escolar', 'mensalidade faculdade', 'escola', 'universidade', 'faculdade'])) targets.add('education');
  if (hasAny(description, ['netflix', 'spotify', 'disney plus', 'hbo max', 'globoplay'])) targets.add('entertainment');
  if (hasAny(description, ['petshop', 'pet shop', 'agrocampo', 'agrocamporacoes', 'petz', 'cobasi'])) targets.add('pets');
  if (hasAny(description, ['loja de tintas', 'feirao das tintas', 'tintas suvinil', 'tintas coral', 'sherwin williams', 'tintas e acabamentos'])) targets.add('paint');
  return targets.size === 1 ? [...targets][0] : null;
}

/** Pure, deterministic category suggestion. Confidence describes the label suggestion, never financial reconciliation. */
export function suggestTransactionCategory({ transaction = {}, workspaceId, categories = [], rules = [], history = [] } = {}) {
  if (!transaction || typeof transaction !== 'object' || typeof workspaceId !== 'string' || !workspaceId
    || transaction.workspace_id != null && transaction.workspace_id !== workspaceId) return none('Espaço financeiro inválido ou divergente.');
  if (transaction.category_id) return none('O movimento já possui categoria. A classificação existente foi preservada.');
  const description = normalizeDescription(transaction.description);
  if (!description) return none('Descrição insuficiente para sugerir uma categoria.');
  const hint = natureHint(transaction, description);
  if (hint && hint.economic_kind !== 'unknown' || transaction.economic_kind && transaction.economic_kind !== 'standard'
    || transaction.type === 'transfer' || transaction.is_internal_transfer === true) {
    return none('Confira a natureza do movimento e suas referências antes de selecionar uma categoria.', hint);
  }
  const transactionDirection = direction(transaction);
  if (!transactionDirection) return none('Valor e direção ausentes, nulos ou inconsistentes. Confira o movimento.', hint);
  const catalog = accessibleCategories(Array.isArray(categories) ? categories : [], workspaceId, transactionDirection);
  const context = { workspaceId, description, transactionDirection, categories: catalog };
  const explicit = fromRules({ ...context, rules: Array.isArray(rules) ? rules : [] });
  if (explicit) return explicit;
  const learned = fromHistory({ ...context, history: Array.isArray(history) ? history : [] });
  if (learned) return learned;
  // Known merchants describe spending. Incoming payments from the same merchant may be a refund or another operation.
  if (transactionDirection === 'expense') {
    const target = merchantTarget(description);
    const selected = target ? targetCategory(target, catalog) : null;
    if (selected) return { category_id: selected.category.id, subcategory: selected.subcategory, confidence: 0.88, source: 'merchant',
      reason: 'Estabelecimento ou serviço reconhecido na descrição; categoria disponível e compatível com uma saída. Confira a sugestão.' };
  }
  return none('Não há evidência suficiente para sugerir uma categoria com segurança. Escolha a finalidade na conferência.', hint);
}

export function suggestTransactionCategories({ transactions = [], ...context } = {}) {
  return transactions.map(transaction => suggestTransactionCategory({ ...context, transaction }));
}

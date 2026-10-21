import { createHash } from 'node:crypto';

export const PARSER_VERSION = 'lume-statements-2';
export const MAX_IMPORT_ROWS = 20000;

export class ImportError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ImportError';
    this.code = code;
    this.details = details;
    this.retryable = false;
  }
}

const fail = (code, message, details) => { throw new ImportError(code, message, details); };
const normalized = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export const sha256 = value => createHash('sha256').update(value).digest('hex');

/** Parse the source token into integer cents. Never infer sign from merchant text. */
export function parseAmountCents(value, { locale } = {}) {
  if (typeof value !== 'string') fail('INVALID_AMOUNT', 'O valor deve preservar o texto original.');
  let text = value.trim().replace(/[−–—]/g, '-').replace(/\u00a0/g, ' ');
  if (/\b(?:USD|EUR|GBP|US\$)\b/i.test(text)) fail('UNSUPPORTED_CURRENCY', 'Somente extratos em BRL são suportados.');
  text = text.replace(/^(?:BRL|R\$)\s*/i, '').replace(/^([+-])\s*(?:BRL|R\$)\s*/i, '$1').trim();
  const suffix = text.match(/\s*([DC])$/i)?.[1]?.toUpperCase();
  if (suffix) text = text.replace(/\s*[DC]$/i, '').trim();
  const parentheses = /^\(.*\)$/.test(text);
  if (parentheses) text = text.slice(1, -1).trim();
  let sign = 1n;
  const explicitSign = /^[+-]/.test(text) ? text[0] : null;
  if (explicitSign) { sign = text[0] === '-' ? -1n : 1n; text = text.slice(1).trim(); }
  if (parentheses) {
    if (explicitSign) fail('INVALID_AMOUNT', 'Sinais conflitantes no valor.');
    sign = -1n;
  }
  if (suffix) {
    const dcSign = suffix === 'D' ? -1n : 1n;
    if ((explicitSign || parentheses) && sign !== dcSign) fail('INVALID_AMOUNT', 'Sinal e indicador D/C conflitantes.');
    sign = dcSign;
  }
  if (!/^\d[\d.,]*$/.test(text)) fail('INVALID_AMOUNT', 'Valor monetário inválido.', { token: value });
  let integer, fraction;
  if (text.includes(',') && text.includes('.')) {
    const br = /^\d{1,3}(?:\.\d{3})+,\d{1,2}$/;
    const us = /^\d{1,3}(?:,\d{3})+\.\d{1,2}$/;
    if (br.test(text)) [integer, fraction] = text.replaceAll('.', '').split(',');
    else if (us.test(text)) [integer, fraction] = text.replaceAll(',', '').split('.');
    else fail('INVALID_AMOUNT', 'Separadores monetários inválidos.', { token: value });
  } else if (/^[0-9]+[.,][0-9]{1,2}$/.test(text)) {
    [integer, fraction] = text.split(/[.,]/);
  } else if (/^\d+$/.test(text)) {
    integer = text; fraction = '';
  } else if (locale === 'pt-BR' && /^\d{1,3}(?:\.\d{3})+$/.test(text)) {
    integer = text.replaceAll('.', ''); fraction = '';
  } else if (locale === 'en-US' && /^\d{1,3}(?:,\d{3})+$/.test(text)) {
    integer = text.replaceAll(',', ''); fraction = '';
  } else fail('AMBIGUOUS_AMOUNT', 'Valor com milhar ou precisão ambígua. Informe o formato ou exporte com dois decimais.', { token: value });
  const cents = sign * (BigInt(integer) * 100n + BigInt((fraction || '').padEnd(2, '0')));
  if (cents > 999999999999999n || cents < -999999999999999n) fail('AMOUNT_LIMIT', 'Valor fora do limite suportado.');
  return cents.toString();
}

export function centsToDecimal(value) {
  const cents = BigInt(value), magnitude = cents < 0n ? -cents : cents;
  return `${cents < 0n ? '-' : ''}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, '0')}`;
}

export function parseStatementDate(value, { ofx = false } = {}) {
  const text = String(value || '').trim();
  let year, month, day, match;
  if ((match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/))) [, year, month, day] = match;
  else if ((match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) [, day, month, year] = match;
  else if (ofx && (match = text.match(/^(\d{4})(\d{2})(\d{2})(?:\d{6}(?:\.\d+)?(?:\[[^\]]+\])?)?$/))) [, year, month, day] = match;
  else fail('INVALID_DATE', 'Data ausente ou ambígua. Use DD/MM/AAAA ou AAAA-MM-DD.', { token: text });
  const y = Number(year), m = Number(month), d = Number(day);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > days) fail('INVALID_DATE', 'Data inexistente no calendário.', { token: text });
  return `${year}-${month}-${day}`;
}

export function decodeStatement(buffer) {
  if (buffer.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) return { text: new TextDecoder('utf-16le', { fatal: true }).decode(buffer), encoding: 'utf-16le' };
  if (buffer.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))) return { text: new TextDecoder('utf-16be', { fatal: true }).decode(buffer), encoding: 'utf-16be' };
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(buffer), encoding: 'utf-8' }; }
  catch { return { text: new TextDecoder('windows-1252', { fatal: true }).decode(buffer), encoding: 'windows-1252' }; }
}

/** RFC4180 state machine; row provenance points to the first physical line. */
export function tokenizeCSV(content, delimiter = ';') {
  const text = content.replace(/^\uFEFF/, '');
  const rows = [];
  let fields = [], field = '', quoted = false, closed = false, line = 1, startLine = 1;
  const pushRow = () => {
    fields.push(field);
    if (fields.some(value => value.trim() !== '')) rows.push({ fields, line: startLine });
    fields = []; field = ''; closed = false;
    if (rows.length > MAX_IMPORT_ROWS + 1) fail('ROW_LIMIT', `O limite é ${MAX_IMPORT_ROWS} lançamentos por arquivo.`);
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else { field += c; if (c === '\n') line++; }
      continue;
    }
    if (c === '"') {
      if (field !== '' || closed) fail('CSV_QUOTING', 'Aspas fora do início do campo CSV.', { line });
      quoted = true;
    } else if (c === delimiter) { fields.push(field); field = ''; closed = false; }
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      pushRow(); line++; startLine = line;
    } else {
      if (closed && c.trim() !== '') fail('CSV_QUOTING', 'Texto após fechar aspas CSV.', { line });
      if (!closed) field += c;
    }
  }
  if (quoted) fail('CSV_TRUNCATED', 'CSV termina dentro de um campo entre aspas.');
  if (field !== '' || fields.length || closed) pushRow();
  return rows;
}

const aliases = {
  date: ['data', 'date', 'data lancamento', 'data lançamento', 'data da transacao', 'data da movimentacao'],
  description: ['descricao', 'description', 'historico', 'memo', 'lancamento', 'detalhes'],
  amount: ['valor', 'amount', 'value', 'valor (r$)', 'valor r$', 'valor da transacao'],
  debit: ['debito', 'debit', 'saida', 'saidas'], credit: ['credito', 'credit', 'entrada', 'entradas'],
  external_id: ['fitid', 'id', 'id transacao', 'id da transacao', 'transaction id'],
  currency: ['moeda', 'currency'],
};

function makeRow({ date, description, cents, externalId, source }) {
  const desc = String(description || '').trim();
  if (!desc || desc.length > 2000) fail('INVALID_DESCRIPTION', 'Descrição vazia ou longa demais.', { line: source.line });
  if (BigInt(cents) === 0n) fail('ZERO_AMOUNT', 'Lançamento de valor zero exige revisão do arquivo.', { line: source.line });
  return {
    date, description: desc, amount: centsToDecimal(cents), amount_cents: cents,
    external_id: externalId?.trim() || null,
    content_fingerprint: sha256(`${date}\n${cents}\n${normalized(desc).replace(/\s+/g, ' ')}`),
    payment_method: /\bpix\b/i.test(desc) ? 'pix' : null,
    type: BigInt(cents) < 0n ? 'expense' : 'income', economic_kind: 'standard',
    source,
  };
}

export function parseCSV(content, options = {}) {
  let rows, delimiter = options.delimiter;
  if (delimiter && ![';', ',', '\t'].includes(delimiter)) fail('CSV_DELIMITER', 'Separador CSV inválido.');
  if (!delimiter) {
    const candidates = [';', ',', '\t'].flatMap(candidate => {
      try { const parsed = tokenizeCSV(content, candidate); return parsed[0]?.fields.length >= 3 ? [{ delimiter: candidate, rows: parsed }] : []; }
      catch { return []; }
    });
    if (candidates.length !== 1) fail('CSV_DELIMITER', 'Separador CSV não identificado sem ambiguidade. Informe delimiter.');
    ({ delimiter, rows } = candidates[0]);
  }
  rows ||= tokenizeCSV(content, delimiter);
  if (rows.length < 2) fail('EMPTY_STATEMENT', 'O extrato não possui lançamentos.');
  const header = rows[0].fields.map(normalized);
  const columns = {};
  for (const [key, names] of Object.entries(aliases)) {
    const requested = options.columns?.[key];
    const matches = header.flatMap((name, index) => (requested !== undefined ? (Number.isInteger(requested) ? requested === index : normalized(requested) === name) : names.map(normalized).includes(name)) ? [index] : []);
    if (matches.length > 1) fail('CSV_COLUMNS', `Coluna ${key} ambígua.`);
    columns[key] = matches[0];
  }
  if (columns.date === undefined || columns.description === undefined || (columns.amount === undefined && (columns.debit === undefined || columns.credit === undefined))) fail('CSV_COLUMNS', 'CSV precisa de Data, Descrição e Valor (ou Débito e Crédito). Mapeie as colunas explicitamente.');
  const transactions = rows.slice(1).map(row => {
    try {
      if (row.fields.length !== header.length) fail('CSV_COLUMNS', 'Quantidade de colunas difere do cabeçalho.');
      const get = key => columns[key] === undefined ? '' : row.fields[columns[key]].trim();
      if (get('currency') && get('currency').toUpperCase() !== 'BRL') fail('UNSUPPORTED_CURRENCY', 'Somente BRL é suportado.');
      let cents;
      if (columns.amount !== undefined) cents = parseAmountCents(get('amount'), options);
      else {
        const debit = get('debit') ? BigInt(parseAmountCents(get('debit'), options)) : 0n;
        const credit = get('credit') ? BigInt(parseAmountCents(get('credit'), options)) : 0n;
        if (debit < 0n || credit < 0n || (debit !== 0n && credit !== 0n)) fail('AMBIGUOUS_AMOUNT', 'Débito e crédito devem ser magnitudes positivas e somente um deve estar preenchido.');
        cents = (credit - debit).toString();
      }
      // Conversion identifiers are document provenance, never bank identity.
      const provenanceIndex = header.indexOf('lume_source_identity');
      const provenance = provenanceIndex >= 0 ? row.fields[provenanceIndex].trim() : '';
      if (provenance && !/^[a-f0-9]{64}$/.test(provenance)) fail('INVALID_PROVENANCE', 'Identidade de origem da conversão inválida.');
      const description = header.includes('lume_conversion') && get('description').startsWith("'csv:") ? get('description').slice(5) : get('description');
      const parsed = makeRow({ date: parseStatementDate(get('date')), description, cents, externalId: provenanceIndex >= 0 ? null : get('external_id'), source: { line: row.line, fields: row.fields, converted_source_identity: provenance || undefined, raw_amount: columns.amount !== undefined ? get('amount') : { debit: get('debit'), credit: get('credit') } } });
      return parsed;
    } catch (error) {
      if (error instanceof ImportError) { error.details.line = row.line; error.message = `Linha ${row.line}: ${error.message}`; }
      throw error;
    }
  });
  return { transactions, metadata: { parser_version: PARSER_VERSION, format: 'csv', delimiter, currency: 'BRL', columns }, complete: true };
}

const unescapeXML = text => text.replace(/&(?:amp|lt|gt|quot|apos|#9|#10|#13);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#9;':'\t', '&#10;':'\n', '&#13;':'\r' })[entity]);
const tag = (text, name) => unescapeXML(text.match(new RegExp(`<${name}\\s*>\\s*([^<\\r\\n]*)`, 'i'))?.[1]?.trim() || '');

export function parseOFX(content) {
  if (!/<OFX[\s>]/i.test(content) || !/<\/OFX\s*>/i.test(content)) fail('OFX_TRUNCATED', 'Arquivo OFX inválido ou incompleto.');
  if (/<!ENTITY|<!DOCTYPE/i.test(content)) fail('OFX_UNSUPPORTED', 'Declarações externas XML não são suportadas.');
  const currency = tag(content, 'CURDEF').toUpperCase();
  if (currency !== 'BRL') fail('UNSUPPORTED_CURRENCY', 'O OFX deve declarar moeda BRL.');
  const accountIds = [...content.matchAll(/<ACCTID\s*>\s*([^<\r\n]*)/gi)].map(match => match[1].trim());
  if (new Set(accountIds).size !== 1) fail('OFX_ACCOUNT', 'Importe um único extrato de conta por arquivo.');
  const blocks = [...content.matchAll(/<STMTTRN\s*>([\s\S]*?)<\/STMTTRN\s*>/gi)];
  const opened = [...content.matchAll(/<STMTTRN\s*>/gi)].length;
  if (opened !== blocks.length) fail('OFX_TRUNCATED', 'OFX contém lançamento truncado.');
  if (!blocks.length) fail('EMPTY_STATEMENT', 'OFX não contém lançamentos.');
  if (blocks.length > MAX_IMPORT_ROWS) fail('ROW_LIMIT', `O limite é ${MAX_IMPORT_ROWS} lançamentos.`);
  const transactions = blocks.map((match, index) => {
    const block = match[1], fitid = tag(block, 'FITID');
    if (!fitid || fitid.length > 256) fail('OFX_FITID', 'OFX precisa de FITID válido em cada lançamento.', { line: index + 1 });
    const rawAmount = tag(block, 'TRNAMT');
    const converted = /^LUME-CONVERTED-[a-f0-9]{64}$/.test(fitid);
    return makeRow({ date: parseStatementDate(tag(block, 'DTPOSTED'), { ofx: true }), description: tag(block, 'MEMO') || tag(block, 'NAME') || `Lançamento ${fitid}`, cents: parseAmountCents(rawAmount), externalId: converted ? null : fitid, source: { line: index + 1, fitid, converted_source_identity: converted ? fitid.slice(15) : undefined, raw_amount: rawAmount, bank_type: tag(block, 'TRNTYPE'), raw: match[0] } });
  });
  const ledger = content.match(/<LEDGERBAL\s*>([\s\S]*?)<\/LEDGERBAL\s*>/i)?.[1];
  const end = tag(content, 'DTEND'), start = tag(content, 'DTSTART');
  const metadata = { parser_version: PARSER_VERSION, format: 'ofx', currency, bank_id: tag(content, 'BANKID') || tag(content, 'ORG'), account_reference: accountIds[0], account_type: tag(content, 'ACCTTYPE') };
  if (start) metadata.period_start = parseStatementDate(start, { ofx: true });
  if (end) metadata.period_end = parseStatementDate(end, { ofx: true });
  if (ledger) {
    metadata.closing_balance = centsToDecimal(parseAmountCents(tag(ledger, 'BALAMT')));
    metadata.closing_balance_date = parseStatementDate(tag(ledger, 'DTASOF'), { ofx: true });
    // DTASOF can be after the requested interval: never assert the balance covers DTEND.
    if (metadata.closing_balance_date !== metadata.period_end) metadata.balance_requires_confirmation = true;
  }
  return { transactions, metadata, complete: true };
}

export function finalizeStatement(result, buffer) {
  if (result.complete !== true || !Array.isArray(result.transactions) || !result.transactions.length) fail('INCOMPLETE_STATEMENT', 'Extração incompleta: nenhum lançamento foi publicado.');
  const documentHash = sha256(buffer), externalIds = new Map();
  for (let index = 0; index < result.transactions.length; index++) {
    const row = result.transactions[index];
    row.row_number = index + 1;
    row.source_identity = row.source?.converted_source_identity || sha256(`${documentHash}:${PARSER_VERSION}:${index + 1}`);
    if (row.external_id) {
      const previous = externalIds.get(row.external_id);
      if (previous && previous !== row.content_fingerprint) fail('EXTERNAL_ID_CONFLICT', 'O mesmo identificador bancário possui conteúdo divergente no arquivo.');
      if (previous) fail('EXTERNAL_ID_REPEATED', 'O mesmo identificador bancário foi repetido no arquivo. Exporte novamente para conferir a integridade do extrato.');
      externalIds.set(row.external_id, row.content_fingerprint);
    }
  }
  result.metadata = { ...result.metadata, document_hash: documentHash, parser_version: PARSER_VERSION, row_count: result.transactions.length, sum_cents: result.transactions.reduce((sum, row) => sum + BigInt(row.amount_cents), 0n).toString() };
  return result;
}

export function parseStatementBuffer(buffer, fileType, options = {}) {
  const { text, encoding } = decodeStatement(buffer);
  let result;
  if (fileType === 'csv' || fileType === 'txt') result = parseCSV(text, options);
  else if (fileType === 'ofx') result = parseOFX(text);
  else fail('UNSUPPORTED_FORMAT', 'Exporte o extrato como CSV ou OFX.');
  result.metadata.encoding = encoding;
  return finalizeStatement(result, buffer);
}

export { makeRow as makeImportRow };

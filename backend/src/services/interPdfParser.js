import { ImportError, parseAmountCents, centsToDecimal, parseStatementDate, makeImportRow, MAX_IMPORT_ROWS } from '../domain/importParsers.js';

const MONTHS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const TOKEN = '[+\\-−–—]?\\s*R\\$[\\s\\u00a0]*(?:\\d{1,3}(?:\\.\\d{3})+|\\d+),\\d{2}';
const COMPLETE_ROW = new RegExp(`^([\\s\\S]+")\\s+(${TOKEN})\\s+(${TOKEN})$`);
const DAY = new RegExp(`^(\\d{1,2}) de ([a-zç]+) de (\\d{4})\\s+Saldo do dia:\\s*(${TOKEN})$`, 'i');
const COLUMN_HEADER = /^Valor\s+Saldo\s+por\s+transa[cç][aã]o(?:\s+|$)/i;
const ROW_START = /^[^:\r\n"]{2,80}:\s*"/;
const FOOTER = /^(?:Fale com a gente\s*$|SAC:|Ouvidoria:|Defici[eê]ncia de fala e audi[cç][aã]o:)/i;
const FOOTER_CONTACTS = /^(?:(?:SAC|Ouvidoria|Defici[eê]ncia de fala e audi[cç][aã]o):\s*\d[\d\s()-]*(?:\(\s*op[cç][aã]o\s+\d+\s*\))?\s*)+$/i;
const MONEY_OR_DATE = /R\$|\bBRL\b|[+\-−–—]\s*\d|\b\d+(?:[.,]\d{3})*[.,]\d{2}\b|\b(?:\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+de\s+\p{L}+\s+de\s+\d{4})\b/iu;
const ANY_ROW_START = /[^:\r\n"]{2,80}:\s*"/;
const SUMMARY_VALUE = new RegExp(`^${TOKEN}$`);
const ACCOUNT_LINE = /^CPF\/CNPJ:\s*(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{11}|\d{14})\s*,\s*Institui[cç][aã]o:\s*Banco Inter\s*,\s*Ag[eê]ncia:\s*[\d.-]+\s*,\s*Conta:\s*[\d.-]+\s*$/i;

const fail = (code, message, source) => { throw new ImportError(code, message, source); };

/** A bank-specific table adapter. It never guesses a second monetary column. */
export function parseInterPDFPages(pages) {
  const lines = pages.flatMap((page, pageIndex) => page.split(/\r?\n/).map((raw, lineIndex) => ({ text: raw.trim(), source: { page: pageIndex + 1, line: lineIndex + 1, raw } })));
  const institutions = lines.filter(line => /\bInstitui[cç][aã]o:\s*Banco Inter\b/i.test(line.text));
  const institution = institutions[0];
  if (!institution) return null;
  const accountReferences = institutions.map(line => line.text.match(/\bConta:\s*([\d.-]+)/i)?.[1]?.replace(/\D/g, ''));
  if (accountReferences.some(reference => !reference) || new Set(accountReferences).size !== 1) fail('PDF_INTER_ACCOUNT', 'Importe um único extrato de conta Inter por arquivo, com a referência da conta preservada.', institution.source);
  const periods = lines.flatMap(({ text, source }) => {
    const match = text.match(/^Per[ií]odo:\s*(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})$/i);
    return match ? [{ start: parseStatementDate(match[1]), end: parseStatementDate(match[2]), source }] : [];
  });
  if (!periods.length || new Set(periods.map(period => `${period.start}:${period.end}`)).size !== 1 || periods[0].start > periods[0].end || !lines.some(line => COLUMN_HEADER.test(line.text))) {
    fail('PDF_INTER_LAYOUT', 'O extrato Inter precisa informar um período único e as colunas Valor e Saldo por transação. Nenhum lançamento foi importado.', institution.source);
  }

  const period = periods[0], transactions = [], balances = [];
  let tableStarted = false, currentDay = null, pending = null, previousBalance = null, inferredOpening = null, checkedIntervals = 0;
  const preamble = { stage: 'requested', summary: null, labels: new Set(), note: false };
  const readPreamble = (line, source) => {
    const unsupported = () => fail('PDF_INTER_LAYOUT', 'Linha do preâmbulo Inter não reconhecida. Nenhum lançamento, data ou valor desconhecido pode ser omitido.', source);
    if (preamble.stage === 'requested') {
      if (/^inter$/i.test(line)) return;
      const requested = line.match(/^Solicitado em:\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{1,2})h(\d{2})$/i);
      if (!requested || Number(requested[2]) > 23 || Number(requested[3]) > 59) unsupported();
      parseStatementDate(requested[1]);
      preamble.stage = 'owner';
    } else if (preamble.stage === 'owner') {
      if (!/^[\p{L}\p{N}][\p{L}\p{N} .&'()-]{1,199}$/u.test(line) || MONEY_OR_DATE.test(line)) unsupported();
      preamble.stage = 'account';
    } else if (preamble.stage === 'account') {
      if (!ACCOUNT_LINE.test(line)) unsupported();
      preamble.stage = 'period';
    } else if (preamble.stage === 'period') {
      if (!/^Per[ií]odo:\s*\d{2}\/\d{2}\/\d{4}\s+a\s+\d{2}\/\d{2}\/\d{4}$/i.test(line)) unsupported();
      preamble.stage = 'summary';
    } else if (preamble.summary) {
      if (!SUMMARY_VALUE.test(line)) unsupported();
      parseAmountCents(line);
      preamble.labels.add(preamble.summary);
      preamble.summary = null;
    } else {
      const label = normalize(line).match(/^saldo (total|disponivel|bloqueado):?$/)?.[1];
      if (label && !preamble.labels.has(label)) preamble.summary = label;
      else if (normalize(line) === '(bloqueado + disponivel)' && preamble.labels.has('total') && !preamble.note) preamble.note = true;
      else unsupported();
    }
  };
  const finishDay = () => {
    if (!currentDay) return;
    if (pending) fail('PDF_INCOMPLETE_LINE', 'Lançamento Inter incompleto: a descrição, o valor e o saldo devem estar presentes. Nenhuma linha foi omitida.', pending.lines[0]);
    if (!currentDay.rows) fail('PDF_INCOMPLETE_LINE', 'Data do extrato Inter sem lançamentos completos. Nenhuma linha foi omitida.', currentDay.source);
    if (previousBalance !== currentDay.cents) fail('PDF_BALANCE_MISMATCH', 'O saldo do dia não confere com a última transação do PDF Inter. Confira o arquivo original.', currentDay.source);
  };
  const finishRow = () => {
    const match = pending.text.match(COMPLETE_ROW);
    if (!match) return;
    const [, originalDescription, rawAmount, rawBalance] = match;
    const descriptionParts = originalDescription.match(/^([^:"]{2,80}):\s*"([\s\S]*)"$/);
    if (!descriptionParts) fail('PDF_INTER_LAYOUT', 'Descrição do lançamento Inter fora do layout reconhecido.', pending.lines[0]);
    const history = descriptionParts[1].trim();
    // These are structural labels from this bank's PDF, not ownership evidence.
    const details = descriptionParts[2].replace(/^No estabelecimento\s+/i, '').replace(/^Cp\s*:\s*\d{8}-\s*/i, '').trim();
    if (!details) fail('PDF_INCOMPLETE_LINE', 'Descrição do lançamento Inter está vazia.', pending.lines[0]);
    const cents = parseAmountCents(rawAmount), balance = BigInt(parseAmountCents(rawBalance));
    if (previousBalance !== null && previousBalance + BigInt(cents) !== balance) fail('PDF_BALANCE_MISMATCH', 'O valor e o saldo por transação não conferem no PDF Inter. Nenhum lançamento foi importado.', pending.lines[0]);
    if (previousBalance === null) inferredOpening = balance - BigInt(cents); else checkedIntervals++;
    const source = {
      ...pending.lines[0], raw: pending.lines.map(line => line.raw).join('\n'), lines: pending.lines,
      raw_amount: rawAmount, raw_balance: rawBalance, balance_cents: balance.toString(),
      date_context: currentDay.date, date_header: currentDay.source,
    };
    transactions.push(makeImportRow({ date: currentDay.date, description: `${history} - ${details}`, cents, source }));
    if (transactions.length > MAX_IMPORT_ROWS) fail('ROW_LIMIT', `O limite é ${MAX_IMPORT_ROWS} lançamentos.`, pending.lines[0]);
    previousBalance = balance;
    currentDay.rows++;
    pending = null;
  };

  for (const { text, source } of lines) {
    if (!text) continue;
    let line = text;
    if (COLUMN_HEADER.test(line)) {
      if (pending) fail('PDF_INCOMPLETE_LINE', 'Lançamento Inter interrompido por cabeçalho sem valor e saldo completos.', pending.lines[0]);
      if (!tableStarted && (preamble.stage !== 'summary' || preamble.summary || preamble.labels.size !== 3)) fail('PDF_INTER_LAYOUT', 'O preâmbulo Inter precisa preservar a solicitação, o titular, a conta, o período e os três saldos identificados.', source);
      tableStarted = true;
      line = line.replace(COLUMN_HEADER, '').trim();
      if (!line) continue;
    }
    if (!tableStarted) {
      readPreamble(line, source);
      continue;
    }
    if (FOOTER.test(line)) {
      if (MONEY_OR_DATE.test(line) || ANY_ROW_START.test(line) || (!/^Fale com a gente$/i.test(line) && !FOOTER_CONTACTS.test(line))) fail('PDF_INTER_LAYOUT', 'Rodapé Inter contém data, valor ou conteúdo fora dos contatos reconhecidos. Nenhuma linha foi omitida.', source);
      continue;
    }
    const day = line.match(DAY);
    if (day) {
      finishDay();
      const month = MONTHS.indexOf(normalize(day[2])) + 1;
      if (!month) fail('PDF_INTER_LAYOUT', 'Mês não reconhecido no cabeçalho do PDF Inter.', source);
      const date = parseStatementDate(`${day[1].padStart(2, '0')}/${String(month).padStart(2, '0')}/${day[3]}`);
      if (date < period.start || date > period.end || (currentDay && date <= currentDay.date)) fail('PDF_DATE_ORDER', 'As datas do PDF Inter precisam seguir a ordem do extrato e pertencer ao período declarado.', source);
      const rawBalance = day[4], cents = BigInt(parseAmountCents(rawBalance));
      currentDay = { date, cents, rows: 0, source };
      balances.push({ kind: 'daily', date, amount: centsToDecimal(cents), source: { ...source, raw_balance: rawBalance } });
      continue;
    }
    if (!currentDay) fail('PDF_MISSING_DATE', 'Lançamento Inter sem cabeçalho de data completo.', source);
    if (ROW_START.test(line)) {
      if (pending) fail('PDF_INCOMPLETE_LINE', 'Lançamento Inter sem valor e saldo antes da próxima transação. Nenhuma linha foi omitida.', pending.lines[0]);
      pending = { text: line, lines: [source] };
    } else if (pending) {
      pending.text += ` ${line}`;
      pending.lines.push(source);
    } else {
      fail('PDF_INTER_LAYOUT', 'Linha da tabela Inter fora do layout reconhecido. Nenhuma linha foi omitida; confira o arquivo original.', source);
    }
    finishRow();
  }
  finishDay();
  if (!transactions.length) fail('EMPTY_STATEMENT', 'Nenhum lançamento completo reconhecido no PDF Inter.', institution.source);
  const lastDay = balances.at(-1);
  return {
    transactions, complete: true,
    metadata: {
      format: 'pdf', currency: 'BRL', page_count: pages.length, bank_name: 'Banco Inter',
      account_reference: accountReferences[0],
      period_start: period.start, period_end: period.end,
      closing_balance: lastDay.amount, closing_balance_date: lastDay.date,
      balance_requires_confirmation: lastDay.date !== period.end,
      balances, extraction: 'inter-value-running-balance-v1', source_review_required: true,
      balance_reconciliation: {
        status: 'matched', order: 'ascending', rows_with_balances: transactions.length, checked_intervals: checkedIntervals,
        checked_daily_balances: balances.length, opening_balance_inferred: centsToDecimal(inferredOpening),
        closing_balance_observed: centsToDecimal(previousBalance),
        sum_cents: transactions.reduce((sum, row) => sum + BigInt(row.amount_cents), 0n).toString(),
      },
    },
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePDFPages } from '../src/services/pdfExtractor.js';
import { finalizeStatement, ImportError } from '../src/domain/importParsers.js';

const preamble = (end = '02/04/2026') => `Solicitado em: 03/04/2026 - 10h00
PESSOA DE TESTE
CPF/CNPJ: 000.000.000-00, Instituição: Banco Inter, Agência: 0001-9, Conta: 12345678-9
Período: 01/04/2026 a ${end}
Saldo total
R$ 999,00
(bloqueado + disponível)
Saldo disponível:
R$ 999,00
Saldo bloqueado:
R$ 0,00
Valor Saldo por transação `;
const footer = 'Fale com a gente\nSAC: 0800 000 0000 (opção 09) Ouvidoria: 0800 000 0000';
const day = (date, balance) => `${date} de Abril de 2026 Saldo do dia: ${balance}`;
const pix = (value, balance, details = 'Cliente Exemplo') => `Pix recebido: "Cp :12345678-${details}" ${value} ${balance}`;
const oneDay = rows => `${preamble('01/04/2026')}${day(1, 'R$ 20,00')}\n${rows}`;

test('Inter distinguishes requested timestamp, account summary, transaction value and running balance', () => {
  const result = parsePDFPages([oneDay(`${pix('R$ 50,00', 'R$ 100,00')}\nCompra no debito: "No estabelecimento Loja Exemplo" -R$ 80,00 R$ 20,00\n${footer}`)]);
  assert.deepEqual(result.transactions.map(row => [row.date, row.amount_cents, row.source.balance_cents]), [
    ['2026-04-01', '5000', '10000'], ['2026-04-01', '-8000', '2000'],
  ]);
  assert.deepEqual(result.transactions.map(row => row.description), ['Pix recebido - Cliente Exemplo', 'Compra no debito - Loja Exemplo']);
  assert.equal(result.metadata.account_reference, '123456789');
  assert.equal(result.metadata.closing_balance, '20.00');
  assert.equal(result.metadata.closing_balance_date, '2026-04-01');
  assert.equal(result.metadata.opening_balance, undefined);
  assert.deepEqual(result.metadata.balance_reconciliation, {
    status: 'matched', order: 'ascending', rows_with_balances: 2, checked_intervals: 1,
    checked_daily_balances: 1, opening_balance_inferred: '50.00', closing_balance_observed: '20.00', sum_cents: '-3000',
  });
  assert.ok(result.transactions.every(row => row.economic_kind === 'standard' && row.external_id === null));
  assert.equal(result.transactions[0].payment_method, 'pix');
});

test('Inter keeps multiline text, split amount/balance columns and pending date across page boundaries', () => {
  const first = `${preamble()}${day(1, 'R$ 50,00')}
Pix recebido: "Cp :12345678-Cliente
Exemplo" R$ 100,00 R$ 100,00
Compra no debito: "No estabelecimento Loja"
-R$ 50,00
R$ 50,00
${day(2, 'R$ 20,00')}
${footer}`;
  const second = `Pix enviado: "Cp :12345678-Outra Pessoa" -R$ 30,00 R$ 20,00\n${footer}`;
  const result = parsePDFPages([first, second]);
  assert.deepEqual(result.transactions.map(row => [row.date, row.amount_cents]), [
    ['2026-04-01', '10000'], ['2026-04-01', '-5000'], ['2026-04-02', '-3000'],
  ]);
  assert.equal(result.transactions[0].description, 'Pix recebido - Cliente Exemplo');
  assert.equal(result.transactions[0].source.lines.length, 2);
  assert.equal(result.transactions[1].source.lines.length, 3);
  assert.equal(result.transactions[2].source.page, 2);
  assert.equal(result.transactions[2].source.date_header.page, 1);
  assert.equal(result.metadata.balance_reconciliation.checked_daily_balances, 2);
});

test('Inter supports negative balances, March accents, refunds and investment labels without inventing transfer ownership', () => {
  const text = `${preamble('01/04/2026')}${day(1, 'R$ 20,00')}
Aplicacao: "CDB EXEMPLO" -R$ 100,00 -R$ 100,00
Resgate: "CDB EXEMPLO" R$ 100,00 R$ 0,00
Pix enviado devolvido: "Cp :12345678-Cliente Exemplo" R$ 20,00 R$ 20,00`;
  const result = parsePDFPages([text]);
  assert.deepEqual(result.transactions.map(row => row.amount_cents), ['-10000', '10000', '2000']);
  assert.ok(result.transactions.every(row => row.economic_kind === 'standard'));
  const march = `${preamble('01/04/2026').replace('01/04/2026 a', '01/03/2026 a')}1 de Março de 2026 Saldo do dia: R$ 20,00\n${pix('R$ 20,00', 'R$ 20,00')}`;
  const parsedMarch = parsePDFPages([march]);
  assert.equal(parsedMarch.transactions[0].date, '2026-03-01');
  assert.equal(parsedMarch.metadata.balance_requires_confirmation, true);
});

test('Inter retains row multiplicity and immutable provenance when a document is finalized', () => {
  const text = oneDay(`${pix('R$ 10,00', 'R$ 10,00')}\n${pix('R$ 10,00', 'R$ 20,00')}`);
  const result = finalizeStatement(parsePDFPages([text]), Buffer.from(text));
  assert.equal(result.transactions.length, 2);
  assert.equal(result.transactions[0].content_fingerprint, result.transactions[1].content_fingerprint);
  assert.notEqual(result.transactions[0].source_identity, result.transactions[1].source_identity);
  assert.deepEqual(finalizeStatement(parsePDFPages([text]), Buffer.from(text)), result);
});

test('Inter rejects incomplete rows, orphan values and unrecognized table text instead of publishing a partial result', () => {
  for (const suffix of [
    'Pix enviado: "Cp :12345678-Pessoa" -R$ 10,00',
    'Pix enviado: "Cp :12345678-Pessoa" -R$ 10,00\nPix recebido: "Cp :12345678-Outra Pessoa" R$ 10,00 R$ 20,00',
    'Linha não reconhecida R$ 10,00 R$ 20,00',
    'R$ 10,00 R$ 20,00',
    'Pix enviado: "Cp :12345678-Pessoa" -R$ 10,00 R$ 10,00 R$ 20,00',
    day(2, 'R$ 20,00'),
  ]) {
    assert.throws(() => parsePDFPages([oneDay(`${pix('R$ 20,00', 'R$ 20,00')}\n${suffix}`)]), ImportError);
  }
});

test('Inter rejects inconsistent running balances, daily balances, invalid order and dates outside the period', () => {
  assert.throws(() => parsePDFPages([oneDay(`${pix('R$ 10,00', 'R$ 10,00')}\n${pix('R$ 10,00', 'R$ 19,00')}`)]), error => error.code === 'PDF_BALANCE_MISMATCH');
  assert.throws(() => parsePDFPages([oneDay(pix('R$ 10,00', 'R$ 10,00'))]), error => error.code === 'PDF_BALANCE_MISMATCH');
  const valid = `${preamble()}${day(2, 'R$ 20,00')}\n${pix('R$ 20,00', 'R$ 20,00')}`;
  assert.throws(() => parsePDFPages([`${valid}\n${day(1, 'R$ 30,00')}\n${pix('R$ 10,00', 'R$ 30,00')}`]), error => error.code === 'PDF_DATE_ORDER');
  assert.throws(() => parsePDFPages([valid.replace(day(2, 'R$ 20,00'), day(3, 'R$ 20,00'))]), error => error.code === 'PDF_DATE_ORDER');
});

test('Inter identity does not relax unsupported layouts or the generic signed-line parser', () => {
  assert.throws(() => parsePDFPages([oneDay(pix('R$ 20,00', 'R$ 20,00')).replace('Valor Saldo por transação ', '')]), error => error.code === 'PDF_INTER_LAYOUT');
  assert.throws(() => parsePDFPages([oneDay(pix('R$ 20,00', 'R$ 20,00')).replace('Período: 01/04/2026 a 01/04/2026', '')]), error => error.code === 'PDF_INTER_LAYOUT');
  assert.throws(() => parsePDFPages(['01/04/2026\nCompra -R$ 10,00 R$ 20,00']), error => error.code === 'PDF_AMBIGUOUS_LAYOUT');
  assert.equal(parsePDFPages(['01/04/2026\nCompra -R$ 10,00']).transactions[0].amount_cents, '-1000');
});

test('Inter rejects missing or repeated middle pages through balance/date continuity and an unfinished final day', () => {
  const pages = [
    `${preamble('03/04/2026')}${day(1, 'R$ 10,00')}\n${pix('R$ 10,00', 'R$ 10,00')}\n${footer}`,
    `${day(2, 'R$ 20,00')}\n${pix('R$ 10,00', 'R$ 20,00')}\n${footer}`,
    `${day(3, 'R$ 30,00')}\n${pix('R$ 10,00', 'R$ 30,00')}\n${footer}`,
  ];
  assert.equal(parsePDFPages(pages).transactions.length, 3);
  assert.throws(() => parsePDFPages([pages[0], pages[2]]), error => error.code === 'PDF_BALANCE_MISMATCH');
  assert.throws(() => parsePDFPages([pages[0], pages[1], pages[1], pages[2]]), error => error.code === 'PDF_DATE_ORDER');
  assert.throws(() => parsePDFPages([`${pages[0]}\n${day(2, 'R$ 20,00')}`]), error => error.code === 'PDF_INCOMPLETE_LINE');
});

test('Inter rejects mixed account references even when the stated periods match', () => {
  const text = `${preamble('01/04/2026').replace('Saldo total', 'Instituição: Banco Inter, Conta: 99999999-1\nSaldo total')}${day(1, 'R$ 20,00')}\n${pix('R$ 20,00', 'R$ 20,00')}`;
  assert.throws(() => parsePDFPages([text]), error => error.code === 'PDF_INTER_ACCOUNT');
});

test('Inter never skips transaction values or dates hidden behind a footer prefix', () => {
  const valid = oneDay(pix('R$ 20,00', 'R$ 20,00'));
  for (const unexpected of [
    'SAC: Pix recebido: "Pessoa C" R$ 15,00 R$ 45,00',
    'Ouvidoria: 0800 000 0000 R$ 15,00',
    'SAC: 01/04/2026',
    'Deficiência de fala e audição: Pix enviado: "Pessoa C"',
    'SAC: 0800 000 0000\nOuvidoria: ajuste desconhecido',
  ]) assert.throws(() => parsePDFPages([`${valid}\n${unexpected}`]), error => error.code === 'PDF_INTER_LAYOUT');
  assert.equal(parsePDFPages([`${valid}\n${footer}`]).transactions.length, 1);
});

test('Inter preamble accepts only identified metadata and labelled summary values, never an unknown transaction', () => {
  const valid = oneDay(pix('R$ 20,00', 'R$ 20,00'));
  for (const unexpected of [
    '01/04/2026 Ajuste anterior +R$ 5,00',
    'Ajuste anterior +R$ 5,00',
    'R$ 5,00',
    'Pix recebido: "Cliente Exemplo" R$ 5,00 R$ 5,00',
    'Metadado desconhecido',
  ]) {
    const altered = valid.replace('Valor Saldo por transação ', `${unexpected}\nValor Saldo por transação `);
    assert.throws(() => parsePDFPages([altered]), error => error.code === 'PDF_INTER_LAYOUT');
  }
  assert.throws(() => parsePDFPages([valid.replace('Saldo disponível:\nR$ 999,00', 'R$ 999,00')]), error => error.code === 'PDF_INTER_LAYOUT');
  assert.throws(() => parsePDFPages([valid.replace('CPF/CNPJ: 000.000.000-00', 'CPF/CNPJ: Ajuste anterior +R$ 5,00')]), error => error.code === 'PDF_INTER_LAYOUT');
  // The summary is the issuance snapshot, not a declared balance at period end.
  assert.equal(parsePDFPages([valid]).metadata.closing_balance, '20.00');
});

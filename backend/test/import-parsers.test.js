import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { parseAmountCents, parseStatementDate, parseCSV, parseOFX, parseStatementBuffer, finalizeStatement, ImportError } from '../src/domain/importParsers.js';
import { parsePDFPages, extractPDFText } from '../src/services/pdfExtractor.js';

test('BRL decimals preserve cents, grouping, Unicode sign and explicit debit/credit', () => {
  for (const [token, expected] of [['-50,25','-5025'],['1.234,56','123456'],['1234.56','123456'],['−R$ 2.800,00','-280000'],['1,234.56','123456'],['50,25 D','-5025'],['50,25 C','5025'],['(50,25)','-5025']]) assert.equal(parseAmountCents(token), expected);
  assert.equal(parseAmountCents('1.234', { locale: 'pt-BR' }), '123400');
  for (const token of ['1.234','1.23.4,56','NaN','Infinity','1e3','+50,25 D','-50,25 C','1,2345']) assert.throws(() => parseAmountCents(token), ImportError);
});

test('dates reject missing values, two-digit years and impossible days without using today', () => {
  assert.equal(parseStatementDate('29/02/2024'), '2024-02-29');
  assert.equal(parseStatementDate('20260102123456[-3:BRT]', { ofx: true }), '2026-01-02');
  for (const value of ['',null,'29/02/2025','31/04/2026','01/02/26','2026-13-01']) assert.throws(() => parseStatementDate(value), ImportError);
});

test('CSV supports reordered columns, quoting, escaped quotes, multiline descriptions, BOM and CRLF', () => {
  const result = parseCSV('\uFEFFValor;Descrição;Data\r\n"-1.234,56";"Mercado; \"\"Centro\"\"\r\nLoja 2";01/01/2026\r\n');
  assert.equal(result.transactions[0].amount_cents, '-123456');
  assert.equal(result.transactions[0].description, 'Mercado; "Centro"\r\nLoja 2');
  assert.equal(result.transactions[0].source.line, 2);
});

test('Pix and refund words never rewrite the bank sign or prove an internal transfer', () => {
  const rows = parseCSV('Data;Descrição;Valor\n01/01/2026;Pix enviado supermercado;-100,00\n01/01/2026;Pix recebido cliente;200,00\n01/01/2026;Pix recebido estornado;-100,00').transactions;
  assert.deepEqual(rows.map(row => [row.amount_cents,row.type,row.economic_kind]), [['-10000','expense','standard'],['20000','income','standard'],['-10000','expense','standard']]);
  assert.ok(rows.every(row => row.payment_method === 'pix'));
});

test('identical legitimate rows retain multiplicity and immutable document/row identities', () => {
  const buffer = Buffer.from('Data;Descrição;Valor\n01/01/2026;Pagamento fornecedor ABC;-10,00\n01/01/2026;Pagamento fornecedor ABC;-10,00\n01/01/2026;Pagamento fornecedor XYZ;-10,00');
  const result = parseStatementBuffer(buffer, 'csv');
  assert.equal(result.transactions.length, 3);
  assert.equal(new Set(result.transactions.map(row => row.source_identity)).size, 3);
  assert.deepEqual(parseStatementBuffer(buffer, 'csv'), result);
});

test('CSV maps separate debit and credit and rejects ambiguity, truncation, zero, foreign currency', () => {
  const result = parseCSV('Data,Descrição,Débito,Crédito\n01/01/2026,Compra,50.25,\n01/01/2026,Salário,,200.00');
  assert.deepEqual(result.transactions.map(row => row.amount_cents), ['-5025','20000']);
  for (const content of [
    'Data;Descrição;Valor\n01/01/2026;Compra;',
    'Data;Descrição;Valor\n01/01/2026;Compra;0,00',
    'Data;Descrição;Valor\n01/01/2026;"Compra;-100,00',
    'Data;Descrição;Valor;Moeda\n01/01/2026;Compra;100.00;USD',
    'Data;Descrição;Débito;Crédito\n01/01/2026;Compra;10,00;10,00',
  ]) assert.throws(() => parseCSV(content), ImportError);
});

function ofx(transactions, currency = 'BRL') {
  return `OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>${currency}\n<BANKACCTFROM><BANKID>077\n<ACCTID>123456\n<ACCTTYPE>CHECKING\n</BANKACCTFROM><BANKTRANLIST><DTSTART>20260101000000[-3:BRT]\n<DTEND>20260131000000[-3:BRT]\n${transactions}</BANKTRANLIST><LEDGERBAL><BALAMT>100.00\n<DTASOF>20260131000000[-3:BRT]\n</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
}
const txn = (id, value = '-10.00') => `<STMTTRN><TRNTYPE>DEBIT\n<DTPOSTED>20260102120000[-3:BRT]\n<TRNAMT>${value}\n<FITID>${id}\n<MEMO>Compra &amp; Loja\n</STMTTRN>`;

test('OFX preserves distinct FITID, bank/account, period, closing balance and source text', () => {
  const buffer = Buffer.from(ofx(txn('A') + txn('B')));
  const result = parseStatementBuffer(buffer, 'ofx');
  assert.equal(result.transactions.length, 2);
  assert.deepEqual(result.transactions.map(row => row.external_id), ['A','B']);
  assert.equal(result.transactions[0].description, 'Compra & Loja');
  assert.equal(result.metadata.account_reference, '123456');
  assert.equal(result.metadata.closing_balance, '100.00');
  assert.equal(result.metadata.closing_balance_date, '2026-01-31');
});

test('OFX rejects foreign currency, truncation, missing FITID and conflicting identity', () => {
  assert.throws(() => parseOFX(ofx(txn('A'),'USD')), ImportError);
  assert.throws(() => parseOFX(ofx(txn('A')).replace('</STMTTRN>','')), ImportError);
  assert.throws(() => parseOFX(ofx(txn(''))), ImportError);
  const buffer = Buffer.from(ofx(txn('A') + txn('A', '-20.00')));
  assert.throws(() => finalizeStatement(parseOFX(buffer.toString()), buffer), /identificador bancário/);
  assert.throws(() => parseStatementBuffer(Buffer.from(ofx(txn('A') + txn('A'))), 'ofx'), error => error.code === 'EXTERNAL_ID_REPEATED');
});

test('PDF carries date context across pages and retains signed source lines and balances', () => {
  const result = parsePDFPages(['Saldo inicial R$ 1.000,00\n01/01/2026\nPix enviado Loja -R$ 100,00', 'Pix recebido Cliente +R$ 200,00\nSaldo final R$ 1.100,00']);
  assert.equal(result.transactions.length, 2);
  assert.equal(result.transactions[1].date, '2026-01-01');
  assert.equal(result.transactions[1].source.page, 2);
  assert.equal(result.metadata.opening_balance, '1000.00');
  assert.equal(result.metadata.closing_balance, '1100.00');
});

test('a malformed later PDF page fails the entire extraction, never partial success', () => {
  assert.throws(() => parsePDFPages(['01/01/2026\nCompra -R$ 10,00', 'Compra -R$ 20,00 R$ 970,00']), /múltiplos valores/);
  assert.throws(() => parsePDFPages(['Pix recebido Loja +R$ 100,00']), /sem data/);
  assert.throws(() => parsePDFPages(['01/01/2026\nPix enviado Loja R$ 100,00']), /sinal/);
  assert.throws(() => parsePDFPages(['']), /escaneado/);
  assert.throws(() => parsePDFPages(['01/01/2026\nCompra -R$ 10,00', '02/01/2026 Compra -20']), error => error.code === 'PDF_INCOMPLETE_LINE');
  assert.throws(() => parsePDFPages(['01/01/2026\nCompra -R$ 10,00', 'Outra compra -20']), error => error.code === 'PDF_INCOMPLETE_LINE');
});

test('PDF extraction timeout terminates the worker instead of returning an empty batch', async () => {
  let terminated = false;
  class StalledWorker extends EventEmitter { terminate() { terminated = true; return Promise.resolve(); } }
  await assert.rejects(extractPDFText(Buffer.from('%PDF-1.4'), { timeoutMs: 5, WorkerClass: StalledWorker }), error => error.code === 'PDF_TIMEOUT');
  assert.equal(terminated, true);
});

test('PDF worker cancellation is retryable and terminates extraction', async () => {
  let terminated = false;
  class StalledWorker extends EventEmitter { terminate() { terminated = true; return Promise.resolve(); } }
  const controller = new AbortController(); controller.abort();
  await assert.rejects(extractPDFText(Buffer.from('%PDF-1.4'), { WorkerClass: StalledWorker, signal: controller.signal }), error => error.code === 'WORKER_STOPPED' && error.retryable === true);
  assert.equal(terminated, true);
});

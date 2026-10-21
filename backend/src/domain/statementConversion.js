import { ImportError, centsToDecimal, MAX_IMPORT_ROWS } from './importParsers.js';

const xml = value => {
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(String(value)))throw new ImportError('CONVERSION_XML','Descrição contém caracteres incompatíveis com OFX XML; use CSV.');
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;').replaceAll('\n','&#10;').replaceAll('\r','&#13;').replaceAll('\t','&#9;');
};
const csv = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
// A quoted CSV field alone does not stop spreadsheet formula execution.
const safeDescription = value => /^[\s]*[=+\-@\t\r]/.test(value) || value.startsWith("'csv:") ? "'csv:" + value : value;

/** Exports the immutable extracted source, not user classifications or posted balances. */
export function convertStatement(rows, job, format) {
  if (!['csv', 'ofx'].includes(format) || !rows.length || rows.length > MAX_IMPORT_ROWS) throw new ImportError('CONVERSION_FORMAT', 'Conversão disponível somente para CSV e OFX de um lote completo.');
  const ordered = [...rows].sort((a,b) => a.row_number-b.row_number);
  if (ordered.length !== Number(job.total_transactions) || ordered.some((row,index) => row.row_number !== index+1 || !/^[a-f0-9]{64}$/.test(row.source_identity))) throw new ImportError('INCOMPLETE_STATEMENT', 'Todas as linhas precisam estar disponíveis para converter.');
  if (format === 'csv') {
    const header = ['Data', 'Descrição', 'Valor', 'Moeda', 'lume_source_identity', 'lume_document_hash', 'lume_conversion'];
    return '\uFEFF' + [header.map(csv).join(';'), ...ordered.map(row => [row.date, safeDescription(row.description), centsToDecimal(row.amount_cents), 'BRL', row.source_identity, job.document_hash, 'review-required-v1'].map(csv).join(';'))].join('\r\n') + '\r\n';
  }
  // The explicit synthetic namespace prevents these FITIDs from being interpreted
  // as identifiers assigned by a bank. Reimport uses document identities instead.
  const transactions = ordered.map(row => `<STMTTRN><TRNTYPE>${BigInt(row.amount_cents)<0n?'DEBIT':'CREDIT'}</TRNTYPE><DTPOSTED>${row.date.replaceAll('-','')}120000</DTPOSTED><TRNAMT>${centsToDecimal(row.amount_cents)}</TRNAMT><FITID>LUME-CONVERTED-${row.source_identity}</FITID><MEMO>${xml(row.description)}</MEMO></STMTTRN>`).join('\n');
  const dates = ordered.map(row => row.date).sort();
  return `<?xml version="1.0" encoding="UTF-8"?>\n<OFX><SIGNONMSGSRSV1><SONRS><STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS><FI><ORG>LUME-CONVERSION-REVIEW-REQUIRED</ORG></FI></SONRS></SIGNONMSGSRSV1><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL</CURDEF><BANKACCTFROM><BANKID>LUME-CONVERSION</BANKID><ACCTID>DOCUMENT-${xml(job.document_hash)}</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM><BANKTRANLIST><DTSTART>${dates[0].replaceAll('-','')}</DTSTART><DTEND>${dates.at(-1).replaceAll('-','')}</DTEND>\n${transactions}\n</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
}

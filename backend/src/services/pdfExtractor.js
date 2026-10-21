import { Worker } from 'node:worker_threads';
import { ImportError, parseAmountCents, centsToDecimal, parseStatementDate, makeImportRow, finalizeStatement, MAX_IMPORT_ROWS } from '../domain/importParsers.js';
import { MAX_IMPORT_BYTES, MAX_PDF_PAGES, MAX_OCR_PAGES } from '../domain/importLimits.js';
import { recognizeLocalPage, inspectImage } from './localOcr.js';

const MONEY = /[+\-−–—]?\s*(?:R\$\s*)?(?:\d{1,3}(?:[.,]\d{3})+|\d+)[.,]\d{2}(?:\s*[DC]\b)?/g;

/** Only explicit, complete source lines are supported. Unknown layouts fail closed. */
export function parsePDFPages(pages) {
  if (!Array.isArray(pages) || !pages.length || pages.length > MAX_PDF_PAGES) throw new ImportError('PDF_PAGE_LIMIT', `PDF precisa ter entre 1 e ${MAX_PDF_PAGES} páginas.`);
  const transactions = [], balances = [];
  let currentDate = null, hasText = false;
  for (const [pageIndex, page] of pages.entries()) {
    for (const [lineIndex, original] of page.split(/\r?\n/).entries()) {
      const line = original.trim();
      if (!line) continue;
      hasText = true;
      const dates = [...line.matchAll(/\b(?:\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})\b/g)];
      const monies = [...line.matchAll(MONEY)];
      const source = { page: pageIndex + 1, line: lineIndex + 1, raw: original };
      if (!monies.length) {
        if (/^(?:\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})$/.test(line)) currentDate = parseStatementDate(line);
        else if (dates.length || /(?:R\$|BRL|[+\-−–—]\s*\d|\d[.,]\d)/i.test(line)) throw new ImportError('PDF_INCOMPLETE_LINE', 'Linha com data ou valor incompleto. O PDF não pode ser aprovado parcialmente; exporte CSV ou OFX.', source);
        continue;
      }
      if (monies.length !== 1) throw new ImportError('PDF_AMBIGUOUS_LAYOUT', 'PDF tem múltiplos valores na mesma linha. Exporte CSV ou OFX para preservar a ordem das colunas.', source);
      const token = monies[0][0].trim();
      const cents = parseAmountCents(token);
      if (/\bsaldo\s+(?:inicial|anterior|final|atual|de fechamento|ao final)\b/i.test(line)) {
        const date = dates.length === 1 ? parseStatementDate(dates[0][0]) : null;
        balances.push({ kind: /inicial|anterior/i.test(line) ? 'opening' : 'closing', amount: centsToDecimal(cents), date, source });
        continue;
      }
      if (dates.length > 1 || (!dates.length && !currentDate)) throw new ImportError('PDF_MISSING_DATE', 'Lançamento PDF sem data completa inequívoca. Exporte CSV ou OFX.', source);
      const date = dates.length === 1 ? parseStatementDate(dates[0][0]) : currentDate;
      if (dates.length === 1) currentDate = date;
      const description = line.replace(monies[0][0], '').replace(dates[0]?.[0] || /^$/, '').trim();
      if (/\b(?:total|resumo|limite|saldo|vencimento|cotacao|cotação)\b/i.test(description)) throw new ImportError('PDF_UNEXPLAINED_VALUE', 'Linha monetária não reconhecida como lançamento. O lote inteiro exige outro formato.', source);
      if (!/^[+\-−–—]/.test(token) && !/[DC]$/i.test(token)) throw new ImportError('PDF_MISSING_SIGN', 'PDF não informa sinal ou D/C do lançamento. Exporte CSV ou OFX.', source);
      transactions.push(makeImportRow({ date, description, cents, source: { ...source, raw_amount: token, date_context: currentDate } }));
      if (transactions.length > MAX_IMPORT_ROWS) throw new ImportError('ROW_LIMIT', `O limite é ${MAX_IMPORT_ROWS} lançamentos.`);
    }
  }
  if (!hasText) throw new ImportError('PDF_OCR_REQUIRED', 'PDF escaneado ou sem texto selecionável. Exporte CSV/OFX; OCR não é suportado.');
  if (!transactions.length) throw new ImportError('EMPTY_STATEMENT', 'Nenhum lançamento completo reconhecido no PDF. Exporte CSV ou OFX.');
  const metadata = { format: 'pdf', currency: 'BRL', page_count: pages.length, balances, extraction: 'deterministic-signed-line-v1', source_review_required: true };
  const opening = balances.filter(balance => balance.kind === 'opening');
  const closing = balances.filter(balance => balance.kind === 'closing');
  if (opening.length === 1) metadata.opening_balance = opening[0].amount;
  if (closing.length === 1) metadata.closing_balance = closing[0].amount;
  return { transactions, metadata, complete: true };
}

export function extractPDFText(buffer, { timeoutMs = 30000, WorkerClass = Worker, signal } = {}) {
  if (buffer.length > MAX_IMPORT_BYTES) return Promise.reject(new ImportError('FILE_LIMIT', 'PDF excede 20 MB.'));
  if (buffer.subarray(0, 5).toString() !== '%PDF-') return Promise.reject(new ImportError('INVALID_PDF', 'Conteúdo não é um PDF.'));
  return new Promise((resolve, reject) => {
    const worker = new WorkerClass(new URL('./importPdfTextWorker.js', import.meta.url), { workerData: { buffer }, resourceLimits: { maxOldGenerationSizeMb: 96, maxYoungGenerationSizeMb: 16 } });
    let settled = false;
    const finish = (error, pages) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      void worker.terminate();
      if (error) reject(error); else resolve(pages);
    };
    const abort = () => finish(Object.assign(new Error('Extração PDF interrompida; o lote será retomado.'), { code: 'WORKER_STOPPED', retryable: true }));
    const timeout = setTimeout(() => finish(new ImportError('PDF_TIMEOUT', 'PDF ultrapassou o tempo de extração. Exporte CSV ou OFX.')), timeoutMs);
    worker.once('message', message => message.error ? finish(new ImportError(message.code || 'PDF_INVALID', message.error)) : finish(null, message.pages));
    worker.once('error', () => finish(new ImportError('PDF_INVALID', 'Falha ao extrair PDF com segurança. Exporte CSV ou OFX.')));
    worker.once('exit', code => { if (!settled) finish(new ImportError('PDF_WORKER_EXIT', `Extração PDF terminou sem resultado (${code}).`)); });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export async function extractTransactionsFromPDF(buffer, _categories = [], options = {}) {
  const pages = await extractPDFText(buffer, options);
  const reports=[];let ocrPages=0;const start=Date.now();
  for(let index=0;index<pages.length;index++) {
    const cached=options.cachedPages?.find(page=>page.page===index+1);
    if(cached){pages[index]=cached.text;reports.push(cached.info);if(cached.info?.engine==='tesseract-local')ocrPages++;continue;}
    let result={text:pages[index],info:{page:index+1,engine:'pdf-text',review_required:true}};
    if(!pages[index].trim()) {
      if(++ocrPages>MAX_OCR_PAGES)throw new ImportError('OCR_PAGE_LIMIT',`OCR limitado a ${MAX_OCR_PAGES} páginas digitalizadas.`,{page:index+1});
      if(Date.now()-start>120000)throw new ImportError('OCR_TOTAL_TIMEOUT','OCR excedeu o orçamento de dois minutos; nenhuma página foi omitida.',{page:index+1});
      result=await (options.recognizePage||recognizeLocalPage)(buffer,{page:index+1,signal:options.signal});
    }
    pages[index]=result.text;reports.push(result.info);await options.onPage?.({page:index+1,...result});
  }
  const parsed=parsePDFPages(pages);parsed.metadata.page_reports=reports;parsed.metadata.ocr_pages=ocrPages;
  return finalizeStatement(parsed, buffer);
}

export async function extractTransactionsFromImage(buffer,type,options={}) {
  inspectImage(buffer,type);
  const result=options.cachedPages?.[0]||await (options.recognizePage||recognizeLocalPage)(buffer,{imageType:type,page:1,signal:options.signal});
  await options.onPage?.({page:1,...result});
  const parsed=parsePDFPages([result.text]);parsed.metadata={...parsed.metadata,format:type,ocr_pages:1,page_reports:[result.info],extraction:'tesseract-local-signed-lines-v1'};
  return finalizeStatement(parsed,buffer);
}

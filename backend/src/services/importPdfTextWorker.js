import { parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
try {
  const pdfParse = require('pdf-parse/lib/pdf-parse.js');
  const pages = [];
  let characters = 0;
  const pdf = await pdfParse(Buffer.from(workerData.buffer), {
    max: 81,
    pagerender: async page => {
      const content = await page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
      let y = null, text = '';
      for (const item of content.items) {
        if (y !== null && Math.abs(item.transform[5] - y) > 2) text += '\n';
        else if (text && !text.endsWith(' ')) text += ' ';
        text += item.str;
        y = item.transform[5];
      }
      characters += text.length;
      if (characters > 250000) throw new Error('PDF_TEXT_LIMIT');
      pages.push(text);
      return text;
    },
  });
  if (pdf.numpages > 80) parentPort.postMessage({ error: 'PDF excede 80 páginas.', code: 'PDF_PAGE_LIMIT' });
  else parentPort.postMessage({ pages });
} catch (error) {
  parentPort.postMessage({ error: error.message === 'PDF_TEXT_LIMIT' ? 'PDF excede limite de texto.' : 'PDF corrompido, protegido ou layout não suportado.', code: 'PDF_INVALID' });
}

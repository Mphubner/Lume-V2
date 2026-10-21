import { Worker } from 'node:worker_threads';
import { ImportError } from '../domain/importParsers.js';
import { MAX_IMPORT_BYTES } from '../domain/importLimits.js';

/** ZIP central-directory budgets are checked before an XML parser sees a workbook. */
export function inspectWorkbookZip(buffer) {
  if (buffer.length<22 || buffer.length > MAX_IMPORT_BYTES || buffer.readUInt32LE(0) !== 0x04034b50) throw new ImportError('XLSX_INVALID', 'Conteúdo não é uma planilha XLSX válida.');
  let end = -1;
  for (let i=buffer.length-22; i>=Math.max(0,buffer.length-65557); i--) if (buffer.readUInt32LE(i)===0x06054b50) { end=i; break; }
  if (end<0) throw new ImportError('XLSX_INVALID', 'Planilha ZIP incompleta.');
  const entries=buffer.readUInt16LE(end+10), offset=buffer.readUInt32LE(end+16);
  if (buffer.readUInt16LE(end+4)!==0 || buffer.readUInt16LE(end+6)!==0 || entries>1000 || entries===0 || entries===65535) throw new ImportError('XLSX_LIMIT', 'Planilha com arquivos internos demais ou ZIP multipart não suportado.');
  let cursor=offset,total=0;
  for(let i=0;i<entries;i++) {
    if(cursor+46> end || buffer.readUInt32LE(cursor)!==0x02014b50) throw new ImportError('XLSX_INVALID', 'Diretório ZIP inválido.');
    const compressed=buffer.readUInt32LE(cursor+20),unpacked=buffer.readUInt32LE(cursor+24),nameSize=buffer.readUInt16LE(cursor+28),extra=buffer.readUInt16LE(cursor+30),comment=buffer.readUInt16LE(cursor+32);
    const name=buffer.subarray(cursor+46,cursor+46+nameSize).toString(); total+=unpacked;
    if(total>50*1024*1024 || unpacked>20*1024*1024 || unpacked/Math.max(1,compressed)>250 || buffer.readUInt16LE(cursor+8)&1) throw new ImportError('XLSX_LIMIT', 'Planilha excede orçamento de expansão ou está criptografada.');
    if(/(?:^|\/)\.\.(?:\/|$)|vbaProject|externalLinks/i.test(name)) throw new ImportError('XLSX_ACTIVE_CONTENT', 'Macros e vínculos externos não são aceitos. Exporte somente os valores em CSV.');
    cursor+=46+nameSize+extra+comment;
  }
  if(cursor!==end) throw new ImportError('XLSX_INVALID', 'Diretório ZIP inconsistente.');
}

export function extractSpreadsheet(buffer, options={}, { signal, timeoutMs=35000 }={}) {
  inspectWorkbookZip(buffer);
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./spreadsheetWorker.js',import.meta.url),{workerData:{buffer,options},resourceLimits:{maxOldGenerationSizeMb:192,maxYoungGenerationSizeMb:24}});
    let settled=false;
    const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);void worker.terminate();error?reject(error):resolve(result);};
    const abort=()=>finish(Object.assign(new Error('Planilha interrompida; processamento será retomado.'),{code:'WORKER_STOPPED',retryable:true}));
    const timer=setTimeout(()=>finish(new ImportError('XLSX_TIMEOUT','Planilha ultrapassou o prazo. Exporte CSV.')),timeoutMs);
    worker.once('message',message=>message.error?finish(new ImportError(message.code,message.error,message.details)):finish(null,message.result));
    worker.once('error',()=>finish(new ImportError('XLSX_INVALID','Planilha inválida ou excedeu recursos. Exporte CSV.')));
    worker.once('exit',()=>{if(!settled)finish(new ImportError('XLSX_INVALID','Planilha terminou sem resultado.'));});
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  });
}

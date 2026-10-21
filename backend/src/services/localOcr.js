import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdtemp, writeFile, stat, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ImportError } from '../domain/importParsers.js';

const execute=promisify(execFile);
export const ocrConfig=()=>({enabled:process.env.LUME_OCR_ENABLED==='true',tesseract:process.env.LUME_TESSERACT_PATH,tessdata:process.env.LUME_TESSDATA_PATH,pdftoppm:process.env.LUME_PDFTOPPM_PATH});
export async function localOcrCapability(config=ocrConfig()) {
  if(!config.enabled)return {available:false,reason:'OCR local desativado. Envie PDF com texto, CSV, OFX ou XLSX.'};
  if(![config.tesseract,config.tessdata,config.pdftoppm].every(value=>value&&path.isAbsolute(value)))return {available:false,reason:'OCR requer caminhos locais absolutos do Tesseract, tessdata e pdftoppm.'};
  try {await Promise.all([access(config.tesseract),access(config.pdftoppm),access(path.join(config.tessdata,'por.traineddata'))]);}
  catch{return {available:false,reason:'Motor OCR local ou dados de português não estão instalados.'};}
  return {available:true,engine:'tesseract-local',language:'por',confidence_min:80,max_ocr_pages:20};
}

export function parseOcrTsv(tsv) {
  const lines=new Map();let confidence=0,words=0,lowest=100;
  for(const line of tsv.split(/\r?\n/).slice(1)) {
    const fields=line.split('\t');if(fields.length<12||fields[0]!=='5'||!fields.slice(11).join('\t').trim())continue;
    const score=Number(fields[10]),text=fields.slice(11).join('\t').trim();
    if(!Number.isFinite(score)||score<0)throw new ImportError('OCR_UNREADABLE','OCR retornou confiança inválida.');
    const key=fields.slice(1,5).join(':');lines.set(key,[...(lines.get(key)||[]),text]);confidence+=score;lowest=Math.min(lowest,score);words++;
  }
  if(!words)throw new ImportError('OCR_UNREADABLE','Página sem palavras legíveis. Nenhuma página será omitida.');
  const average=confidence/words;
  // A single uncertain number/sign/date can change the financial meaning.
  if(average<80||lowest<60)throw new ImportError('OCR_LOW_CONFIDENCE',`OCR insuficiente (${average.toFixed(1)}% médio, mínimo ${lowest.toFixed(1)}%). Confira outro formato.`,{confidence:average,lowest_confidence:lowest});
  return {text:[...lines.values()].map(words=>words.join(' ')).join('\n'),info:{engine:'tesseract-local',confidence:Number(average.toFixed(2)),lowest_confidence:lowest,word_count:words,review_required:true}};
}

/** Rasterizes exactly one page; each temporary directory is deleted before returning. */
export async function recognizeLocalPage(buffer,{page,imageType,signal,config=ocrConfig(),run=execute}={}) {
  const capability=await localOcrCapability(config);
  if(!capability.available)throw new ImportError('OCR_UNAVAILABLE',capability.reason,{page});
  const temporary=await mkdtemp(path.join(os.tmpdir(),'lume-ocr-'));
  try {
    const input=path.join(temporary,imageType?'source.'+imageType:'source.pdf');await writeFile(input,buffer);
    let raster=input;
    if(!imageType) {
      const prefix=path.join(temporary,'page');
      await run(config.pdftoppm,['-f',String(page),'-l',String(page),'-singlefile','-r','120','-scale-to','2200','-png',input,prefix],{timeout:20000,maxBuffer:2*1024*1024,windowsHide:true,signal});
      raster=prefix+'.png';
    }
    if((await stat(raster)).size>16*1024*1024)throw new ImportError('OCR_RASTER_LIMIT','Imagem da página excede 16 MB.',{page});
    const result=await run(config.tesseract,[raster,'stdout','--tessdata-dir',config.tessdata,'-l','por','--psm','6','tsv'],{timeout:20000,maxBuffer:2*1024*1024,windowsHide:true,signal});
    const parsed=parseOcrTsv(result.stdout);parsed.info.page=page||1;
    if(parsed.text.length>64000)throw new ImportError('OCR_TEXT_LIMIT','Texto OCR da página excede o limite.',{page});
    return parsed;
  }catch(error){
    if(error instanceof ImportError){error.details={...error.details,page:page||1};throw error;}
    if(signal?.aborted)throw Object.assign(new Error('OCR interrompido; lote será retomado.'),{code:'WORKER_STOPPED',retryable:true});
    throw new ImportError(error.killed?'OCR_TIMEOUT':'OCR_FAILED',`Não foi possível ler a página ${page||1} localmente. Nenhuma página foi omitida.`,{page:page||1});
  }finally{await rm(temporary,{recursive:true,force:true});}
}

export function inspectImage(buffer,type) {
  let width,height;
  if(type==='png'&&buffer.length>=24&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {width=buffer.readUInt32BE(16);height=buffer.readUInt32BE(20);}
  else if(['jpg','jpeg'].includes(type)&&buffer[0]===255&&buffer[1]===216) {
    for(let cursor=2;cursor+9<buffer.length;) {
      if(buffer[cursor]!==255)break;
      const marker=buffer[cursor+1],length=buffer.readUInt16BE(cursor+2);
      if([0xc0,0xc1,0xc2].includes(marker)){height=buffer.readUInt16BE(cursor+5);width=buffer.readUInt16BE(cursor+7);break;}
      if(length<2)break;cursor+=2+length;
    }
  }
  if(!width||!height||width*height>12000000||width>6000||height>6000)throw new ImportError('IMAGE_LIMIT','Imagem inválida ou maior que 12 megapixels / 6000 px por lado.');
  return {width,height};
}

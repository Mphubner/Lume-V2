import { IMPORT_CHUNK_ROWS, MAX_IMPORT_BYTES, MAX_PDF_PAGES, MAX_OCR_PAGES } from '../domain/importLimits.js';
import { MAX_IMPORT_ROWS, sha256 } from '../domain/importParsers.js';
import { localOcrCapability } from './localOcr.js';

export function canonicalJSON(value) {
  if(Array.isArray(value))return '['+value.map(item=>canonicalJSON(item===undefined?null:item)).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).filter(key=>value[key]!==undefined).sort().map(key=>JSON.stringify(key)+':'+canonicalJSON(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
export function prepareImportChunks(result) {
  const chunks=[];
  for(let index=0;index<result.transactions.length;index+=IMPORT_CHUNK_ROWS) {
    const payload=canonicalJSON(result.transactions.slice(index,index+IMPORT_CHUNK_ROWS));
    chunks.push({index:chunks.length+1,payload,hash:sha256(payload),rows:Math.min(IMPORT_CHUNK_ROWS,result.transactions.length-index)});
  }
  const manifest={version:1,document_hash:result.metadata.document_hash,rows:result.transactions.length,sum_cents:result.metadata.sum_cents,metadata:result.metadata,chunks:chunks.map(({index,hash,rows})=>({index,hash,rows}))};
  const payload=canonicalJSON(manifest);
  return {chunks,manifest,payload,hash:sha256(payload)};
}
export async function getImportCapabilities() {
  const ocr=await localOcrCapability();
  return {formats:['csv','ofx','xlsx','txt','pdf'],image_formats:ocr.available?['png','jpg','jpeg']:[],ocr,limits:{file_bytes:MAX_IMPORT_BYTES,rows:MAX_IMPORT_ROWS,chunk_rows:IMPORT_CHUNK_ROWS,pdf_pages:MAX_PDF_PAGES,ocr_pages:MAX_OCR_PAGES,ocr_page_timeout_ms:20000,ocr_total_timeout_ms:120000},review_required:true,processing:'durable-chunks-v1',schema_version:'202610200007'};
}

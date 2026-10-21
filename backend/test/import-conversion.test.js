import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseStatementBuffer, ImportError } from '../src/domain/importParsers.js';
import { convertStatement } from '../src/domain/statementConversion.js';
import { extractSpreadsheet,inspectWorkbookZip } from '../src/services/spreadsheetExtractor.js';
import { parseOcrTsv,localOcrCapability,recognizeLocalPage,inspectImage } from '../src/services/localOcr.js';
import { extractTransactionsFromPDF } from '../src/services/pdfExtractor.js';
import { prepareImportChunks } from '../src/services/importPipeline.js';

test('CSV and OFX conversion preserve cents, dates, multiplicity and document provenance without inventing bank identity',()=>{
 const parsed=parseStatementBuffer(Buffer.from('Data;Descrição;Valor\n01/01/2026;"=2+2 < & loja\nCentro";-0,01\n01/01/2026;Pix cliente;1234,56\n01/01/2026;Pix cliente;1234,56'),'csv');
 const job={total_transactions:parsed.transactions.length,document_hash:parsed.metadata.document_hash};
 for(const format of ['csv','ofx']) {
  const content=convertStatement(parsed.transactions,job,format),roundtrip=parseStatementBuffer(Buffer.from(content),format);
  assert.deepEqual(roundtrip.transactions.map(row=>[row.date,row.description,row.amount_cents,row.source_identity]),parsed.transactions.map(row=>[row.date,row.description,row.amount_cents,row.source_identity]));
  assert.ok(roundtrip.transactions.every(row=>row.external_id===null));
  if(format==='csv')assert.ok(content.includes("'csv:=2+2"));else assert.ok(content.includes('<FITID>LUME-CONVERTED-'));
 }
 assert.throws(()=>convertStatement(parsed.transactions.slice(1),job,'csv'),/Todas as linhas/);
});

test('canonical chunk manifest remains stable when persisted JSON keys change order',()=>{
 const parsed=parseStatementBuffer(Buffer.from('Data;Descrição;Valor\n01/01/2026;Loja;-0,01'),'csv');
 const first=prepareImportChunks(parsed);
 const row=parsed.transactions[0];parsed.transactions[0]=Object.fromEntries(Object.entries(row).reverse());
 assert.equal(prepareImportChunks(parsed).hash,first.hash);
});

async function workbookBuffer({formula=false,multiple=false,hidden=false}={}) {
 const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Extrato');
 sheet.addRow(['Data','Descrição','Valor']);sheet.addRow([new Date('2026-01-02T00:00:00.000Z'),'Pix recebido cliente',1234.56]);
 sheet.addRow(['03/01/2026','Mercado',formula?{formula:'-10/2',result:-5}:-0.01]);
 if(multiple)workbook.addWorksheet('Outra').addRow(['Não ignorar']);
 if(hidden)sheet.getRow(3).hidden=true;
 return Buffer.from(await workbook.xlsx.writeBuffer());
}
test('real XLSX worker reads typed dates and exact signed values with source cells',async()=>{
 const result=await extractSpreadsheet(await workbookBuffer());
 assert.deepEqual(result.transactions.map(row=>[row.date,row.amount_cents]),[['2026-01-02','123456'],['2026-01-03','-1']]);
 assert.equal(result.metadata.format,'xlsx');assert.equal(result.transactions[1].source.xlsx_row,3);
});
test('XLSX rejects formulas even with cached values, multiple/hidden rows and zip expansion attacks',async()=>{
 for(const options of [{formula:true},{multiple:true},{hidden:true}])await assert.rejects(extractSpreadsheet(await workbookBuffer(options)),ImportError);
 const buffer=await workbookBuffer();const central=buffer.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));buffer.writeUInt32LE(60*1024*1024,central+24);
 assert.throws(()=>inspectWorkbookZip(buffer),error=>error.code==='XLSX_LIMIT');
 assert.throws(()=>inspectWorkbookZip(Buffer.from('PK')),ImportError);
});

function makePDF(pageTexts) {
 const objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${pageTexts.map((_,i)=>`${4+i*2} 0 R`).join(' ')}] /Count ${pageTexts.length} >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 for(const text of pageTexts){const stream=`BT /F1 12 Tf 40 740 Td (${text.replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)')}) Tj ET`;objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length+2} 0 R >>`,`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);}
 let source='%PDF-1.4\n%'+'.'.repeat(1024)+'\n';const offsets=[0];for(const [i,obj]of objects.entries()){offsets.push(Buffer.byteLength(source));source+=`${i+1} 0 obj\n${obj}\nendobj\n`;}
 const xref=Buffer.byteLength(source);source+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return Buffer.from(source);
}
test('real PDF text worker preserves complete pages and checkpoints each page',async()=>{
 const pages=[];const result=await extractTransactionsFromPDF(makePDF(['01/01/2026 Loja -10,00','02/01/2026 Cliente +20,00']),[],{onPage:page=>pages.push(page)});
 assert.deepEqual(result.transactions.map(row=>row.amount_cents),['-1000','2000']);assert.equal(pages.length,2);assert.equal(result.metadata.ocr_pages,0);
});

const tsv=confidence=>'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n'+['01/01/2026','Loja','-10,00'].map((text,index)=>`5\t1\t1\t1\t1\t${index+1}\t0\t0\t10\t10\t${confidence}\t${text}`).join('\n');
test('OCR fails closed for an unread page or an uncertain word and advertises disabled engine honestly',async()=>{
 assert.equal(parseOcrTsv(tsv(95)).text,'01/01/2026 Loja -10,00');
 for(const text of [tsv(40),'level\ttext'])assert.throws(()=>parseOcrTsv(text),ImportError);
 assert.equal((await localOcrCapability({enabled:false})).available,false);
 assert.throws(()=>inspectImage(Buffer.from('not a PNG'),'png'),ImportError);
});
test('OCR process contract uses local files, bounded child processes and TSV; this is a process stub, not live OCR',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'lume-ocr-test-'));
 try {
  const config={enabled:true,tesseract:path.join(directory,'tesseract.exe'),pdftoppm:path.join(directory,'pdftoppm.exe'),tessdata:directory};
  await Promise.all([writeFile(config.tesseract,''),writeFile(config.pdftoppm,''),writeFile(path.join(directory,'por.traineddata'),'')]);
  const calls=[];
  const result=await recognizeLocalPage(Buffer.from('image'),{imageType:'png',config,run:async(file,args,options)=>{calls.push({file,args,options});return {stdout:tsv(95)};}});
  assert.equal(result.info.confidence,95);assert.equal(calls[0].options.timeout,20000);assert.ok(calls[0].args.includes('--tessdata-dir'));assert.equal(calls[0].options.windowsHide,true);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('scanned PDF reuses checkpointed OCR page while an unread later page blocks the complete document',async()=>{
 const buffer=makePDF(['','']);let calls=0;
 await assert.rejects(extractTransactionsFromPDF(buffer,[],{cachedPages:[{page:1,text:'01/01/2026 Loja -10,00',info:{engine:'tesseract-local',confidence:95}}],recognizePage:async(_buffer,{page})=>{calls++;assert.equal(page,2);throw new ImportError('OCR_UNREADABLE','Página ilegível.',{page});}}),error=>error.code==='OCR_UNREADABLE');
 assert.equal(calls,1);
});

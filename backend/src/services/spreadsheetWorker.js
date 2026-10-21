import { parentPort, workerData } from 'node:worker_threads';
import ExcelJS from 'exceljs';
import { ImportError, parseCSV, finalizeStatement, MAX_IMPORT_ROWS } from '../domain/importParsers.js';

try {
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(workerData.buffer));
  const sheets=workbook.worksheets.filter(sheet=>sheet.actualRowCount>0);
  if(sheets.length!==1)throw new ImportError('XLSX_SHEETS','Envie uma única aba preenchida por arquivo.');
  const sheet=sheets[0];
  if(sheet.state!=='visible'||sheet.rowCount>MAX_IMPORT_ROWS+1||sheet.columnCount>100||Object.keys(sheet._merges).length)throw new ImportError('XLSX_LAYOUT','Aba oculta, células mescladas ou planilha acima do limite. Exporte uma tabela simples.');
  const records=[];
  for(let n=1;n<=sheet.rowCount;n++) {
    const row=sheet.getRow(n);
    if(row.hidden)throw new ImportError('XLSX_HIDDEN','Linhas ocultas não são aceitas: confira a planilha inteira.');
    const values=[];
    for(let col=1;col<=sheet.columnCount;col++) {
      const cell=row.getCell(col),value=cell.value;
      if(sheet.getColumn(col).hidden)throw new ImportError('XLSX_HIDDEN','Colunas ocultas não são aceitas.');
      if(value&&typeof value==='object'&&!(value instanceof Date))throw new ImportError('XLSX_FORMULA','Fórmulas, erros, links e campos ricos não são aceitos; exporte os valores em CSV.',{sheet:sheet.name,row:n,column:col});
      if(typeof value==='boolean')throw new ImportError('XLSX_VALUE','Campo booleano não pode ser interpretado como extrato.');
      values.push(value instanceof Date?value.toISOString().slice(0,10):String(value??''));
    }
    records.push(values);
  }
  const text=records.map(record=>record.map(value=>'"'+value.replaceAll('"','""')+'"').join(';')).join('\n');
  const result=parseCSV(text,{...workerData.options,delimiter:';'});
  for(const row of result.transactions)row.source={...row.source,sheet:sheet.name,xlsx_row:row.source.line,raw_cells:records[row.source.line-1]};
  result.metadata={...result.metadata,format:'xlsx',sheet:sheet.name,source_review_required:true,extraction:'exceljs-values-only-v1'};
  parentPort.postMessage({result:finalizeStatement(result,Buffer.from(workerData.buffer))});
}catch(error){parentPort.postMessage({error:error instanceof ImportError?error.message:'Planilha corrompida ou não suportada.',code:error.code||'XLSX_INVALID',details:error.details});}

import { beforeEach,afterEach,expect,it,vi } from 'vitest';
import { render,screen,fireEvent,waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ImportPage from '../src/pages/import/ImportPage';
import api from '../src/services/api';
vi.mock('../src/services/api',()=>({default:{getAccounts:vi.fn(),getImportHistory:vi.fn(),request:vi.fn(),uploadFile:vi.fn()}}));
beforeEach(()=>{
 api.getAccounts.mockResolvedValue([{id:'account-A',name:'Conta fixture',type:'checking',balance_date:'2026-01-01'}]);
 api.getImportHistory.mockResolvedValue([]);
 api.request.mockImplementation(async endpoint=>endpoint==='/import/capabilities'?{ocr:{available:false,reason:'OCR local desativado.'}}:{filename:'conversao.csv',content:'Data;Descrição;Valor',media_type:'text/csv;charset=utf-8',review_required:true});
 URL.createObjectURL=vi.fn(()=> 'blob:converted');URL.revokeObjectURL=vi.fn();
 vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
});
afterEach(()=>vi.restoreAllMocks());
it('descreve OCR indisponível e não oferece imagens como formato ativo',async()=>{
 render(<MemoryRouter><ImportPage/></MemoryRouter>);
 await screen.findByText('OCR local desativado.');
 const input=screen.getByLabelText('Arquivo original (até 20 MB)');
 expect(input.accept).toContain('.xlsx');expect(input.accept).toContain('.txt');expect(input.accept).not.toContain('.png');
});
it('mostra partes já salvas sem permitir conversão de um documento incompleto',async()=>{
 api.getImportHistory.mockResolvedValue([{id:'partial',filename:'parcial.csv',status:'processing',pipeline_stage:'saving_chunks',processed_rows:500,total_transactions:1201,processed_pages:2}]);
 render(<MemoryRouter><ImportPage/></MemoryRouter>);
 await screen.findByText(/500 de 1201 linhas salvas/);
 expect(screen.queryByText('Converter CSV')).toBeNull();expect(screen.queryByText('Conferir lote')).toBeNull();
});
it('baixa a conversão integral disponível para conferência sem aprovar o lote',async()=>{
 api.getImportHistory.mockResolvedValue([{id:'complete',filename:'extrato.xlsx',status:'needs_review',total_transactions:2}]);
 render(<MemoryRouter><ImportPage/></MemoryRouter>);
 fireEvent.click(await screen.findByText('Converter CSV'));
 await waitFor(()=>expect(api.request).toHaveBeenCalledWith('/import/complete/convert?format=csv'));
 expect(URL.createObjectURL).toHaveBeenCalledOnce();expect(api.uploadFile).not.toHaveBeenCalled();
 expect(screen.getByText('Conferir lote')).toBeTruthy();
});

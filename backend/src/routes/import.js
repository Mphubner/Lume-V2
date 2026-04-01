import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import multer from 'multer';
import { categorizeTransaction } from '../services/aiService.js';
import { extractTransactionsFromPDF } from '../services/pdfExtractor.js';
import { logAudit } from './audit.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authMiddleware);

// Processamento Assíncrono da Fila
async function processImportBackground(user, fileBuffer, fileType, importRecordId, accountId, memberId, accountType, familyId) {
  try {
    let rawTransactions = [];
    let discoveredTitular = null;

    const [categoriesRes, rulesRes] = await Promise.all([
      supabase.from('categories').select('*').or(`user_id.eq.${user.id},is_system.eq.true`),
      supabase.from('ai_rules').select('*, categories(name)').eq('user_id', user.id).eq('is_active', true),
    ]);

    const userRules = (rulesRes.data || []).map(r => ({ keyword: r.keyword, category_name: r.categories?.name }));
    const catList = categoriesRes.data || [];
    
    // Construir dicionário hierárquico para a IA: { "Saúde": ["Academia", "Exames"], ... }
    const catDict = {};
    for (const c of catList) {
      catDict[c.name] = Array.isArray(c.subcategories) ? c.subcategories : [];
    }

    if (fileType === 'pdf') {
      const result = await extractTransactionsFromPDF(fileBuffer, catDict);
      rawTransactions = result.transactions;
      discoveredTitular = result.titular;
    } else if (fileType === 'ofx') {
      rawTransactions = parseOFX(fileBuffer.toString());
    } else if (fileType === 'csv') {
      rawTransactions = parseCSV(fileBuffer.toString());
    } else if (fileType === 'xlsx') {
      const xlsx = await import('xlsx');
      const workbook = xlsx.read(fileBuffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json(sheet);
      rawTransactions = rows.map(row => ({
        date: row.Data || row.date || row.DATE,
        description: row.Descrição || row.Descricao || row.description || row.DESCRIPTION || row.Histórico || '',
        amount: parseFloat(String(row.Valor || row.value || row.VALUE || row.Amount || 0).replace(',', '.')),
      }));
    }

    if (rawTransactions.length === 0) {
      await supabase.from('imports').update({ status: 'empty', total_transactions: 0 }).eq('id', importRecordId);
      return;
    }

    let imported = 0;
    let duplicates = 0;
    const batchHashes = new Set(); // Previne duplicatas dentro do mesmo lote de importação

    for (const raw of rawTransactions) {
      if (!raw.description || raw.amount === undefined || raw.amount === null) continue;

      let normalizedDate = raw.date || new Date().toISOString().split('T')[0];
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalizedDate)) {
        const [d, m, y] = normalizedDate.split('/');
        normalizedDate = `${y}-${m}-${d}`;
      } else if (/^\d{2}\/\d{2}\/\d{2}$/.test(normalizedDate)) {
        const [d, m, y] = normalizedDate.split('/');
        normalizedDate = `20${y}-${m}-${d}`;
      }

      // Normaliza a descrição para o hash para evitar duplicatas por variações da IA nos overlaps
      const normalizedDescForHash = raw.description.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 15);
      const hash = Buffer.from(`${normalizedDate}-${normalizedDescForHash}-${raw.amount}`).toString('base64');
      
      // Guard 1: Intra-batch duplicate (overlap de chunks pode gerar a mesma transação 2x)
      if (batchHashes.has(hash)) { duplicates++; continue; }
      batchHashes.add(hash);
      
      // Guard 2: Duplicate already in database (reimportação do mesmo arquivo)
      const { data: existing } = await supabase.from('transactions').select('id').eq('import_hash', hash).eq('user_id', user.id).limit(1);
      if (existing?.length > 0) { duplicates++; continue; }

      let categoryId = null;
      let subcategoryName = null;
      const descLower = raw.description.toLowerCase();
      const matchedRule = userRules.find(r => descLower.includes(r.keyword.toLowerCase()));
      
      if (matchedRule) {
        const cat = catList.find(c => c.name === matchedRule.category_name);
        categoryId = cat?.id;
        subcategoryName = matchedRule.subcategory || null; // if rule has subcategory
        if (matchedRule.id) {
          await supabase.from('ai_rules').update({ usage_count: matchedRule.usage_count + 1 }).eq('id', matchedRule.id);
        }
      } else if (raw.category) {
        const cat = catList.find(c => c.name.toLowerCase() === raw.category.toLowerCase());
        categoryId = cat?.id;
        subcategoryName = raw.subcategory || null;
      }

      let aiConfidence = null;
      if (!categoryId) {
        // Find 'Outros' or leave null so the user categorizes it on the frontend UI.
        const catOutros = catList.find(c => c.name === 'Outros');
        categoryId = catOutros ? catOutros.id : null;
        aiConfidence = 0.5; // low confidence, user must review
      } else {
        aiConfidence = 1.0; // matched by rule or exact name — high confidence
      }

      // Regra Lógica: Tipo de transação baseado em keywords da descrição
      const entradaKw = ['devolvid', 'recebid', 'recebida', 'resgate', 'credito domicilio', 'credito cartao', 'remuneração', 'remuneracao', 'rendimento', 'salário', 'salario', 'estorno', 'transferencia recebida'];
      const saidaKw = ['compra no debito', 'compra no débito', 'pagamento', 'pix enviado:', 'aplicacao', 'aplicação', 'saque', 'tarifa', 'iof'];
      const isEntrada = entradaKw.some(kw => descLower.includes(kw));
      const isSaida = !isEntrada && saidaKw.some(kw => descLower.includes(kw));
      const isTransfer = (descLower.includes('transferencia') || descLower.includes('pix env') || descLower.includes('pix rec')) && !descLower.includes('salario');

      // Garantir que o amount esteja com o sinal correto antes de inserir
      let correctedAmount = raw.amount;
      if (isEntrada && correctedAmount < 0) correctedAmount = Math.abs(correctedAmount);
      if (isSaida && correctedAmount > 0) correctedAmount = -Math.abs(correctedAmount);

      try {
        await supabase.from('transactions').insert({
          user_id: user.id,
          account_id: accountId,
          account_type: accountType || 'personal',
          family_id: familyId || null,
          member_id: memberId,
          category_id: categoryId,
          subcategory: subcategoryName,
          description: raw.description,
          raw_description: raw.description,
          amount: correctedAmount,
          type: isTransfer ? 'transfer' : (correctedAmount >= 0 ? 'income' : 'expense'),
          is_internal_transfer: isTransfer,
          date: normalizedDate,
          origin: 'import',
          import_hash: hash,
          is_confirmed: true,
          is_reconciled: false,
          ai_confidence: aiConfidence,
          import_id: importRecordId
        });
        imported++;
      } catch (insertErr) {
        console.warn('Failed to insert single transaction:', raw.description, insertErr.message);
      }
    }

    await supabase.from('imports').update({
      total_transactions: rawTransactions.length,
      imported_transactions: imported,
      duplicates_skipped: duplicates,
      status: 'completed',
    }).eq('id', importRecordId);

    logAudit(user.id, 'import_completed', `Importação concluída: ${imported} transações importadas, ${duplicates} duplicatas ignoradas`, '📤');

  } catch (err) {
    console.error('Background import processing error:', err);
    await supabase.from('imports').update({ status: 'failed' }).eq('id', importRecordId);
  }
}

// POST /api/import/upload
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const { account_id, member_id } = req.body;
    const fileType = req.file.originalname.split('.').pop().toLowerCase();

    if (!['csv', 'ofx', 'xlsx', 'pdf'].includes(fileType)) {
      return res.status(400).json({ error: 'Formato não suportado. Use PDF, CSV, XLSX ou OFX.' });
    }

    // Criar o registro da importação "processing" (A fila)
    const { data: importRecord, error } = await supabase.from('imports').insert({
      user_id: req.user.id,
      account_id,
      filename: req.file.originalname,
      file_type: fileType,
      status: 'processing',
    }).select().single();

    if (error) throw error;

    // Fire and Forget (Lança o processo pesado em background)
    // Precisamos buscar account_type e family_id para preencher nas transactions, senão elas ficam invisíveis no filtro de Workspace!
    const { data: accData } = await supabase.from('accounts').select('type, account_type, family_id').eq('id', account_id).single();
    processImportBackground(req.user, req.file.buffer, fileType, importRecord.id, account_id, member_id, accData?.account_type, accData?.family_id);

    // Responde instantaneamente
    res.status(202).json({
      success: true,
      status: 'processing',
      importId: importRecord.id,
      message: 'Arquivo na fila de processamento. Pode sair da página!'
    });
  } catch (err) {
    console.error('Import initialization error:', err);
    res.status(500).json({ error: 'Erro ao iniciar importação: ' + err.message });
  }
});

// GET /api/import/history
router.get('/history', async (req, res) => {
  try {
    const { data, error } = await supabase.from('imports').select('*, accounts(name)').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(20);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar histórico de importações' });
  }
});

// GET /api/import/pending — All transactions awaiting reconciliation
router.get('/pending', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*, categories(id, name, icon, color), accounts(name)')
      .eq('user_id', req.user.id)
      .eq('is_reconciled', false)
      .eq('origin', 'import')
      .order('date', { ascending: false })
      .limit(200);
    if (error) throw error;
    res.json({ transactions: data || [], count: (data || []).length });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar transações pendentes' });
  }
});

// PATCH /api/import/reconcile/:id — Approve or correct a pending transaction
router.patch('/reconcile/:id', async (req, res) => {
  try {
    const { category_id, subcategory, approved } = req.body;
    const { id } = req.params;

    // Fetch original to detect category change for ML learning
    const { data: original } = await supabase
      .from('transactions')
      .select('category_id, description, amount, categories(name)')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    const updatePayload = { is_reconciled: true };
    if (subcategory !== undefined) updatePayload.subcategory = subcategory;
    
    // Auto-correct transaction TYPE, is_internal_transfer, and amount sign
    if (category_id) {
      updatePayload.category_id = category_id;
      
      const { data: newCat } = await supabase.from('categories').select('name, nature, group_name').eq('id', category_id).single();
      if (newCat) {
        if (newCat.nature === 'income') {
          updatePayload.type = 'income';
          updatePayload.is_internal_transfer = false;
          updatePayload.amount = Math.abs(original?.amount || 0);
        } else if (newCat.nature === 'expense') {
          updatePayload.type = 'expense';
          updatePayload.is_internal_transfer = false;
          updatePayload.amount = -Math.abs(original?.amount || 0);
        } else if (newCat.nature === 'transfer' || newCat.group_name?.includes('Transfer')) {
          updatePayload.type = 'transfer';
          updatePayload.is_internal_transfer = true;
          // Maintain original amount exactly as it came/exited
        }
      }
    }

    // If user corrected the category, save as ai_rule for passive learning
    if (category_id && original?.category_id && category_id !== original.category_id && updatePayload.type) {
      const { data: newCatName } = await supabase.from('categories').select('name').eq('id', category_id).single();
      if (newCatName && original.description) {
        // Melhora na palavra-chave (remove stopwords para ficar mais genérica nos lugares certos, mas grande o suficiente)
        const stopWords = ['compra', 'pagamento', 'pix', 'de', 'do', 'da', 'no', 'na', 'em', 'para', 'recebido', 'enviado', 'transferencia', 'ted', 'doc', 'cartao', 'debito', 'credito', 'nf'];
        let words = original.description.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(w => w.length > 2 && !stopWords.includes(w));
        let keyword = words.slice(0, 3).join(' '); // 3 meaningfully descriptive words
        if (!keyword) keyword = original.description.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').slice(0, 3).join(' ');
        
        // Upsert rule — avoid duplicates
        await supabase.from('ai_rules').upsert({
          user_id: req.user.id,
          keyword,
          category_id,
          subcategory: subcategory || null,
          is_active: true,
          usage_count: 1,
        }, { onConflict: 'user_id,keyword', ignoreDuplicates: false });
      }
    }

    const { data, error } = await supabase
      .from('transactions')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao conciliar transação: ' + err.message });
  }
});

// PATCH /api/import/reconcile-all — Bulk approve all pending
router.patch('/reconcile-all', async (req, res) => {
  try {
    const { import_id } = req.body;
    let query = supabase.from('transactions').update({ is_reconciled: true })
      .eq('user_id', req.user.id).eq('is_reconciled', false).eq('origin', 'import');
    if (import_id) query = query.eq('import_id', import_id);
    const { error } = await query;
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao aprovar todas: ' + err.message });
  }
});

// ---- PARSERS ----

function parseOFX(content) {
  const transactions = [];
  const stmttrns = content.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
  
  for (const trn of stmttrns) {
    const amount = parseFloat((trn.match(/<TRNAMT>(.*?)[\r\n<]/)?.[1] || '0').replace(',', '.'));
    const dateStr = trn.match(/<DTPOSTED>(\d{8})/)?.[1];
    const memo = trn.match(/<MEMO>(.*?)[\r\n<]/)?.[1]?.trim() || trn.match(/<NAME>(.*?)[\r\n<]/)?.[1]?.trim() || '';
    
    let date = new Date().toISOString().split('T')[0];
    if (dateStr) {
      date = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
    }
    
    transactions.push({ date, description: memo, amount });
  }
  return transactions;
}

function parseCSV(content) {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  
  const header = lines[0].toLowerCase();
  const transactions = [];
  
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/[;,]/);
    if (cols.length < 2) continue;
    
    let date = '', description = '', amount = 0;
    
    if (header.includes('data') || header.includes('date')) {
      date = cols[0]?.trim();
      description = cols[1]?.trim();
      amount = parseFloat((cols[2] || cols[3] || '0').replace(/[^\d.,-]/g, '').replace(',', '.'));
    } else {
      date = cols[0]?.trim();
      description = cols[1]?.trim();
      amount = parseFloat((cols[cols.length - 1] || '0').replace(/[^\d.,-]/g, '').replace(',', '.'));
    }
    
    if (description) transactions.push({ date, description, amount });
  }
  return transactions;
}

export default router;

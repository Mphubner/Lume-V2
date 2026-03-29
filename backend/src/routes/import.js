import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import multer from 'multer';
import { categorizeTransaction } from '../services/aiService.js';
import { extractTransactionsFromPDF } from '../services/pdfExtractor.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authMiddleware);

// POST /api/import/upload
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const { account_id, account_type = 'checking' } = req.body;
    const fileType = req.file.originalname.split('.').pop().toLowerCase();

    if (!['csv', 'ofx', 'xlsx', 'pdf'].includes(fileType)) {
      return res.status(400).json({ error: 'Formato não suportado. Use PDF, CSV, XLSX ou OFX.' });
    }

    // Create import record
    const { data: importRecord } = await supabase.from('imports').insert({
      user_id: req.user.id,
      account_id,
      filename: req.file.originalname,
      file_type: fileType,
      status: 'processing',
    }).select().single();

    // Parse file
    let rawTransactions = [];

    if (fileType === 'pdf') {
      // ---- NEW: Full AI-powered PDF extraction pipeline ----
      rawTransactions = await extractTransactionsFromPDF(req.file.buffer);
    } else if (fileType === 'ofx') {
      rawTransactions = parseOFX(req.file.buffer.toString());
    } else if (fileType === 'csv') {
      rawTransactions = parseCSV(req.file.buffer.toString());
    } else if (fileType === 'xlsx') {
      const xlsx = await import('xlsx');
      const workbook = xlsx.read(req.file.buffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json(sheet);
      rawTransactions = rows.map(row => ({
        date: row.Data || row.date || row.DATE,
        description: row.Descrição || row.Descricao || row.description || row.DESCRIPTION || row.Histórico || '',
        amount: parseFloat(String(row.Valor || row.value || row.VALUE || row.Amount || 0).replace(',', '.')),
      }));
    }

    if (rawTransactions.length === 0) {
      await supabase.from('imports').update({ status: 'empty', total_transactions: 0 }).eq('id', importRecord.id);
      return res.json({
        success: false,
        total: 0, imported: 0, duplicates: 0,
        importId: importRecord.id,
        message: 'Nenhuma transação foi encontrada no arquivo. Verifique se o formato está correto.'
      });
    }

    // Get user categories and AI rules
    const [categories, rules] = await Promise.all([
      supabase.from('categories').select('*').or(`user_id.eq.${req.user.id},is_system.eq.true`),
      supabase.from('ai_rules').select('*, categories(name)').eq('user_id', req.user.id).eq('is_active', true),
    ]);

    const userRules = (rules.data || []).map(r => ({ keyword: r.keyword, category_name: r.categories?.name }));
    const catList = categories.data || [];

    let imported = 0;
    let duplicates = 0;

    for (const raw of rawTransactions) {
      if (!raw.description || raw.amount === undefined || raw.amount === null) continue;

      // Normalize date: try to convert BR format DD/MM/YYYY to ISO
      let normalizedDate = raw.date || new Date().toISOString().split('T')[0];
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalizedDate)) {
        const [d, m, y] = normalizedDate.split('/');
        normalizedDate = `${y}-${m}-${d}`;
      } else if (/^\d{2}\/\d{2}\/\d{2}$/.test(normalizedDate)) {
        const [d, m, y] = normalizedDate.split('/');
        normalizedDate = `20${y}-${m}-${d}`;
      }

      // Hash to prevent duplicates
      const hash = Buffer.from(`${normalizedDate}-${raw.description}-${raw.amount}`).toString('base64');

      const { data: existing } = await supabase.from('transactions').select('id').eq('import_hash', hash).eq('user_id', req.user.id).limit(1);
      if (existing?.length > 0) { duplicates++; continue; }

      // AI categorization
      let categoryId = null;
      const descLower = raw.description.toLowerCase();
      const matchedRule = userRules.find(r => descLower.includes(r.keyword.toLowerCase()));
      if (matchedRule) {
        const cat = catList.find(c => c.name === matchedRule.category_name);
        categoryId = cat?.id;
        const rule = (rules.data || []).find(r => r.keyword.toLowerCase() === matchedRule.keyword.toLowerCase());
        if (rule) {
          await supabase.from('ai_rules').update({ usage_count: rule.usage_count + 1 }).eq('id', rule.id);
        }
      } else if (raw.category) {
        // If AI extraction already suggested a category, try to match
        const cat = catList.find(c => c.name.toLowerCase() === raw.category.toLowerCase());
        categoryId = cat?.id;
      }
      
      if (!categoryId) {
        // Fallback: Use AI for categorization
        try {
          const aiResult = await categorizeTransaction(raw.description, raw.amount, catList, userRules);
          const cat = catList.find(c => c.name === aiResult.category);
          categoryId = cat?.id;
        } catch (e) {
          // Silently continue — category remains null
        }
      }

      await supabase.from('transactions').insert({
        user_id: req.user.id,
        account_id,
        category_id: categoryId,
        description: raw.description,
        raw_description: raw.description,
        amount: raw.amount,
        type: raw.amount >= 0 ? 'income' : 'expense',
        date: normalizedDate,
        origin: 'import',
        import_hash: hash,
        is_confirmed: true,
      });
      imported++;
    }

    // Update import record
    await supabase.from('imports').update({
      total_transactions: rawTransactions.length,
      imported_transactions: imported,
      duplicates_skipped: duplicates,
      status: 'completed',
    }).eq('id', importRecord.id);

    res.json({
      success: true,
      total: rawTransactions.length,
      imported,
      duplicates,
      importId: importRecord.id,
    });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: 'Erro ao importar arquivo: ' + err.message });
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

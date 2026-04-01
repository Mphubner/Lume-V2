/**
 * PDF Statement Extractor for Lume
 * ----------------------------------
 * Pipeline: PDF Buffer → pdf-parse (text) → Clean/Normalize → Groq AI (JSON Mode) → Validated Transactions
 */

import dotenv from 'dotenv';
import { createRequire } from 'module';

dotenv.config();

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

/**
 * Main entry point: receives a PDF buffer, returns an array of transaction objects
 */
export async function extractTransactionsFromPDF(buffer, categories = []) {
  // Step 1: Extract raw text from PDF
  const pdfData = await pdfParse(buffer);
  const rawText = pdfData.text;

  if (!rawText || rawText.trim().length < 50) {
    console.warn('PDF extraction: text too short or empty. Possibly a scanned/image PDF.');
    return [];
  }

  // Step 2: Clean and normalize the text
  // Regex de limpeza geral (Bancos digitais e tradicionais variam a grafia '-' x '−')
  const rawNormalized = rawText.replace(/[\u2212\u2013\u2014]/g, '-'); 
  const cleanedText = preprocessBankText(rawNormalized);

  // Step 3: Split into chunks safely with overlap
  // 8b-instant: chunks menores (2250 chars) garantem que o output NUNCA estoure o max_tokens
  // Com 2250 chars → ~25 transações por chunk → ~3000 output tokens (seguro com max_tokens: 3500)
  const chunks = splitIntoChunksSafely(cleanedText, 2250);

  // Step 4: Send each chunk to AI for structured extraction sequentially with a delay
  let allTransactions = [];
  let titularDetectado = null;

  console.log(`📦 PDF dividido em ${chunks.length} partes (${cleanedText.length} chars total). Iniciando extração sequencial...`);

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processando parte ${i + 1}/${chunks.length} (${chunks[i].length} chars)...`);
    const aiData = await extractWithAI(chunks[i], categories);
    
    if (aiData.titular && !titularDetectado) {
      titularDetectado = aiData.titular;
    }
    
    if (aiData.transactions && aiData.transactions.length > 0) {
      allTransactions.push(...aiData.transactions);
      console.log(`✅ Parte ${i + 1}: ${aiData.transactions.length} transações extraídas (acumulado: ${allTransactions.length})`);
    } else {
      console.warn(`⚠️ Parte ${i + 1} não retornou transações válidas.`);
    }

    // Delay obrigatório para não estourar o TPM (se não for o último chunk)
    if (i < chunks.length - 1) {
      const waitSeconds = 15;
      console.log(`⏳ Aguardando ${waitSeconds}s antes do próximo chunk para evitar Rate Limit...`);
      await new Promise(r => setTimeout(r, waitSeconds * 1000));
    }
  }

  // Step 5: Post-process and validate
  const beforeDedup = allTransactions.length;
  allTransactions = postProcessTransactions(allTransactions);
  const removed = beforeDedup - allTransactions.length;

  console.log(`📄 PDF extraction complete: ${allTransactions.length} transactions (${removed} removidas por dedup/filtro). Titular: ${titularDetectado || 'Desconhecido'}`);
  return { titular: titularDetectado, transactions: allTransactions };
}

/**
 * Pre-process bank statement text to reduce noise and token usage
 */
function preprocessBankText(text) {
  let cleaned = text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ');

  const noisePatterns = [
    /SAC\s*\d{3,}/gi, /ouvidoria[^\n]*/gi, /central\s+de\s+atendimento[^\n]*/gi,
    /www\.\w+\.com\.br/gi, /pág(ina)?\s*\d+\s*(de\s*\d+)?/gi, /página\s*\d+/gi,
    /^\s*\d+\s*\/\s*\d+\s*$/gm, /atendimento\s*24\s*horas?/gi,
    /este\s+documento\s+[^\n]*/gi, /informações\s+sobre\s+[^\n]*/gi,
    /cpf[:/\s]+\d{3}\.\d{3}\.\d{3}-\d{2}/gi, /cnpj[:/\s]+\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/gi,
    /agência[:/\s]+\d+/gi, /conta[:/\s]+[\d.-]+/gi,
    /Documento\s+emitido\s+em[:\s]+[^\n]+/gi,
    /PicPay\s+Serviços\s+S\/A/gi,
    /Dias\s+úteis\s+das\s+\d{2}h\s+às\s+\d{2}h/gi,
    /^\s*\d+\s+de\s+\d+\s*$/gm,
    /Saldo\s+ao\s+final\s+do\s+dia[:\s]+[^\n]+/gi,
    /Fale\s+com\s+a\s+gente/gi,
    /Deficiência\s+de\s+fala\s+e\s+audição[^\n]*/gi,
    /Solicitado\s+em[:\s]+[^\n]+/gi,
    /Extrato\s+de\s+Conta[^\n]*/gi,
    /Cooperativa\s*\/?\s*PA\s*:\s*\d+[^\n]*/gi,
    /Conta\s+(Corrente|Capital)[^\n]*/gi,
    /Nubank\s+-\s+Nu\s+Pagamentos[^\n]*/gi,
    /SICOOB\s+-\s+Sistema[^\n]*/gi,
    /Histórico\s+de\s+movimentações[^\n]*/gi,
    /Ita[úu]\s+Unibanco[^\n]*/gi,
  ];

  for (const pattern of noisePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // --- DECONTAMINAÇÃO DE LINHAS (pdf-parse column bleeding fix) ---
  // O pdf-parse do Inter cola o SALDO de conta (ex: R$ 884,52) logo após o VALOR
  // da transação, e às vezes cola fragmentos de transações de colunas adjacentes.
  // Formato típico: 'Pix enviado: "Cp :60746948-ZAMP SA"-R$ 87,70R$ 884,52'
  // O que queremos manter: 'Pix enviado: "Cp :60746948-ZAMP SA" -R$ 87,70'
  // Regra: após o PRIMEIRO valor R$ (que é a transação), remover tudo que sobra.
  const decontaminatedLines = cleaned.split('\n').map(line => {
    // Normaliza sinais matemáticos comuns de PDFs (En-dash, Minus sign unicode)
    // Isso é crítico em arquivos do PicPay e Nubank
    let trimmed = line.trim();
    if (trimmed.length === 0) return '';

    // Detect transaction lines (allows optional time prefix like '21:43Pix' or '21:43 Pix')
    const isTxLine = /^(\d{2}:\d{2}\s*)?(Pix|Compra|Pagamento|Credito|Crédito|Transfer|Aplicacao|Aplicação|Resgate|Saque|Tarifa|IOF|Rendimento|Boleto|Ted |Doc |Dinheiro resgatado|Estorno)/i.test(trimmed);
    if (!isTxLine) return trimmed;

    // Find the FIRST R$ value (the transaction amount)
    // Pattern: +R$ 87,70 or -R$ 2.800,00 or R$ 1.234,56
    const firstValueMatch = trimmed.match(/[+-]?\s*R\$\s*[\d.,]+/i);
    if (!firstValueMatch) return trimmed;

    // Keep everything up to and including the first R$ value
    const endOfFirstValue = firstValueMatch.index + firstValueMatch[0].length;
    const cleanLine = trimmed.substring(0, endOfFirstValue);
    return cleanLine;
  });

  return decontaminatedLines.filter(line => line.length > 0).join('\n');
}

/**
 * Splitting text securely using line detection and overlap window
 */
function splitIntoChunksSafely(text, maxChars) {
  const lines = text.split('\n');
  const chunks = [];
  let currentChunkLines = [];
  let currentLength = 0;
  const overlapSize = 5; // Overlap reduzido: menos confusão para a IA, menos duplicatas

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (currentLength + line.length > maxChars && currentChunkLines.length > 0) {
      chunks.push(currentChunkLines.join('\n'));
      currentChunkLines = currentChunkLines.slice(-overlapSize);
      currentLength = currentChunkLines.join('\n').length;
    }
    
    currentChunkLines.push(line);
    currentLength += line.length + 1;
  }

  if (currentChunkLines.length > 0) {
    chunks.push(currentChunkLines.join('\n'));
  }
  
  return chunks;
}

async function extractWithAI(textChunk, categories = []) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.AI_API_KEY;
  
  if (!geminiKey && !groqKey) {
    console.warn('⚠️ No AI API keys configured — cannot extract PDF transactions.');
    return { titular: null, transactions: [] };
  }

  const catRule = categories && categories.length > 0
    ? `6. A "categoria" da transação DEVE ser EXATAMENTE uma da lista abaixo, a que mais fizer sentido. Se nenhuma se encaixar, coloque "Outros".\nLISTA DE CATEGORIAS:\n[${categories.join(', ')}]`
    : `6. Estime uma "categoria" financeira básica.`;

  const systemPrompt = `Você é um extrator financeiro rigoroso de extratos bancários brasileiros.
Seu objetivo é extrair TODAS as transações sem omitir NENHUMA.

### Regras:
1. Normalize datas para DD/MM/AAAA. Se o ano não constar, use o ano subentendido.
2. SINAL MATEMÁTICO NO VALOR: 
  - Saídas/Débitos/Pagamentos = SINAL NEGATIVO (ex: -50.25).
  - Entradas/Créditos = SINAL POSITIVO (ex: 50.25).
3. Ignore linhas de saldos.
4. Identifique o NOME do Titular se houver (senão, deixe vazio).
5. CONTEXTO DE DATA ESPALHADA: Se a data aparecer como um cabeçalho subentendido acima de várias transações, aplique-a a em todas elas.
${catRule}
7. IMPORTANTE: Extraia de forma ultra-comprimida. Responda em JSON usando UMA matriz de tuplas sob a chave "t". Leia todas as linhas de transação e NÃO PULE NENHUMA. Não deduplique linhas idênticas!

### Formato de Saída OBRIGATÓRIO (Minitupla):
{
  "titular": "Nome",
  "t": [
    ["13/01/2026", "Pix enviado Maria", -150.00, "Alimentação"],
    ["13/01/2026", "Recebido João", 200.00, "Outros"]
  ]
}`;

  const userMessage = `Extraia TODAS as transações e as formate na chave "t" como um array de listas (Data, Descrição, Valor Float e Categoria).\n\n--- EXTRATO ---\n${textChunk}\n--- FIM ---`;

  // ─── Gemini Flash Call ──────────────────────────────────────────────────────
  async function callGeminiExtraction(retries = 3, delay = 4000) {
    if (!geminiKey) return null; // Skip if not configured
    
    const model = process.env.AI_MODEL_EXTRACTION_GEMINI || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
          generationConfig: {
            temperature: 0.05,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 429 && retries > 0) {
          // Gemini rate limit — wait and retry
          const waitSec = Math.min(delay / 1000, 60);
          console.warn(`⏳ Gemini Rate Limit (429). Aguardando ${waitSec.toFixed(0)}s... (${retries - 1} retries restantes)`);
          await new Promise(r => setTimeout(r, delay));
          return callGeminiExtraction(retries - 1, delay * 2);
        }
        console.warn(`⚠️ Gemini extraction error (${response.status}):`, errText.substring(0, 200));
        return null; // Signal to fall back to Groq
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const tokens = (data.usageMetadata?.promptTokenCount || 0) + (data.usageMetadata?.candidatesTokenCount || 0);
      
      if (!content) return null;

      return { content, tokens, provider: 'Gemini Flash' };
    } catch (err) {
      console.warn(`⚠️ Gemini request failed: ${err.message}`);
      if (retries > 0) {
        await new Promise(r => setTimeout(r, delay));
        return callGeminiExtraction(retries - 1, delay * 1.5);
      }
      return null;
    }
  }

  // ─── Groq/OpenAI-compatible Call (Fallback) ────────────────────────────────
  async function callGroqExtraction(retries = 5, delay = 5000) {
    if (!groqKey) return null;

    const provider = process.env.AI_PROVIDER || 'groq';
    const baseUrls = { groq: 'https://api.groq.com/openai/v1', together: 'https://api.together.xyz/v1' };
    const baseUrl = baseUrls[provider] || baseUrls.groq;
    const model = process.env.AI_MODEL_EXTRACTION || 'llama-3.1-8b-instant';

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.05,
          max_tokens: 3500,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 429 && retries > 0) {
          let dynamicDelay = delay;
          const minMatch = errText.match(/in (\d+)m([\d.]+)s/);
          const secMatch = errText.match(/in ([\d.]+)s/);
          if (minMatch) dynamicDelay = (parseInt(minMatch[1]) * 60 + parseFloat(minMatch[2]) + 2) * 1000;
          else if (secMatch && secMatch[1]) dynamicDelay = (parseFloat(secMatch[1]) + 2) * 1000;
          console.warn(`⏳ Groq Rate Limit (429). Aguardando ${(dynamicDelay / 1000).toFixed(1)}s... (${retries - 1} retries restantes)`);
          await new Promise(r => setTimeout(r, Math.max(dynamicDelay, 3000)));
          return callGroqExtraction(retries - 1, delay * 1.5);
        }
        console.error(`Groq extraction error (${response.status}):`, errText.substring(0, 200));
        return null;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) return null;
      return { content, tokens: data.usage?.total_tokens || 0, provider: 'Groq' };
    } catch (err) {
      if (retries > 0) {
        console.warn(`⏳ Groq Request falhou: ${err.message}. Retentando...`);
        await new Promise(r => setTimeout(r, delay));
        return callGroqExtraction(retries - 1, delay * 1.5);
      }
      return null;
    }
  }

  // ─── Execute: Try Gemini first, then Groq ──────────────────────────────────
  let result = await callGeminiExtraction();
  
  if (!result) {
    if (geminiKey) console.warn('⚠️ Gemini falhou para este chunk. Tentando Groq como fallback...');
    result = await callGroqExtraction();
  }

  if (!result || !result.content) {
    console.error('❌ Both AI providers failed for this chunk.');
    return { titular: null, transactions: [] };
  }

  // ─── Parse the JSON response (same for both providers) ─────────────────────
  try {
    const parsed = JSON.parse(result.content);
    const titular = parsed.titular || null;
    
    const rawTuples = parsed.t || [];
    const transacoes = rawTuples.map(item => ({
      data: item[0] || '',
      descricao: item[1] || '',
      valor: item[2] || 0,
      categoria: item[3] || 'Outros',
    }));

    console.log(`🤖 AI extracted ${transacoes.length} transactions (tokens: ${result.tokens}) via ${result.provider}`);

    // ─── Semantic sign validation (same logic as before) ───────────────────
    const formattedTransacoes = transacoes.map(t => {
      let amountParsed = typeof t.valor === 'number' ? t.valor : parseFloat(String(t.valor).replace(',', '.'));
      if (isNaN(amountParsed)) amountParsed = 0;

      const descriptionStr = t.descricao || t.description || '';
      const descLower = descriptionStr.toLowerCase();
      const absAmount = Math.abs(amountParsed);
      let finalAmount = isNaN(absAmount) ? 0 : absAmount;

      const entradaKeywords = [
        'devolvid', 'recebid', 'recebida', 'resgate',
        'credito domicilio', 'credito cartao',
        'remuneração', 'remuneracao', 'rendimento',
        'salário', 'salario', 'estorno', 'transferencia recebida',
      ];
      const saidaKeywords = [
        'compra no debito', 'compra no débito',
        'pagamento efetuado', 'pagamento',
        'pix enviado:', 'aplicacao', 'aplicação',
        'saque', 'tarifa', 'iof',
      ];

      const isEntrada = entradaKeywords.some(kw => descLower.includes(kw));
      const isSaida = !isEntrada && saidaKeywords.some(kw => descLower.includes(kw));

      if (isEntrada) finalAmount = absAmount;
      else if (isSaida) finalAmount = -absAmount;
      else finalAmount = amountParsed;

      return {
        date: t.data || t.date,
        description: descriptionStr,
        amount: isNaN(finalAmount) ? 0 : finalAmount,
        category: t.categoria || t.category || null,
      };
    });

    return { titular, transactions: formattedTransacoes };
  } catch (parseErr) {
    console.error('❌ Failed to parse AI response JSON:', parseErr.message);
    return { titular: null, transactions: [] };
  }
}

/**
 * Post-process: validate and filter non-transaction entries.
 * Deduplication is handled by the batchHashes Set in import.js,
 * so here we only filter invalid data, NOT legitimate identical transactions.
 */
function postProcessTransactions(transactions) {
  const valid = [];

  for (const t of transactions) {
    if (!t.description || t.description.length < 2) continue;
    if (t.amount === 0 || t.amount === null || t.amount === undefined || isNaN(t.amount)) continue;

    const descLower = t.description.toLowerCase();
    if (descLower.includes('saldo anterior') || descLower.includes('saldo final') ||
      descLower.includes('saldo do dia') || descLower.includes('total de') ||
      descLower.includes('s/anterior') || descLower.includes('saldo inicial')) {
      continue;
    }

    valid.push(t);
  }

  return valid;
}

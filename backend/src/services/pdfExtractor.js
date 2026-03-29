/**
 * PDF Statement Extractor for Lume
 * ----------------------------------
 * Pipeline: PDF Buffer → pdf-parse (text) → Clean/Normalize → Groq AI (JSON Mode) → Validated Transactions
 * 
 * Supports Brazilian bank statements from: Bradesco, Itaú, Nubank, Inter, PagBank, PicPay, C6, Caixa, BB, etc.
 * Uses Few-Shot prompting + strict JSON schema for reliable extraction across bank layouts.
 */

import dotenv from 'dotenv';
dotenv.config();

// Dynamic import for pdf-parse (CommonJS module)
let pdfParse;
async function getPdfParse() {
  if (!pdfParse) {
    const mod = await import('pdf-parse');
    pdfParse = mod.default || mod;
  }
  return pdfParse;
}

/**
 * Main entry point: receives a PDF buffer, returns an array of transaction objects
 * { date: string, description: string, amount: number, category?: string }
 */
export async function extractTransactionsFromPDF(buffer) {
  // Step 1: Extract raw text from PDF
  const parse = await getPdfParse();
  const pdfData = await parse(buffer);
  const rawText = pdfData.text;

  if (!rawText || rawText.trim().length < 50) {
    console.warn('PDF extraction: text too short or empty. Possibly a scanned/image PDF.');
    return [];
  }

  // Step 2: Clean and normalize the text
  const cleanedText = preprocessBankText(rawText);

  // Step 3: Split into chunks if too large (Groq has token limits)
  const chunks = splitIntoChunks(cleanedText, 6000); // ~6000 chars per chunk ≈ ~1500 tokens

  // Step 4: Send each chunk to AI for structured extraction
  let allTransactions = [];
  for (const chunk of chunks) {
    const transactions = await extractWithAI(chunk);
    allTransactions.push(...transactions);
  }

  // Step 5: Post-process and validate
  allTransactions = postProcessTransactions(allTransactions);

  console.log(`📄 PDF extraction complete: ${allTransactions.length} transactions extracted from ${chunks.length} chunk(s)`);
  return allTransactions;
}

/**
 * Pre-process bank statement text to reduce noise and token usage
 */
function preprocessBankText(text) {
  let cleaned = text;

  // Remove excessive whitespace/blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');

  // Remove common bank footer/header noise
  const noisePatterns = [
    /SAC\s*\d{3,}/gi,
    /ouvidoria[^\n]*/gi,
    /central\s+de\s+atendimento[^\n]*/gi,
    /www\.\w+\.com\.br/gi,
    /pág(ina)?\s*\d+\s*(de\s*\d+)?/gi,
    /página\s*\d+/gi,
    /^\s*\d+\s*\/\s*\d+\s*$/gm, // Standalone page numbers like "1 / 3"
    /atendimento\s*24\s*horas?/gi,
    /este\s+documento\s+[^\n]*/gi,
    /informações\s+sobre\s+[^\n]*/gi,
    /cpf[:/\s]+\d{3}\.\d{3}\.\d{3}-\d{2}/gi,
    /cnpj[:/\s]+\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/gi,
    /agência[:/\s]+\d+/gi,
    /conta[:/\s]+[\d.-]+/gi,
  ];

  for (const pattern of noisePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Trim each line
  cleaned = cleaned.split('\n').map(line => line.trim()).filter(line => line.length > 0).join('\n');

  // Limit total size (keep first ~18000 chars if huge)
  if (cleaned.length > 18000) {
    cleaned = cleaned.substring(0, 18000) + '\n[... texto truncado ...]';
  }

  return cleaned;
}

/**
 * Split text into manageable chunks for the AI, trying to split on double newlines
 */
function splitIntoChunks(text, maxChars) {
  if (text.length <= maxChars) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      break;
    }

    // Try to find a good split point (double newline near the limit)
    let splitAt = remaining.lastIndexOf('\n\n', maxChars);
    if (splitAt < maxChars * 0.5) {
      // Fallback: split at single newline
      splitAt = remaining.lastIndexOf('\n', maxChars);
    }
    if (splitAt < maxChars * 0.3) {
      // Last resort: hard split
      splitAt = maxChars;
    }

    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trim();
  }

  return chunks;
}

/**
 * Call Groq AI with optimized prompt for Brazilian bank statement extraction
 */
async function extractWithAI(textChunk) {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ AI API key not configured — cannot extract PDF transactions.');
    return [];
  }

  const provider = process.env.AI_PROVIDER || 'groq';
  const baseUrls = {
    groq: 'https://api.groq.com/openai/v1',
    together: 'https://api.together.xyz/v1',
  };
  const baseUrl = baseUrls[provider] || baseUrls.groq;

  const models = {
    groq: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
    together: process.env.AI_MODEL || 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  };
  const model = models[provider] || models.groq;

  const systemPrompt = `Você é um extrator de dados financeiros especializado em extratos bancários brasileiros (Bradesco, Itaú, Nubank, Inter, PagBank, PicPay, C6, Sicredi, Caixa, Banco do Brasil, BTG, Safra, etc.).

Sua ÚNICA tarefa é converter o texto bruto de um extrato bancário em um array JSON de transações.

### Regras Estritas:
1. Normalize TODAS as datas para o formato DD/MM/AAAA. Se o ano não aparecer, use o ano mencionado no cabeçalho do extrato ou 2025.
2. Converta valores para float: NEGATIVO para saídas/débitos/pagamentos, POSITIVO para entradas/créditos/recebimentos.
3. Trate "D" ou "(-)" como débito (negativo). Trate "C" ou "(+)" como crédito (positivo).
4. A descrição deve ser limpa e legível (remova códigos internos quando possível, mas mantenha o nome do estabelecimento/pessoa).
5. Identifique a categoria com base na descrição. Categorias válidas: Alimentação, Transporte, Moradia, Saúde, Educação, Lazer, Compras, Salário, Serviços, Transferência, Investimento, Impostos, Outros.
6. Se um campo estiver ilegível ou ausente, use null.
7. Ignore linhas de saldo, totais, cabeçalhos e rodapés. Extraia APENAS lançamentos/movimentações individuais.
8. Ignore taxas de IOF e tarifas bancárias a menos que sejam lançamentos individuais com valor.

### Formato de Saída (JSON estrito):
{
  "transacoes": [
    {"data": "DD/MM/AAAA", "descricao": "string", "valor": -50.00, "categoria": "Alimentação"}
  ]
}

### Exemplos de Extração:

Entrada: "05/03 PIX ENVIADO - JOAO SILVA 150,00 D"
Saída: {"data": "05/03/2025", "descricao": "PIX Enviado - João Silva", "valor": -150.00, "categoria": "Transferência"}

Entrada: "10/03 TED RECEBIDO 3.500,00 C"  
Saída: {"data": "10/03/2025", "descricao": "TED Recebido", "valor": 3500.00, "categoria": "Salário"}

Entrada: "12/03 COMPRA CARTAO - IFOOD 45,90"
Saída: {"data": "12/03/2025", "descricao": "iFood", "valor": -45.90, "categoria": "Alimentação"}

Entrada: "15/03 PAG BOLETO CEMIG 287,45"
Saída: {"data": "15/03/2025", "descricao": "Pagamento CEMIG", "valor": -287.45, "categoria": "Moradia"}

Entrada: "20/03 REND POUPANCA 12,34"
Saída: {"data": "20/03/2025", "descricao": "Rendimento Poupança", "valor": 12.34, "categoria": "Investimento"}`;

  const userMessage = `Extraia TODAS as transações do texto de extrato bancário abaixo. Responda SOMENTE com o JSON, sem explicações.

--- TEXTO DO EXTRATO ---
${textChunk}
--- FIM DO EXTRATO ---`;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.05, // Very low temp for deterministic extraction
        max_tokens: 8192,  // Large output for many transactions
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`AI extraction error (${response.status}):`, errText);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.warn('AI returned empty content for PDF extraction');
      return [];
    }

    const parsed = JSON.parse(content);
    const transacoes = parsed.transacoes || parsed.transactions || [];

    console.log(`🤖 AI extracted ${transacoes.length} transactions (tokens: ${data.usage?.total_tokens || '?'})`);

    return transacoes.map(t => ({
      date: t.data || t.date,
      description: t.descricao || t.description || '',
      amount: typeof t.valor === 'number' ? t.valor : (typeof t.amount === 'number' ? t.amount : parseFloat(String(t.valor || t.amount || 0).replace(',', '.'))),
      category: t.categoria || t.category || null,
    }));

  } catch (err) {
    console.error('PDF AI extraction failed:', err.message);
    return [];
  }
}

/**
 * Post-process: deduplicate, validate, and normalize extracted transactions
 */
function postProcessTransactions(transactions) {
  const seen = new Set();
  const valid = [];

  for (const t of transactions) {
    if (!t.description || t.description.length < 2) continue;
    if (t.amount === 0 || t.amount === null || t.amount === undefined || isNaN(t.amount)) continue;

    // Skip summary/balance lines that AI might have included
    const descLower = t.description.toLowerCase();
    if (descLower.includes('saldo anterior') || descLower.includes('saldo final') ||
        descLower.includes('saldo do dia') || descLower.includes('total de') ||
        descLower.includes('s/anterior') || descLower.includes('saldo inicial')) {
      continue;
    }

    // Dedup key
    const key = `${t.date}-${t.description}-${t.amount}`;
    if (seen.has(key)) continue;
    seen.add(key);

    valid.push(t);
  }

  return valid;
}

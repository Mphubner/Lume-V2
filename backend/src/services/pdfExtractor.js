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
  const cleanedText = preprocessBankText(rawText);

  // Step 3: Split into chunks if too large (Groq has token limits)
  // 5000 chars is roughly 1500-2000 tokens.
  const chunks = splitIntoChunks(cleanedText, 5000);

  // Step 4: Send each chunk to AI for structured extraction
  let allTransactions = [];
  let titularDetectado = null;

  for (const chunk of chunks) {
    const aiData = await extractWithAI(chunk, categories);
    if (aiData.titular && !titularDetectado) {
      titularDetectado = aiData.titular;
    }
    allTransactions.push(...aiData.transactions);
  }

  // Step 5: Post-process and validate
  allTransactions = postProcessTransactions(allTransactions);

  console.log(`📄 PDF extraction complete: ${allTransactions.length} transactions. Titular: ${titularDetectado || 'Desconhecido'}`);
  return { titular: titularDetectado, transactions: allTransactions };
}

/**
 * Pre-process bank statement text to reduce noise and token usage
 */
function preprocessBankText(text) {
  let cleaned = text;

  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');

  const noisePatterns = [
    /SAC\s*\d{3,}/gi,
    /ouvidoria[^\n]*/gi,
    /central\s+de\s+atendimento[^\n]*/gi,
    /www\.\w+\.com\.br/gi,
    /pág(ina)?\s*\d+\s*(de\s*\d+)?/gi,
    /página\s*\d+/gi,
    /^\s*\d+\s*\/\s*\d+\s*$/gm,
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

  return cleaned;
}

/**
 * Split text into manageable chunks for the AI
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

    let splitAt = remaining.lastIndexOf('\n', maxChars);
    if (splitAt === -1 || splitAt === 0) {
      splitAt = maxChars; // Fallback only if absolutely no newline exists
    }

    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trim();
  }

  return chunks;
}

async function extractWithAI(textChunk, categories = []) {
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
  const model = process.env.AI_MODEL_EXTRACTION || 'llama-3.1-8b-instant';

  const catRule = categories && categories.length > 0
    ? `6. A "categoria" da transação DEVE ser EXATAMENTE uma da lista abaixo, a que mais fizer sentido. Se nenhuma se encaixar, coloque "Outros".\nLISTA DE CATEGORIAS:\n[${categories.join(', ')}]`
    : `6. Estime uma "categoria" financeira básica (ex: Alimentação, Transporte, Moradia, Outros).`;

  const systemPrompt = `Você é um extrator de dados financeiros especializado em extratos bancários brasileiros.

Sua tarefa é extrair os dados básicos do Titular e converter o texto bruto de um extrato bancário em um array JSON.

### Regras Estritas:
1. Normalize TODAS as datas para o formato DD/MM/AAAA. Se o ano não aparecer, use o ano mencionado no cabeçalho ou o atual.
2. Converta valores para float: NEGATIVO para saídas/débitos/pagamentos, POSITIVO para entradas/créditos/recebimentos.
3. Trate "D" ou "(-)" como débito (negativo). Trate "C" ou "(+)" como crédito (positivo).
4. Ignore linhas de saldo final e inicial. Extraia APENAS lançamentos de conta individuais.
5. Identifique o TITULAR do extrato (Nome da Empresa, Razão Social, ou Nome do Titular Pessoal). Se não achar, envie null.
${catRule}

### Formato de Saída (JSON estrito):
{
  "titular": "NOME DO TITULAR OU EMPRESA AQUI",
  "transacoes": [
    {"data": "DD/MM/AAAA", "descricao": "string", "valor": -50.00, "categoria": "Alimentação"}
  ]
}`;

  const userMessage = `Extraia TODAS as transações do texto de extrato bancário abaixo. Responda SOMENTE com o JSON, sem explicações.

--- TEXTO DO EXTRATO ---
${textChunk}
--- FIM DO EXTRATO ---`;

  const makeRequest = async (retries = 3, delay = 4000) => {
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
          temperature: 0.05,
          max_tokens: 1500, // Reduced token size for large files chunking
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();

        // Dynamic Rate Limit parsing
        if (response.status === 429 && retries > 0) {
          let dynamicDelay = delay;
          const waitMatch = errText.match(/in ([\d.]+)s/);
          if (waitMatch && waitMatch[1]) {
            dynamicDelay = (parseFloat(waitMatch[1]) + 0.5) * 1000;
          }
          console.warn(`⏳ AI Rate limite atingido (429). Aguardando ${(dynamicDelay / 1000).toFixed(1)}s para tentar novamente...`);
          await new Promise(resolve => setTimeout(resolve, Math.max(dynamicDelay, 2000)));
          return makeRequest(retries - 1, delay * 1.5);
        }

        console.error(`AI extraction error (${response.status}):`, errText);
        return { titular: null, transactions: [] };
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        console.warn('AI returned empty content for PDF extraction');
        return { titular: null, transactions: [] };
      }

      const parsed = JSON.parse(content);
      const transacoes = parsed.transacoes || parsed.transactions || [];
      const titular = parsed.titular || null;

      console.log(`🤖 AI extracted ${transacoes.length} transactions (tokens: ${data.usage?.total_tokens || '?'})`);

      const formattedTransacoes = transacoes.map(t => {
        let amountParsed = 0;
        const val = t.valor !== undefined ? t.valor : t.amount;

        if (typeof val === 'number') {
          amountParsed = val;
        } else if (typeof val === 'string') {
          // Trata formatos "80.000,00" removendo pontos e trocando virgula por ponto -> "80000.00"
          const cleanStr = val.replace(/\./g, '').replace(',', '.');
          amountParsed = parseFloat(cleanStr);
        }

        return {
          date: t.data || t.date,
          description: t.descricao || t.description || '',
          amount: isNaN(amountParsed) ? 0 : amountParsed,
          category: t.categoria || t.category || null,
        };
      });

      return { titular, transactions: formattedTransacoes };

    } catch (err) {
      if (retries > 0) {
        console.warn(`⏳ AI Request falhou: ${err.message}. Retentando...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return makeRequest(retries - 1, delay * 1.5);
      }
      console.error('PDF AI extraction completely failed:', err.message);
      return { titular: null, transactions: [] };
    }
  };

  return makeRequest();
}

/**
 * Post-process: deduplicate, validate, and normalize
 */
function postProcessTransactions(transactions) {
  const seen = new Set();
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

    const key = `${t.date}-${t.description}-${t.amount}`;
    if (seen.has(key)) continue;
    seen.add(key);

    valid.push(t);
  }

  return valid;
}

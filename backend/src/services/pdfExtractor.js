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

  // Step 3: Split into chunks safely with overlap
  const chunks = splitIntoChunksSafely(cleanedText, 3500);

  // Step 4: Send each chunk to AI for structured extraction sequentially with a delay
  let allTransactions = [];
  let titularDetectado = null;

  console.log(`📦 PDF dividido em ${chunks.length} partes. Iniciando extração sequencial...`);

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processando parte ${i + 1}/${chunks.length}...`);
    const aiData = await extractWithAI(chunks[i], categories);
    
    if (aiData.titular && !titularDetectado) {
      titularDetectado = aiData.titular;
    }
    
    if (aiData.transactions && aiData.transactions.length > 0) {
      allTransactions.push(...aiData.transactions);
    } else {
      console.warn(`⚠️ Parte ${i + 1} não retornou transações válidas.`);
    }

    // Delay obrigatório para não estourar o TPM (se não for o último chunk)
    if (i < chunks.length - 1) {
      const waitSeconds = 12;
      console.log(`⏳ Aguardando ${waitSeconds}s antes do próximo chunk para evitar Rate Limit...`);
      await new Promise(r => setTimeout(r, waitSeconds * 1000));
    }
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
    // Específicos de Bancos Tradicionais e Digitais (Limpeza Categórica)
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
  return cleaned.split('\n').map(line => line.trim()).filter(line => line.length > 0).join('\n');
}

/**
 * Splitting text securely using line detection and overlap window
 */
function splitIntoChunksSafely(text, maxChars) {
  const lines = text.split('\n');
  const chunks = [];
  let currentChunkLines = [];
  let currentLength = 0;
  const overlapSize = 10; // Maintains context across chunks

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
  const model = process.env.AI_MODEL_EXTRACTION || 'llama-3.3-70b-versatile';

  const catRule = categories && categories.length > 0
    ? `6. A "categoria" da transação DEVE ser EXATAMENTE uma da lista abaixo, a que mais fizer sentido. Se nenhuma se encaixar, coloque "Outros".\nLISTA DE CATEGORIAS:\n[${categories.join(', ')}]`
    : `6. Estime uma "categoria" financeira básica.`;

  const systemPrompt = `Você é um extrator financeiro rigoroso de extratos brasileiros.
Seu objetivo é extrair transações e montar um JSON perfeito.

### Regras:
1. Normalize datas para DD/MM/AAAA.
2. NEGATIVO para saídas/débitos/pagamentos (-R$), POSITIVO para entradas/créditos/recebimentos (+R$ ou R$).
3. Ignore linhas de "Saldo total", "Saldo disponivel" ou "Saldo por transação". Extraia APENAS lançamentos de conta.
4. Identifique o TITULAR do extrato no cabeçalho.
5. CONTEXTO DE DATA: Em alguns bancos (ex: Inter, PicPay), a data aparece como um título ANTES das transações (ex: "13 de Janeiro de 2026 Saldo do dia: R$ 2.724,90"). Aplique essa data a todas as transações abaixo dela até encontrar a próxima data.
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
          const cleanStr = val.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
          amountParsed = parseFloat(cleanStr);
        }

        const descriptionStr = t.descricao || t.description || '';
        const descLower = descriptionStr.toLowerCase();
        
        // --- DUPLA VALIDAÇÃO SEMÂNTICA DE NATUREZA (Baseada na Descrição do Extrato) ---
        // Pega o valor lido como absoluto para ignorar sinais pendurados no texto mal quebrado
        let finalAmount = Math.abs(amountParsed);
        if (isNaN(finalAmount)) finalAmount = 0;

        // Entradas Forçadas (+X)
        if (
          descLower.includes('recebid') || 
          descLower.includes('resgate') || 
          descLower.includes('devolvid') || 
          descLower.includes('crédito') || 
          descLower.includes('credito') || 
          descLower.includes('remuneração') || 
          descLower.includes('salário') || 
          descLower.includes('salario')
        ) {
          finalAmount = finalAmount * 1; 
        } 
        // Saídas Forçadas (-X)
        else if (
          descLower.includes('enviad') || 
          descLower.includes('compra') || 
          descLower.includes('pagamento') || 
          descLower.includes('aplicacao') || 
          descLower.includes('aplicação') || 
          descLower.includes('saque')
        ) {
          finalAmount = finalAmount * -1;
        }
        // Fallback: se não tiver trigger verbal, mantém o original enviado pela IA
        else {
          finalAmount = amountParsed;
        }
        // -------------------------------------------------------------------------------

        return {
          date: t.data || t.date,
          description: descriptionStr,
          amount: isNaN(finalAmount) ? 0 : finalAmount,
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

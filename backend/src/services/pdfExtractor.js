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
  // 8b-instant has 500k TPD and 131k TPM — we can safely use bigger chunks
  const chunks = splitIntoChunksSafely(cleanedText, 5000);

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
    const trimmed = line.trim();
    if (trimmed.length === 0) return '';

    // Detect transaction lines (start with Pix, Compra, Pagamento, Credito, Aplicacao, etc)
    const isTxLine = /^(Pix|Compra|Pagamento|Credito|Crédito|Transfer|Aplicacao|Aplicação|Resgate|Saque|Tarifa|IOF|Rendimento|Boleto|Ted |Doc )/i.test(trimmed);
    if (!isTxLine) return trimmed;

    // Find the FIRST R$ value (the transaction amount)
    // Pattern: -R$ 87,70 or R$ 2.800,00 or -R$ 1.234,56
    const firstValueMatch = trimmed.match(/-?R\$\s*[\d.,]+/);
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
    : `6. Estime uma "categoria" financeira básica.`;

  const systemPrompt = `Você é um extrator financeiro rigoroso de extratos bancários brasileiros.
Seu objetivo é extrair TODAS as transações e montar um JSON perfeito. NÃO PULE nenhuma transação.

### Regras:
1. Normalize datas para DD/MM/AAAA.
2. NEGATIVO para saídas/débitos/pagamentos (-R$), POSITIVO para entradas/créditos/recebimentos (+R$ ou R$).
3. Ignore linhas de "Saldo total", "Saldo disponivel" ou "Saldo por transação". Extraia APENAS lançamentos individuais.
4. Identifique o TITULAR do extrato no cabeçalho.
5. CONTEXTO DE DATA: A data aparece como título (ex: "13 de Janeiro de 2026 Saldo do dia: R$ 2.724,90"). Aplique essa data a todas as transações abaixo dela até a próxima data.
${catRule}
7. IMPORTANTE: Cada linha começando com "Pix", "Compra", "Pagamento", "Credito", "Aplicacao", "Resgate", "Transferência", "Tarifa", "IOF" ou "Saque" é UMA transação. O valor vem após o último R$ da linha. Extraia TODAS sem pular nenhuma.
8. Se houver transações idênticas (mesma data, descrição e valor), inclua TODAS elas. Não deduplicar.

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

  const makeRequest = async (retries = 5, delay = 5000) => {
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
          max_tokens: 2000, // Enough for ~40 transactions per chunk
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();

        // Dynamic Rate Limit parsing (handles both "Xs" and "XmYs" formats)
        if (response.status === 429 && retries > 0) {
          let dynamicDelay = delay;
          // Parse "try again in 27m26.784s" or "try again in 9.7s"
          const minMatch = errText.match(/in (\d+)m([\d.]+)s/);
          const secMatch = errText.match(/in ([\d.]+)s/);
          if (minMatch) {
            const totalSec = parseInt(minMatch[1]) * 60 + parseFloat(minMatch[2]) + 2;
            dynamicDelay = totalSec * 1000;
          } else if (secMatch && secMatch[1]) {
            dynamicDelay = (parseFloat(secMatch[1]) + 2) * 1000;
          }
          console.warn(`⏳ AI Rate limite atingido (429). Aguardando ${(dynamicDelay / 1000).toFixed(1)}s para tentar novamente (${retries - 1} retries restantes)...`);
          await new Promise(resolve => setTimeout(resolve, Math.max(dynamicDelay, 3000)));
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
        
        // --- VALIDAÇÃO SEMÂNTICA DE NATUREZA (Força Bruta por Palavras-Chave) ---
        // O valor chega como número da IA. Primeiro pegamos o absoluto.
        // Depois forçamos o sinal baseado EXCLUSIVAMENTE na descrição.
        const absAmount = Math.abs(amountParsed);
        let finalAmount = isNaN(absAmount) ? 0 : absAmount;

        // Keywords de ENTRADA (dinheiro entra na conta = valor POSITIVO)
        // Ordem importa: 'devolvid' deve vir antes porque 'pix enviado devolvido' é uma ENTRADA
        const entradaKeywords = [
          'devolvid',           // estorno/devolução = entrada
          'recebid',            // pix recebido, transferência recebida
          'recebida',           // transferencia recebida
          'resgate',            // resgate de investimento
          'credito domicilio',  // crédito de cartão
          'credito cartao',     // variação
          'remuneração',        // rendimento
          'remuneracao',        // sem acento
          'rendimento',         // rendimento de investimento
          'salário',            // salário
          'salario',            // sem acento
          'estorno',            // estorno
          'transferencia recebida', // transferência recebida
        ];

        // Keywords de SAÍDA (dinheiro sai da conta = valor NEGATIVO)
        const saidaKeywords = [
          'compra no debito',   // compra no débito
          'compra no débito',   // com acento
          'pagamento efetuado', // pagamento de boleto/fatura
          'pagamento',          // pagamento genérico
          'pix enviado:',       // pix enviado (com dois pontos para não pegar 'devolvido')
          'aplicacao',          // aplicação de investimento
          'aplicação',          // com acento
          'saque',              // saque em dinheiro
          'tarifa',             // tarifa bancária
          'iof',                // IOF
        ];

        // Prioridade 1: Verifica entradas primeiro (devolvido > enviado)
        let isEntrada = entradaKeywords.some(kw => descLower.includes(kw));
        let isSaida = !isEntrada && saidaKeywords.some(kw => descLower.includes(kw));

        if (isEntrada) {
          finalAmount = absAmount; // Positivo
        } else if (isSaida) {
          finalAmount = -absAmount; // Negativo
        } else {
          // Fallback: confia no sinal original da IA
          finalAmount = amountParsed;
        }
        // -----------------------------------------------------------------------

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

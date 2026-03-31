import dotenv from 'dotenv';

dotenv.config();

const AI_PROVIDERS = {
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
  },
  huggingface: {
    baseUrl: 'https://api-inference.huggingface.co/models',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct',
  },
  together: {
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  },
};

const provider = process.env.AI_PROVIDER || 'groq';
const config = AI_PROVIDERS[provider] || AI_PROVIDERS.groq;

async function callAI(messages, options = {}) {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️  AI API key not configured. Returning mock response.');
    return { content: 'IA não configurada. Configure a chave da API nas configurações.' };
  }

  const model = options.model || process.env.AI_MODEL || config.defaultModel;

  try {
    // All three providers are OpenAI-compatible
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature || 0.3,
        max_tokens: options.maxTokens || 2048,
        response_format: options.json ? { type: 'json_object' } : undefined,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AI API Error (${response.status}): ${error}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      usage: data.usage,
    };
  } catch (error) {
    console.error('AI Service Error:', error.message);
    return { content: null, error: error.message };
  }
}

// ---- SPECIALIZED AI FUNCTIONS ----

export async function categorizeTransaction(description, amount, existingCategories = [], userRules = []) {
  const rulesContext = userRules.length > 0
    ? `\nRegras do usuário (prioridade máxima):\n${userRules.map(r => `- "${r.keyword}" → ${r.category_name}`).join('\n')}`
    : '';

  const result = await callAI([
    {
      role: 'system',
      content: `Você é um classificador financeiro brasileiro. Categorize a transação na categoria mais adequada.
Categorias disponíveis: ${existingCategories.map(c => c.name).join(', ')}
${rulesContext}
Responda APENAS com JSON: {"category": "nome_categoria", "subcategory": "sugestão_opcional", "confidence": 0.0-1.0}`,
    },
    {
      role: 'user',
      content: `Transação: "${description}" | Valor: R$ ${Math.abs(amount)} | Tipo: ${amount >= 0 ? 'Receita' : 'Despesa'}`,
    },
  ], { json: true, temperature: 0.1 });

  try {
    return JSON.parse(result.content);
  } catch {
    return { category: 'Outros', subcategory: null, confidence: 0 };
  }
}

export async function generateInsights(financialData) {
  const prevScore = financialData.healthScore?.previous;
  const currScore = financialData.healthScore?.current;
  const scoreEvolution = prevScore != null && currScore != null
    ? `\nEvolução do Score de Saúde: ${prevScore} → ${currScore} (${currScore >= prevScore ? '+' : ''}${currScore - prevScore} pontos)`
    : '';

  const result = await callAI([
    {
      role: 'system',
      content: `Você é um consultor financeiro pessoal brasileiro, acessível e amigável.
Analise os dados e gere insights EVOLUTIVOS, PREDITIVOS e ACIONÁVEIS. Evite jargões técnicos.
Use linguagem acolhedora como um coach financeiro que acompanha o progresso do usuário ao longo do tempo.
Compare com períodos anteriores quando possível. Identifique padrões e faça previsões.${scoreEvolution}
Classifique os insights por natureza de gasto: Sobrevivência (fixo), Estilo de Vida (variável), Futuro (investimento).
Responda em JSON: {"insights": [{"type": "optimization|investment|debt|savings|goal|pattern|alert|prediction", "nature": "fixed|variable|future", "title": "...", "description": "...", "potential_savings": 0, "priority": "high|medium|low", "action": "...", "trend": "up|down|stable"}]}`,
    },
    {
      role: 'user',
      content: `Dados financeiros do usuário (período: ${financialData.period || '3 meses'}):\n${JSON.stringify(financialData, null, 2)}`,
    },
  ], { json: true, temperature: 0.4, maxTokens: 4000 });

  try {
    return JSON.parse(result.content);
  } catch {
    return { insights: [] };
  }
}

export async function generateBudget(historicalData, goals) {
  const result = await callAI([
    {
      role: 'system',
      content: `Você é um planejador financeiro. Crie um orçamento mensal inteligente baseado no histórico de gastos.
Considere as metas do usuário. Sugira limites realistas por categoria.
Responda em JSON: {"budgets": [{"category": "...", "planned_amount": 0, "reasoning": "..."}], "total_planned": 0, "tips": ["..."]}`,
    },
    {
      role: 'user',
      content: `Histórico de gastos (últimos 3 meses):\n${JSON.stringify(historicalData)}\n\nMetas:\n${JSON.stringify(goals)}`,
    },
  ], { json: true });

  try {
    return JSON.parse(result.content);
  } catch {
    return { budgets: [], total_planned: 0, tips: [] };
  }
}

export async function calculateHealthScore(userData) {
  const result = await callAI([
    {
      role: 'system',
      content: `Você é um analista de saúde financeira. Calcule scores de 0-100 para cada categoria.
Categorias: taxa_poupanca, gestao_dividas, reserva_emergencia, diversificacao, pagamento_contas, controle_gastos.
Score total: média ponderada. Nota: A(80-100), B(60-79), C(40-59), D(20-39), F(0-19).
Gere insights específicos e acionáveis.
Responda em JSON: {"total_score": 0, "grade": "A-F", "label": "Excelente/Bom/Regular/Preocupante/Crítico",
"categories": {"taxa_poupanca": {"score": 0, "value": "...", "description": "..."}, ...},
"insights": [{"type": "warning|success|info", "title": "...", "description": "...", "category": "...", "action": "..."}]}`,
    },
    {
      role: 'user',
      content: `Dados do usuário:\n${JSON.stringify(userData)}`,
    },
  ], { json: true, temperature: 0.2 });

  try {
    return JSON.parse(result.content);
  } catch {
    return { total_score: 0, grade: 'F', label: 'Sem dados', categories: {}, insights: [] };
  }
}

export async function chatWithAssistant(message, context) {
  const result = await callAI([
    {
      role: 'system',
      content: `Você é a Lume ☀️, assistente financeira pessoal inteligente. Seja acolhedora, clara e prática.

Você tem acesso completo ao perfil financeiro do usuário e pode responder sobre:
- Gastos por categoria, período, natureza (Sobrevivência, Estilo de Vida, Futuro)
- Contas fixas e vencimentos próximos
- Progresso de metas
- Status de dívidas
- Reserva de emergência
- Saúde financeira geral e evolução
- Padrões de comportamento financeiro identificados nos dados
- Previsões e recomendações personalizadas

Sempre que possível, identifique padrões nos dados (ex: gastos que sobem todo mês, categorias que ultrapassam o orçamento, progress recorrente em alguma meta).
Faça previsões quando os dados permitirem (ex: "no ritmo atual, sua meta X será atingida em Y meses").

Perfil financeiro completo do usuário:
${JSON.stringify(context, null, 2)}

Responda de forma objetiva e personalizada. Use emojis com modaração. Sempre em português.`,
    },
    { role: 'user', content: message },
  ], { temperature: 0.6, maxTokens: 1200 });

  return result.content || 'Desculpe, não consegui processar sua mensagem. Tente novamente! 😊';
}

export default { categorizeTransaction, generateInsights, generateBudget, calculateHealthScore, chatWithAssistant };

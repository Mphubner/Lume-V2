import { z } from 'zod';

export const validate = (schema) => (req, res, next) => {
  try {
    // Zod will parse and cast the request body based on schema rules
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.warn('❌ [Zod Validator] Tentativa de Injeção ou Payload Mal-formado barrada:', error.errors);
      return res.status(400).json({
        error: 'Validação de Dados Falhou. Parâmetros inválidos.',
        details: error.errors,
      });
    }
    next(error);
  }
};

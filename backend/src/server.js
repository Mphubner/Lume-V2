import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import transactionsRouter from './routes/transactions.js';
import accountsRouter from './routes/accounts.js';
import categoriesRouter from './routes/categories.js';
import recurringRouter from './routes/recurring.js';
import debtsRouter from './routes/debts.js';
import goalsRouter from './routes/goals.js';
import budgetsRouter from './routes/budgets.js';
import healthRouter from './routes/health.js';
import importRouter from './routes/import.js';
import aiRouter from './routes/ai.js';
import adminRouter from './routes/admin.js';
import profileRouter from './routes/profile.js';
import dashboardRouter from './routes/dashboard.js';
import paymentsRouter from './routes/payments.js';
import notificationsRouter from './routes/notifications.js';
import pluggyRouter from './routes/pluggy.js';
import familyRouter from './routes/family.js';
import reserveRouter from './routes/reserve.js';
import auditRouter from './routes/audit.js';
dotenv.config();

const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 5001;

// Security Middleware
app.use(helmet());
const allowedOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim()) 
  : ['http://localhost:5173'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Bloqueado pelo CORS'));
    }
  },
  credentials: true,
}));

// Rate Limiting
const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 500, // 500 requests por minuto por IP (SPAs fazem muitas chamadas paralelas)
  message: { error: 'Muitas requisições, aguarde um momento.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// Special raw body parsing for Stripe Webhook BEFORE express.json()
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// API Routes
app.use('/api/profile', profileRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/recurring', recurringRouter);
app.use('/api/debts', debtsRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/budgets', budgetsRouter);
app.use('/api/health', healthRouter);
app.use('/api/import', importRouter);
app.use('/api/ai', aiRouter);
app.use('/api/admin', adminRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/pluggy', pluggyRouter);
app.use('/api/family', familyRouter);
app.use('/api/reserve', reserveRouter);
app.use('/api/audit', auditRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`\n☀️  Lume Backend running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Mode: ${process.env.NODE_ENV || 'development'}\n`);
});

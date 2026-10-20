import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { supabase } from './config/supabase.js';
import { startImportWorker } from './services/importWorker.js';
import { checked } from './services/access.js';
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
import plansRouter from './routes/plans.js';
import workspacesRouter from './routes/workspaces.js';

export function validateConfiguration(env=process.env) {
 if(env.NODE_ENV!=='production')return;
 for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','FRONTEND_URL'])if(!env[key])throw new Error('Configuração obrigatória ausente: '+key);
 for(const origin of env.FRONTEND_URL.split(',')){const u=new URL(origin.trim());if(u.protocol!=='https:'||u.pathname!=='/'||u.search||u.hash)throw new Error('FRONTEND_URL exige origens HTTPS.');}
 if(env.BILLING_ENABLED==='true'&&(!env.STRIPE_SECRET_KEY||!env.STRIPE_WEBHOOK_SECRET))throw new Error('Cobrança exige chave e assinatura de webhook.');
}
export function createApp({db=supabase,workerState=()=>({enabled:false,healthy:true})}={}) {
 const app=express();
 app.disable('x-powered-by');
 // Configure only the proxy hops actually present in the deployment.
 app.set('trust proxy',Number(process.env.TRUST_PROXY_HOPS||0));
 app.use((req,res,next)=>{req.requestId=randomUUID();res.setHeader('X-Request-Id',req.requestId);res.setHeader('Cache-Control','no-store');next();});
 app.use(helmet());
 const allowed=(process.env.FRONTEND_URL||'http://localhost:5173').split(',').map(s=>s.trim());
 app.use(cors({origin(origin,cb){if(!origin||allowed.includes(origin))cb(null,true);else{const e=new Error('Origem não autorizada.');e.status=403;cb(e);}},credentials:false}));
 app.use(rateLimit({windowMs:60000,limit:500,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Muitas requisições. Aguarde um minuto.'}}));
 app.use('/api/payments/webhook',express.raw({type:'application/json',limit:'1mb'}));
 app.use(express.json({limit:'1mb'}));
 app.get('/health',(_req,res)=>res.json({status:'alive',version:'2.1.0'}));
 app.get('/ready',async(_req,res)=>{
  try{
   if(!db)throw new Error('unconfigured');
   const state=checked(await db.rpc('application_readiness')),worker=workerState();
   if(state?.schema_version!=='202610190006'||!worker.healthy)throw new Error('not_ready');
   res.json({status:'ready',schema_version:state.schema_version,import_worker:worker.enabled});
  }catch{res.status(503).json({status:'not_ready',error:'Banco, migrações ou processamento indisponível.'});}
 });
 app.get('/api/capabilities',(_req,res)=>res.json({bank_connection:false,imports:['csv','ofx','pdf_review'],billing:process.env.BILLING_ENABLED==='true',notifications:['in_app']}));
 app.use('/api/profile',profileRouter);
 app.use('/api/dashboard',dashboardRouter);
 app.use('/api/transactions',transactionsRouter);
 app.use('/api/accounts',accountsRouter);
 app.use('/api/categories',categoriesRouter);
 app.use('/api/recurring',recurringRouter);
 app.use('/api/debts',debtsRouter);
 app.use('/api/goals',goalsRouter);
 app.use('/api/budgets',budgetsRouter);
 app.use('/api/health',healthRouter);
 app.use('/api/import',importRouter);
 app.use('/api/ai',aiRouter);
 app.use('/api/admin',adminRouter);
 app.use('/api/payments',paymentsRouter);
 app.use('/api/notifications',notificationsRouter);
 app.use('/api/pluggy',pluggyRouter);
 app.use('/api/family',familyRouter);
 app.use('/api/reserve',reserveRouter);
 app.use('/api/audit',auditRouter);
 app.use('/api/plans',plansRouter);
 app.use('/api/workspaces',workspacesRouter);
 app.use((_req,res)=>res.status(404).json({error:'Rota não encontrada.'}));
 app.use((error,req,res,_next)=>{
  const status=error.status===403?403:error.type==='entity.too.large'?413:error instanceof SyntaxError?400:500;
  console.error(JSON.stringify({event:'request_failed',request_id:req.requestId,status,code:error.code||error.type||'internal'}));
  res.status(status).json({error:status===400?'JSON inválido.':status===413?'Arquivo ou requisição acima do limite.':status===403?'Origem não autorizada.':'Erro interno do servidor.',request_id:req.requestId});
 });
 return app;
}
export function startServer() {
 validateConfiguration();
 let workerErrors=0;
 const enabled=Boolean(supabase)&&process.env.IMPORT_WORKER_ENABLED!=='false';
 const worker=enabled?startImportWorker(supabase,{onSuccess:()=>{workerErrors=0;},onError:error=>{workerErrors++;console.error(JSON.stringify({event:'import_worker_error',code:error.code||'internal'}));}}):null;
 const app=createApp({workerState:()=>({enabled,healthy:workerErrors<3})});
 const server=app.listen(Number(process.env.PORT||5001),()=>console.log(JSON.stringify({event:'server_started',port:Number(process.env.PORT||5001),import_worker:enabled})));
 let closing=false;
 const close=async()=>{if(closing)return;closing=true;server.close();await worker?.stop();server.closeAllConnections();};
 process.once('SIGINT',close);process.once('SIGTERM',close);
 return {app,server,close};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)startServer();

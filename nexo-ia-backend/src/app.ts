import express from 'express';
import cors from 'cors';
import { env } from './env';
import { authRouter } from './routes/auth.routes';
import { iaRouter } from './routes/ia.routes';
import { clientsRouter } from './routes/clients.routes';
import { dealsRouter } from './routes/deals.routes';
import { policiesRouter } from './routes/policies.routes';
import { auditRouter } from './routes/audit.routes';
import { protocolsRouter } from './routes/protocols.routes';
import { requireAuth, requireCompanyContext } from './auth/middleware';

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',') }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRouter);

  // Exemplo de rota "normal" do CRM, já usando o mesmo par de middlewares de
  // tenant que a IA usa — reforça que a IA reaproveita a mesma fundação de
  // auth/tenant, não um caminho paralelo.
  app.get('/api/me', requireAuth, requireCompanyContext, (req, res) => {
    res.json({ user: req.auth });
  });

  // Rotas do CRM — CRUD de clientes, apólices, negócios
  app.use('/api/clients', clientsRouter);
  app.use('/api/deals', dealsRouter);
  app.use('/api/policies', policiesRouter);

  // Rotas de suporte — auditoria, protocolos
  app.use('/api/audit', auditRouter);
  app.use('/api/protocols', protocolsRouter);

  app.use('/api/ia', iaRouter);

  return app;
}

// Criar e exportar a aplicação como default para Vercel
const app = createApp();
export default app;

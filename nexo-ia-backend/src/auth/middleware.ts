import type { NextFunction, Request, Response } from 'express';
import { verifyToken, type AuthTokenPayload } from './jwt';

// Contexto de tenant resolvido UMA vez por requisição, a partir do token
// assinado pelo servidor — nunca de algo que o cliente possa forjar (body,
// query string, header customizado). Tudo daqui pra baixo (rotas, serviços,
// ferramentas da IA) recebe esse contexto já pronto; nenhuma camada abaixo
// tem permissão de "escolher" outro company_id por conta própria.
export interface TenantContext {
  userId: string;
  companyId: string | null; // null só é válido para role === 'super_admin'
  role: AuthTokenPayload['role'];
  nome: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: TenantContext;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token ausente.' });
    return;
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyToken(token);
    req.auth = {
      userId: payload.sub,
      companyId: payload.companyId,
      role: payload.role,
      nome: payload.nome,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

// Uso nas rotas que exigem obrigatoriamente um tenant (praticamente todas as
// rotas de CRM e todas as ferramentas de IA, exceto rotas exclusivas do
// Super Admin). Falha explicitamente em vez de deixar um `companyId: null`
// vazar para uma query — é a rede de segurança contra o "esqueci o filtro".
export function requireCompanyContext(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ error: 'Não autenticado.' });
    return;
  }
  if (!req.auth.companyId) {
    res.status(403).json({
      error: 'Este recurso exige um usuário vinculado a uma empresa (não disponível para super_admin).',
    });
    return;
  }
  next();
}

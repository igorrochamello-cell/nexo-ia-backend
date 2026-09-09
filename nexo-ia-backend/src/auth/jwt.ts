import jwt from 'jsonwebtoken';
import { env } from '../env';

export type UserRole = 'super_admin' | 'admin' | 'vendedor' | 'produtor' | 'atendente';

// O "contexto de tenant" carregado dentro do token. Isto é o único lugar de
// onde companyId pode vir para o resto da aplicação — NUNCA de um campo do
// corpo da requisição ou de um parâmetro de URL. Ver src/auth/middleware.ts.
export interface AuthTokenPayload {
  sub: string; // userId
  companyId: string | null;
  role: UserRole;
  nome: string;
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] });
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
}

import type { AuthTokenPayload } from '../auth/jwt';

// Mesmo binário do protótipo (isGestao()) — hoje só "admin" enxerga a
// carteira inteira da equipe; os demais cargos (vendedor, produtor,
// atendente) só o próprio recorte. super_admin não entra aqui porque não
// tem company_id e nunca chama as ferramentas de CRM diretamente.
export function isGestao(role: AuthTokenPayload['role']): boolean {
  return role === 'admin';
}

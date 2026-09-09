import { Router } from 'express';
import { z } from 'zod';
import { findUserByEmail } from '../modules/users/repository';
import { verifyPassword } from '../auth/passwords';
import { signToken } from '../auth/jwt';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    return;
  }
  const { email, senha } = parsed.data;

  const user = await findUserByEmail(email);
  // Mensagem de erro deliberadamente idêntica nos dois casos (usuário
  // inexistente vs. senha errada) — não dar pista de quais e-mails existem.
  if (!user || !user.ativo) {
    res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    return;
  }
  const ok = await verifyPassword(senha, user.senhaHash);
  if (!ok) {
    res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    return;
  }

  const token = signToken({
    sub: user.id,
    companyId: user.companyId,
    role: user.role,
    nome: user.nome,
  });

  res.json({
    token,
    user: { id: user.id, nome: user.nome, email: user.email, role: user.role, companyId: user.companyId },
  });
});

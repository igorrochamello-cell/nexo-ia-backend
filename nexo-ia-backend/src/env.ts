import 'dotenv/config';
import { z } from 'zod';

// Validação central das variáveis de ambiente. O processo falha rápido e com
// mensagem clara se algo essencial faltar — em vez de quebrar mais tarde, de
// forma confusa, dentro de uma rota ou do orquestrador de IA.
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória (Postgres).'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET precisa ter pelo menos 16 caracteres.'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
  PORT: z.coerce.number().default(3333),
  CORS_ORIGIN: z.string().default('*'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Variáveis de ambiente inválidas:', parsed.error.flatten().fieldErrors);
  throw new Error('Configuração de ambiente inválida — veja .env.example.');
}

export const env = parsed.data;

// Só um alerta (não derruba o processo): sem chave, a NEXO IA continua fora
// do ar, mas o resto do backend (auth, CRUD de leitura, etc.) segue útil.
if (!env.OPENAI_API_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    '[nexo-ia] OPENAI_API_KEY não configurada — o orquestrador de IA vai recusar chamadas até uma chave real ser definida.',
  );
}

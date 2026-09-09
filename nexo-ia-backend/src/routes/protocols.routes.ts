import { Router } from 'express';
import { requireAuth, requireCompanyContext } from '../auth/middleware';
import { db } from '../db/client';
import { sql } from 'drizzle-orm';

export const protocolsRouter = Router();

protocolsRouter.use(requireAuth, requireCompanyContext);

const typeMap: Record<string, string> = {
  'sinistro': 'SINI',
  'saude': 'SAUDE',
  'endosso': 'ENDO',
  'renovacao': 'RENO',
};

// POST /api/protocols/next - Gerar próximo número sequencial
protocolsRouter.post('/next', async (req, res) => {
  try {
    const { type } = req.body;

    if (!type || !typeMap[type]) {
      res.status(400).json({ error: 'Tipo de protocolo inválido' });
      return;
    }

    const companyId = req.auth!.companyId;
    if (!companyId) {
      res.status(403).json({ error: 'Sem acesso a empresa' });
      return;
    }

    const prefix = typeMap[type];

    // Usar raw SQL para garantir atomicidade
    // Busca o último número para este tipo/empresa
    const lastProtocol = await db.execute(
      sql`
        SELECT last_number FROM protocols
        WHERE company_id = ${companyId} AND type = ${type}
        FOR UPDATE
      `,
    );

    let nextNumber = 1;
    if (lastProtocol.rows && lastProtocol.rows.length > 0) {
      const row = lastProtocol.rows[0] as Record<string, any>;
      nextNumber = (row.last_number as number) + 1;
    }

    // Atualizar ou inserir
    if (lastProtocol.rows && lastProtocol.rows.length > 0) {
      await db.execute(
        sql`
          UPDATE protocols
          SET last_number = ${nextNumber}
          WHERE company_id = ${companyId} AND type = ${type}
        `,
      );
    } else {
      await db.execute(
        sql`
          INSERT INTO protocols (company_id, type, last_number, created_at)
          VALUES (${companyId}, ${type}, ${nextNumber}, NOW())
        `,
      );
    }

    // Formatar: NEXO-XXXX-000001
    const formattedNumber = String(nextNumber).padStart(6, '0');
    const protocol = `NEXO-${prefix}-${formattedNumber}`;

    res.json({ protocol, number: nextNumber, type, prefix });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar protocolo' });
  }
});

// GET /api/protocols/last/:type - Obter último protocolo de um tipo
protocolsRouter.get('/last/:type', async (req, res) => {
  try {
    const { type } = req.params;

    if (!type || !typeMap[type]) {
      res.status(400).json({ error: 'Tipo de protocolo inválido' });
      return;
    }

    const companyId = req.auth!.companyId;
    if (!companyId) {
      res.status(403).json({ error: 'Sem acesso a empresa' });
      return;
    }

    const prefix = typeMap[type];

    const result = await db.execute(
      sql`
        SELECT last_number FROM protocols
        WHERE company_id = ${companyId} AND type = ${type}
      `,
    );

    const lastNumber = result.rows?.[0] ? (result.rows[0] as Record<string, any>).last_number as number : 0;
    const formattedNumber = String(lastNumber).padStart(6, '0');
    const protocol = lastNumber > 0 ? `NEXO-${prefix}-${formattedNumber}` : null;

    res.json({ protocol, number: lastNumber, type, prefix });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar protocolo' });
  }
});

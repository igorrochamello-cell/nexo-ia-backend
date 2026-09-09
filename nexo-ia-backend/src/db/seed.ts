// Seed de desenvolvimento — reaproveita as mesmas corretoras fictícias já
// usadas no protótipo (index.html / mockup de Super Admin) para manter os
// dois lados do projeto no mesmo universo de exemplo, e para dar dado real
// o bastante pra testar isolamento entre empresas de verdade (duas
// corretoras, cada uma com clientes/negócios/apólices/tarefas próprios).
import { db, closeDb } from './client';
import { clients, companies, deals, pipelines, pipelineStages, policies, tasks, users } from './schema';
import { hashPassword } from '../auth/passwords';

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

async function seedCompany(opts: {
  nomeFantasia: string;
  razaoSocial: string;
  cnpj: string;
  adminNome: string;
  adminEmail: string;
  vendedorNome: string;
  vendedorEmail: string;
  senha: string;
  clientes: Array<{ nome: string; ramo: string; seguradora: string; valor: number; diasVigenciaFim: number }>;
}) {
  const [company] = await db
    .insert(companies)
    .values({ nomeFantasia: opts.nomeFantasia, razaoSocial: opts.razaoSocial, cnpj: opts.cnpj, status: 'active' })
    .returning();

  const senhaHash = await hashPassword(opts.senha);

  const [admin] = await db
    .insert(users)
    .values({ companyId: company.id, nome: opts.adminNome, email: opts.adminEmail, senhaHash, role: 'admin' })
    .returning();

  const [vendedor] = await db
    .insert(users)
    .values({ companyId: company.id, nome: opts.vendedorNome, email: opts.vendedorEmail, senhaHash, role: 'vendedor' })
    .returning();

  const [pipeline] = await db
    .insert(pipelines)
    .values({ companyId: company.id, nome: 'Comercial', setor: 'Comercial' })
    .returning();

  const stageNames = ['Prospecção', 'Proposta', 'Fechamento'];
  const stages = await db
    .insert(pipelineStages)
    .values(stageNames.map((nome, i) => ({ pipelineId: pipeline.id, nome, ordem: i })))
    .returning();

  for (const [i, c] of opts.clientes.entries()) {
    const [client] = await db
      .insert(clients)
      .values({
        companyId: company.id,
        nome: c.nome,
        telefone: '(11) 90000-000' + i,
        email: c.nome.toLowerCase().replace(/[^a-z0-9]+/g, '.') + '@exemplo.com.br',
        vendedorId: vendedor.id,
      })
      .returning();

    const stage = stages[i % stages.length];
    await db.insert(deals).values({
      companyId: company.id,
      clientId: client.id,
      pipelineId: pipeline.id,
      stageId: stage.id,
      corretorId: vendedor.id,
      ramo: c.ramo,
      seguradora: c.seguradora,
      valorEstimado: String(c.valor),
      status: 'aberto',
      stageChangedAt: daysFromNow(-(i + 1)), // negócios com dias diferentes parados, pra testar analisar_pipeline
    });

    await db.insert(policies).values({
      companyId: company.id,
      clientId: client.id,
      ramo: c.ramo,
      seguradora: c.seguradora,
      premioAnual: String(c.valor),
      comissaoPercentual: '12.00',
      vigenciaInicio: daysFromNow(-330),
      vigenciaFim: daysFromNow(c.diasVigenciaFim),
      status: 'ativa',
    });

    await db.insert(tasks).values({
      companyId: company.id,
      responsavelId: vendedor.id,
      clientId: client.id,
      tipo: 'ligacao',
      titulo: `Follow-up com ${c.nome}`,
      data: daysFromNow(1),
      concluida: false,
    });
  }

  return { company, admin, vendedor };
}

async function main() {
  const alpha = await seedCompany({
    nomeFantasia: 'Corretora Alpha',
    razaoSocial: 'Alpha Corretora de Seguros Ltda',
    cnpj: '12.345.678/0001-90',
    adminNome: 'João Almeida',
    adminEmail: 'joao@alpha.com.br',
    vendedorNome: 'Patrícia Nogueira',
    vendedorEmail: 'patricia@alpha.com.br',
    senha: 'alpha123',
    clientes: [
      { nome: 'Fernanda Ribas', ramo: 'Auto', seguradora: 'Porto Seguro', valor: 2400, diasVigenciaFim: 18 },
      { nome: 'Grupo Marins Ltda', ramo: 'Vida', seguradora: 'Prudential', valor: 1100, diasVigenciaFim: 120 },
    ],
  });

  const belaVista = await seedCompany({
    nomeFantasia: 'Bela Vista Seguros',
    razaoSocial: 'Bela Vista Seguros ME',
    cnpj: '98.765.432/0001-11',
    adminNome: 'Renata Souza',
    adminEmail: 'renata@belavista.com.br',
    vendedorNome: 'Bruno Casagrande',
    vendedorEmail: 'bruno@belavista.com.br',
    senha: 'bela123',
    clientes: [
      { nome: 'Odete Comércio', ramo: 'Saúde PJ', seguradora: 'Amil', valor: 4800, diasVigenciaFim: 9 },
      { nome: 'Bittencourt Ltda', ramo: 'Auto frota', seguradora: 'Porto Seguro', valor: 7600, diasVigenciaFim: 45 },
    ],
  });

  // eslint-disable-next-line no-console
  console.log('[nexo-ia] seed concluído:');
  // eslint-disable-next-line no-console
  console.log(` - ${alpha.company.nomeFantasia}: admin ${alpha.admin.email} / vendedor ${alpha.vendedor.email} (senha: alpha123)`);
  // eslint-disable-next-line no-console
  console.log(
    ` - ${belaVista.company.nomeFantasia}: admin ${belaVista.admin.email} / vendedor ${belaVista.vendedor.email} (senha: bela123)`,
  );

  await closeDb();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[nexo-ia] falha ao popular o banco:', err);
  process.exit(1);
});

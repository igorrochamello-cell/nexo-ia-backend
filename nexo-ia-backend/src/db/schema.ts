// Schema mínimo da "Fase 1" (fundação multitenant) necessário para a NEXO IA
// existir de verdade — ver claude/diagnostico-saas-multitenant.md no projeto.
//
// Regra de ouro deste schema: TODA tabela operacional carrega company_id,
// e nenhuma linha de código de aplicação deve montar uma query sem passar
// por um repositório que já injeta esse filtro (ver src/modules/*/repository.ts).

import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  numeric,
  integer,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', [
  'super_admin',
  'admin',
  'vendedor',
  'produtor',
  'atendente',
]);

export const dealStatusEnum = pgEnum('deal_status', [
  'aberto',
  'ganho',
  'perdido',
  'congelado',
]);

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  nomeFantasia: text('nome_fantasia').notNull(),
  razaoSocial: text('razao_social').notNull(),
  cnpj: varchar('cnpj', { length: 20 }),
  email: text('email'),
  telefone: varchar('telefone', { length: 30 }),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // nulo apenas para super_admin (equipe da própria NEXO, sem empresa-cliente)
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
    nome: text('nome').notNull(),
    email: text('email').notNull().unique(),
    senhaHash: text('senha_hash').notNull(),
    telefone: varchar('telefone', { length: 30 }),
    role: userRoleEnum('role').notNull().default('vendedor'),
    ativo: boolean('ativo').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    companyIdx: index('users_company_idx').on(t.companyId),
  }),
);

export const pipelines = pgTable(
  'pipelines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    nome: text('nome').notNull(),
    setor: text('setor'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    companyIdx: index('pipelines_company_idx').on(t.companyId),
  }),
);

export const pipelineStages = pgTable(
  'pipeline_stages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pipelineId: uuid('pipeline_id')
      .notNull()
      .references(() => pipelines.id, { onDelete: 'cascade' }),
    nome: text('nome').notNull(),
    ordem: integer('ordem').notNull(),
  },
  (t) => ({
    pipelineIdx: index('pipeline_stages_pipeline_idx').on(t.pipelineId),
  }),
);

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    nome: text('nome').notNull(),
    documento: varchar('documento', { length: 20 }),
    telefone: varchar('telefone', { length: 30 }),
    email: text('email'),
    cidade: text('cidade'),
    vendedorId: uuid('vendedor_id').references(() => users.id),
    indicadoPor: text('indicado_por'),
    observacoes: text('observacoes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    companyIdx: index('clients_company_idx').on(t.companyId),
  }),
);

export const deals = pgTable(
  'deals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    pipelineId: uuid('pipeline_id')
      .notNull()
      .references(() => pipelines.id),
    stageId: uuid('stage_id')
      .notNull()
      .references(() => pipelineStages.id),
    corretorId: uuid('corretor_id')
      .notNull()
      .references(() => users.id),
    ramo: text('ramo').notNull(),
    seguradora: text('seguradora'),
    valorEstimado: numeric('valor_estimado', { precision: 12, scale: 2 }).notNull().default('0'),
    status: dealStatusEnum('status').notNull().default('aberto'),
    stageChangedAt: timestamp('stage_changed_at').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    companyIdx: index('deals_company_idx').on(t.companyId),
    companyStatusIdx: index('deals_company_status_idx').on(t.companyId, t.status),
  }),
);

export const policies = pgTable(
  'policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    dealId: uuid('deal_id').references(() => deals.id),
    ramo: text('ramo').notNull(),
    seguradora: text('seguradora').notNull(),
    premioAnual: numeric('premio_anual', { precision: 12, scale: 2 }).notNull().default('0'),
    comissaoPercentual: numeric('comissao_percentual', { precision: 5, scale: 2 }),
    vigenciaInicio: timestamp('vigencia_inicio').notNull(),
    vigenciaFim: timestamp('vigencia_fim').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('ativa'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    companyIdx: index('policies_company_idx').on(t.companyId),
    companyVigenciaIdx: index('policies_company_vigencia_idx').on(t.companyId, t.vigenciaFim),
  }),
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    responsavelId: uuid('responsavel_id')
      .notNull()
      .references(() => users.id),
    clientId: uuid('client_id').references(() => clients.id),
    dealId: uuid('deal_id').references(() => deals.id),
    tipo: varchar('tipo', { length: 20 }).notNull(),
    titulo: text('titulo').notNull(),
    data: timestamp('data').notNull(),
    concluida: boolean('concluida').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    companyIdx: index('tasks_company_idx').on(t.companyId),
    companyRespIdx: index('tasks_company_resp_idx').on(t.companyId, t.responsavelId, t.concluida),
  }),
);

// Log de uso da NEXO IA — item 9 do pedido. Guarda metadados de auditoria,
// nunca o conteúdo bruto da conversa (ver src/ia/logging.ts).
export const iaUsageLogs = pgTable(
  'ia_usage_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tool: text('tool'),
    recordIds: text('record_ids').array().notNull().default([]),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    status: varchar('status', { length: 10 }).notNull(),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    companyCreatedIdx: index('ia_logs_company_created_idx').on(t.companyId, t.createdAt),
  }),
);

// Sequenciador de protocolos — gera IDs únicos como NEXO-SINI-000001
// para sinistros, requisições de saúde, endossos, etc.
export const protocols = pgTable(
  'protocols',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 20 }).notNull(), // 'sinistro', 'saude', 'endosso', 'renovacao'
    lastNumber: integer('last_number').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    companyTypeIdx: index('protocols_company_type_idx').on(t.companyId, t.type),
  }),
);

// Log de auditoria/timeline — registra ações de usuários
export const timelineEvents = pgTable(
  'timeline_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tipo: varchar('tipo', { length: 20 }).notNull(), // 'create', 'update', 'delete'
    descricao: text('descricao').notNull(),
    tabela: text('tabela').notNull(),
    recordId: uuid('record_id'),
    dados: text('dados').notNull().default('{}'), // JSON stringified
    criadoEm: timestamp('criado_em').notNull().defaultNow(),
  },
  (t) => ({
    companyIdx: index('timeline_events_company_idx').on(t.companyId),
    userIdx: index('timeline_events_user_idx').on(t.userId),
  }),
);

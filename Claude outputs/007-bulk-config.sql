-- FASE 0: Migration 007 - Bulk Actions & Configuration
-- Executar DEPOIS de 006-health-claims-renewals.sql

-- ====== BULK_ACTIONS (Ações em lote com idempotência)
CREATE TABLE bulk_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key VARCHAR(255) NOT NULL, -- Chave para detectar duplicatas
  tipo_acao VARCHAR(100), -- import_claims, import_policies, bulk_update_clients, etc
  status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed, partial
  total_registros INT DEFAULT 0,
  registros_processados INT DEFAULT 0,
  registros_com_erro INT DEFAULT 0,
  mensagem_resultado TEXT,
  arquivo_origem VARCHAR(500),
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  iniciado_em TIMESTAMP,
  finalizado_em TIMESTAMP,
  UNIQUE(company_id, idempotency_key)
);

CREATE INDEX idx_bulk_actions_company_id ON bulk_actions(company_id);
CREATE INDEX idx_bulk_actions_status ON bulk_actions(status);
CREATE INDEX idx_bulk_actions_idempotency_key ON bulk_actions(idempotency_key);

-- ====== BULK_ACTION_ITEMS (Itens de cada ação em lote)
CREATE TABLE bulk_action_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bulk_action_id UUID NOT NULL REFERENCES bulk_actions(id) ON DELETE CASCADE,
  sequence INT,
  dados_entrada JSONB,
  dados_criados JSONB,
  status VARCHAR(50), -- pending, success, error
  erro_mensagem TEXT,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bulk_action_items_bulk_action_id ON bulk_action_items(bulk_action_id);
CREATE INDEX idx_bulk_action_items_status ON bulk_action_items(status);

-- ====== DASHBOARD_CONFIGS (Configurações de dashboard por usuário)
CREATE TABLE dashboard_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  widgets JSONB, -- Array de widgets com configurações
  layout VARCHAR(50) DEFAULT '4_columns', -- 2_columns, 3_columns, 4_columns
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, user_id)
);

CREATE INDEX idx_dashboard_configs_company_id ON dashboard_configs(company_id);
CREATE INDEX idx_dashboard_configs_user_id ON dashboard_configs(user_id);

-- ====== USER_PREFERENCES (Preferências de usuário)
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idioma VARCHAR(10) DEFAULT 'pt_BR',
  fuso_horario VARCHAR(50),
  notificacoes_email BOOLEAN DEFAULT true,
  notificacoes_push BOOLEAN DEFAULT true,
  tema VARCHAR(50) DEFAULT 'light', -- light, dark, auto
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, user_id)
);

CREATE INDEX idx_user_preferences_company_id ON user_preferences(company_id);
CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);

-- ====== METAS (Metas por usuário/equipe)
CREATE TABLE metas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  tipo VARCHAR(50), -- receita, comissao, quantidade_clientes, etc
  valor_meta DECIMAL(12,2),
  periodo VARCHAR(50), -- mes, trimestre, ano
  ano_mes VARCHAR(10), -- 2026-09 (para meses específicos)
  valor_alcancado DECIMAL(12,2) DEFAULT 0,
  percentual_realizado INT GENERATED ALWAYS AS (
    CASE WHEN valor_meta = 0 THEN 0 ELSE (valor_alcancado * 100 / valor_meta) END
  ) STORED,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_metas_company_id ON metas(company_id);
CREATE INDEX idx_metas_user_id ON metas(user_id);
CREATE INDEX idx_metas_team_id ON metas(team_id);
CREATE INDEX idx_metas_periodo ON metas(ano_mes);

-- ====== PROTOCOLS (Gerador de protocolos sequenciais)
CREATE TABLE protocols (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL, -- SINISTRO, REQUISICAO, RENOVACAO, ENDOSSO, etc
  ultimo_numero INT DEFAULT 0,
  prefixo VARCHAR(20) DEFAULT 'NEXO',
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, tipo)
);

CREATE INDEX idx_protocols_company_id ON protocols(company_id);

-- ====== Enable RLS
ALTER TABLE bulk_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE metas ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocols ENABLE ROW LEVEL SECURITY;

COMMIT;

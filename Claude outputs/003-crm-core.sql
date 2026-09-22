-- FASE 0: Migration 003 - CRM Core (Clients, Pipelines, Deals)
-- Executar DEPOIS de 002-users-permissions.sql

-- ====== CLIENTE_ORIGENS (Source de onde o cliente veio)
CREATE TABLE cliente_origens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  descricao TEXT,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, nome)
);

CREATE INDEX idx_cliente_origens_company_id ON cliente_origens(company_id);

-- ====== CLIENTS (Clientes/prospectos)
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  telefone VARCHAR(20),
  cpf_cnpj VARCHAR(20),
  tipo VARCHAR(50), -- pessoa_fisica, empresa
  endereco TEXT,
  cidade VARCHAR(100),
  estado VARCHAR(2),
  cep VARCHAR(10),
  origem_id UUID REFERENCES cliente_origens(id) ON DELETE SET NULL,
  responsavel_id UUID REFERENCES users(id) ON DELETE SET NULL,
  tags TEXT[], -- Array de tags
  notas TEXT,
  criado_por_id UUID REFERENCES users(id) ON DELETE SET NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  deleted_by UUID,
  UNIQUE(company_id, cpf_cnpj)
);

CREATE INDEX idx_clients_company_id ON clients(company_id);
CREATE INDEX idx_clients_email ON clients(email);
CREATE INDEX idx_clients_responsavel_id ON clients(responsavel_id);
CREATE INDEX idx_clients_origem_id ON clients(origem_id);

-- ====== PIPELINES (Etapas de vendas)
CREATE TABLE pipelines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  descricao TEXT,
  ordem INT DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  UNIQUE(company_id, nome)
);

CREATE INDEX idx_pipelines_company_id ON pipelines(company_id);

-- ====== PIPELINE_STAGES (Etapas dentro de um pipeline)
CREATE TABLE pipeline_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  descricao TEXT,
  ordem INT NOT NULL,
  probabilidade_conversao INT DEFAULT 0, -- 0-100%
  tempo_medio_dias INT,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(pipeline_id, nome)
);

CREATE INDEX idx_pipeline_stages_company_id ON pipeline_stages(company_id);
CREATE INDEX idx_pipeline_stages_pipeline_id ON pipeline_stages(pipeline_id);

-- ====== DEALS (Negócios/oportunidades)
CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  pipeline_stage_id UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT,
  valor_estimado DECIMAL(12,2),
  valor_confirmado DECIMAL(12,2),
  data_fechamento_esperada DATE,
  data_fechamento_real DATE,
  probabilidade_conversao INT DEFAULT 50, -- 0-100%
  responsavel_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'open', -- open, won, lost, paused
  motivo_perda TEXT,
  criado_por_id UUID REFERENCES users(id) ON DELETE SET NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  movido_para_stage_em TIMESTAMP,
  deleted_at TIMESTAMP,
  deleted_by UUID
);

CREATE INDEX idx_deals_company_id ON deals(company_id);
CREATE INDEX idx_deals_client_id ON deals(client_id);
CREATE INDEX idx_deals_pipeline_id ON deals(pipeline_id);
CREATE INDEX idx_deals_pipeline_stage_id ON deals(pipeline_stage_id);
CREATE INDEX idx_deals_status ON deals(status);
CREATE INDEX idx_deals_responsavel_id ON deals(responsavel_id);
CREATE INDEX idx_deals_data_fechamento ON deals(data_fechamento_esperada);

-- ====== DEAL_HISTORY (Histórico de movimentações de negócios)
CREATE TABLE deal_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  changed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_deal_history_company_id ON deal_history(company_id);
CREATE INDEX idx_deal_history_deal_id ON deal_history(deal_id);
CREATE INDEX idx_deal_history_criado_em ON deal_history(criado_em);

-- ====== Enable RLS
ALTER TABLE cliente_origens ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_history ENABLE ROW LEVEL SECURITY;

COMMIT;

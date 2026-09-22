-- FASE 0: Migration 006 - Health Requests, Claims & Renewals
-- Executar DEPOIS de 005-tasks-timeline.sql

-- ====== HEALTH_REQUESTS (Requisições de saúde)
CREATE TABLE health_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  numero_protocolo VARCHAR(100),
  titulo VARCHAR(255),
  descricao TEXT,
  status VARCHAR(50) DEFAULT 'aberta', -- aberta, em_analise, aprovada, negada, cancelada
  tipo_cobertura VARCHAR(100), -- consulta, cirurgia, exame, etc
  valor_solicitado DECIMAL(12,2),
  valor_autorizado DECIMAL(12,2),
  data_solicitacao DATE,
  data_resposta DATE,
  responsavel_id UUID REFERENCES users(id) ON DELETE SET NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, numero_protocolo)
);

CREATE INDEX idx_health_requests_company_id ON health_requests(company_id);
CREATE INDEX idx_health_requests_client_id ON health_requests(client_id);
CREATE INDEX idx_health_requests_status ON health_requests(status);
CREATE INDEX idx_health_requests_numero_protocolo ON health_requests(numero_protocolo);

-- ====== CLAIMS (Sinistros)
CREATE TABLE claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  numero_sinistro VARCHAR(100),
  status VARCHAR(50) DEFAULT 'aberto', -- aberto, em_analise, aprovado, negado, pago, cancelado
  data_sinistro DATE,
  data_comunicacao DATE,
  descricao TEXT,
  valor_indenizacao DECIMAL(12,2),
  valor_pago DECIMAL(12,2),
  data_pagamento DATE,
  responsavel_id UUID REFERENCES users(id) ON DELETE SET NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, numero_sinistro)
);

CREATE INDEX idx_claims_company_id ON claims(company_id);
CREATE INDEX idx_claims_policy_id ON claims(policy_id);
CREATE INDEX idx_claims_client_id ON claims(client_id);
CREATE INDEX idx_claims_status ON claims(status);
CREATE INDEX idx_claims_numero_sinistro ON claims(numero_sinistro);
CREATE INDEX idx_claims_data_sinistro ON claims(data_sinistro);

-- ====== CLAIM_TIMELINE (Histórico de status de sinistro)
CREATE TABLE claim_timeline (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  status_anterior VARCHAR(50),
  status_novo VARCHAR(50),
  motivo TEXT,
  changed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_claim_timeline_company_id ON claim_timeline(company_id);
CREATE INDEX idx_claim_timeline_claim_id ON claim_timeline(claim_id);

-- ====== RENEWALS (Renovações de apólices)
CREATE TABLE renewals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  numero_renovacao VARCHAR(100),
  data_vencimento_original DATE,
  data_vencimento_novo DATE,
  status VARCHAR(50) DEFAULT 'pendente', -- pendente, em_processo, renovada, nao_renovada, cancelada
  premio_anterior DECIMAL(12,2),
  premio_novo DECIMAL(12,2),
  responsavel_id UUID REFERENCES users(id) ON DELETE SET NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, numero_renovacao)
);

CREATE INDEX idx_renewals_company_id ON renewals(company_id);
CREATE INDEX idx_renewals_policy_id ON renewals(policy_id);
CREATE INDEX idx_renewals_client_id ON renewals(client_id);
CREATE INDEX idx_renewals_status ON renewals(status);
CREATE INDEX idx_renewals_numero_renovacao ON renewals(numero_renovacao);
CREATE INDEX idx_renewals_data_vencimento ON renewals(data_vencimento_original);

-- ====== RENEWAL_LOGS (Log de execução do job de renovação)
CREATE TABLE renewal_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  acao VARCHAR(100), -- scan_started, found_expiring, renewal_created, error
  mensagem TEXT,
  status VARCHAR(50), -- success, error, warning
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_renewal_logs_company_id ON renewal_logs(company_id);
CREATE INDEX idx_renewal_logs_criado_em ON renewal_logs(criado_em);

-- ====== Enable RLS
ALTER TABLE health_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE renewals ENABLE ROW LEVEL SECURITY;
ALTER TABLE renewal_logs ENABLE ROW LEVEL SECURITY;

COMMIT;

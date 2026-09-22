-- FASE 0: Migration 004 - Products & Policies
-- Executar DEPOIS de 003-crm-core.sql

-- ====== PRODUCTS (Produtos de seguro)
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  tipo VARCHAR(100), -- auto, residencial, empresarial, saude, etc
  descricao TEXT,
  cobertura_minima DECIMAL(12,2),
  cobertura_maxima DECIMAL(12,2),
  comissao_padrao DECIMAL(5,2), -- Percentual de comissão
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  UNIQUE(company_id, nome)
);

CREATE INDEX idx_products_company_id ON products(company_id);
CREATE INDEX idx_products_tipo ON products(tipo);

-- ====== POLICIES (Apólices)
CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  numero_apolice VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'ativa', -- ativa, vencida, cancelada, renovada
  vigencia_inicio DATE NOT NULL,
  vigencia_fim DATE NOT NULL,
  premio_total DECIMAL(12,2),
  Premio_pago DECIMAL(12,2) DEFAULT 0,
  segurada_por VARCHAR(255), -- Nome da seguradora
  criado_por_id UUID REFERENCES users(id) ON DELETE SET NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  deleted_by UUID,
  UNIQUE(company_id, numero_apolice)
);

CREATE INDEX idx_policies_company_id ON policies(company_id);
CREATE INDEX idx_policies_client_id ON policies(client_id);
CREATE INDEX idx_policies_numero_apolice ON policies(numero_apolice);
CREATE INDEX idx_policies_status ON policies(status);
CREATE INDEX idx_policies_vigencia_fim ON policies(vigencia_fim);

-- ====== COMMISSIONS (Comissões sobre apólices)
CREATE TABLE commissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  percentual DECIMAL(5,2) NOT NULL,
  valor DECIMAL(12,2),
  status VARCHAR(50) DEFAULT 'pendente', -- pendente, paga, cancelada
  data_pagamento DATE,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_commissions_company_id ON commissions(company_id);
CREATE INDEX idx_commissions_policy_id ON commissions(policy_id);
CREATE INDEX idx_commissions_user_id ON commissions(user_id);
CREATE INDEX idx_commissions_status ON commissions(status);

-- ====== RENEWAL_QUOTES (Cotações para renovação)
CREATE TABLE renewal_quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  insurer_name VARCHAR(255),
  premium_value DECIMAL(12,2),
  coverage_limit DECIMAL(12,2),
  quote_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  valid_until DATE
);

CREATE INDEX idx_renewal_quotes_company_id ON renewal_quotes(company_id);
CREATE INDEX idx_renewal_quotes_policy_id ON renewal_quotes(policy_id);

-- ====== Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE renewal_quotes ENABLE ROW LEVEL SECURITY;

COMMIT;

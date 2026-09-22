-- FASE 0: Migration 001 - Platform Tables (Companies, Plans, Subscriptions, Audit Logs)
-- Executar PRIMEIRO

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ====== COMPANIES (Multi-tenant root)
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  cnpj_cpf VARCHAR(20),
  plan VARCHAR(50) DEFAULT 'free', -- free, basic, pro, enterprise
  status VARCHAR(50) DEFAULT 'active', -- active, suspended, cancelled
  subscription_id UUID,
  max_users INT DEFAULT 1,
  modules TEXT[] DEFAULT '{clients,deals,policies}', -- Array de módulos
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  deleted_by UUID
);

CREATE INDEX idx_companies_status ON companies(status);
CREATE INDEX idx_companies_plan ON companies(plan);
CREATE INDEX idx_companies_email ON companies(email);

-- ====== PLANS (Define os planos de SaaS)
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE, -- Basic, Pro, Enterprise
  price_monthly DECIMAL(10,2),
  price_annual DECIMAL(10,2),
  max_users INT,
  max_storage_gb INT,
  modules TEXT[], -- Array de módulos: ['clients', 'deals', 'policies', 'health', 'claims', 'reports']
  features JSONB, -- Features adicionais
  description TEXT,
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ====== SUBSCRIPTIONS (Assinatura de cada empresa)
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  status VARCHAR(50) DEFAULT 'active', -- active, suspended, cancelled, past_due
  billing_cycle VARCHAR(50) DEFAULT 'monthly', -- monthly, annual
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at TIMESTAMP,
  canceled_at TIMESTAMP,
  trial_start TIMESTAMP,
  trial_end TIMESTAMP,
  metadata JSONB, -- Gateway info: stripe_subscription_id, etc
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id)
);

CREATE INDEX idx_subscriptions_company_id ON subscriptions(company_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- ====== INVOICES (Faturas/recibos)
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id),
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'BRL',
  status VARCHAR(50) DEFAULT 'draft', -- draft, open, paid, void, uncollectible
  invoice_number VARCHAR(100),
  due_date TIMESTAMP,
  paid_at TIMESTAMP,
  description TEXT,
  metadata JSONB, -- stripe_invoice_id, etc
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_invoices_company_id ON invoices(company_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE UNIQUE INDEX idx_invoices_number_company ON invoices(company_id, invoice_number) WHERE invoice_number IS NOT NULL;

-- ====== PAYMENT_ATTEMPTS (Tentativas de pagamento)
CREATE TABLE payment_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  gateway VARCHAR(50), -- stripe, pagseguro, etc
  gateway_payment_id VARCHAR(255),
  amount DECIMAL(10,2),
  status VARCHAR(50), -- pending, succeeded, failed
  error_message TEXT,
  retry_count INT DEFAULT 0,
  next_retry_at TIMESTAMP,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payment_attempts_invoice_id ON payment_attempts(invoice_id);
CREATE INDEX idx_payment_attempts_company_id ON payment_attempts(company_id);
CREATE INDEX idx_payment_attempts_status ON payment_attempts(status);

-- ====== WEBHOOK_EVENTS (Eventos de webhook para idempotência)
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  gateway VARCHAR(50), -- stripe, pagseguro
  event_type VARCHAR(100), -- payment.succeeded, payment.failed, etc
  gateway_event_id VARCHAR(255) UNIQUE, -- Idempotência: mesma ID = mesmo evento
  payload JSONB,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMP,
  error TEXT,
  retry_count INT DEFAULT 0,
  next_retry_at TIMESTAMP,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhook_events_gateway_id ON webhook_events(gateway_event_id);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed);

-- ====== AUDIT_LOGS (Trilha de auditoria imutável)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID,
  acao VARCHAR(50) NOT NULL, -- CREATE, READ, UPDATE, DELETE, LOGIN, LOGOUT, EXPORT
  recurso_tipo VARCHAR(100) NOT NULL, -- clients, deals, policies, users, etc
  recurso_id UUID,
  valor_antes JSONB,
  valor_depois JSONB,
  ip VARCHAR(45),
  user_agent TEXT,
  status VARCHAR(50) DEFAULT 'success', -- success, failure
  error_message TEXT,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para auditoria rápida
CREATE INDEX idx_audit_logs_company_id ON audit_logs(company_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_acao ON audit_logs(acao);
CREATE INDEX idx_audit_logs_recurso ON audit_logs(recurso_tipo, recurso_id);
CREATE INDEX idx_audit_logs_criado_em ON audit_logs(criado_em);

-- Reter audit logs por 7 anos (política de LGPD)
-- Nota: Job scheduler deve deletar registros com criado_em < NOW() - INTERVAL '7 years'

-- ====== Enable RLS on Platform Tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ====== RLS Policies (Será completado em Migration 008)
-- Por enquanto: apenas SuperAdmin pode ver (será definido quando roles existirem)

COMMIT;

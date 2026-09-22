-- FASE 0: Migration 008 - Triggers & Row-Level Security Policies
-- Executar DEPOIS de 007-bulk-config.sql

-- ========== PARTE 1: TRIGGERS para Update Automático de Timestamps ==========

CREATE OR REPLACE FUNCTION update_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger em todas as tabelas com atualizado_em
CREATE TRIGGER companies_update_timestamp BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

CREATE TRIGGER users_update_timestamp BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

CREATE TRIGGER clients_update_timestamp BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

CREATE TRIGGER deals_update_timestamp BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

CREATE TRIGGER policies_update_timestamp BEFORE UPDATE ON policies
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

CREATE TRIGGER tasks_update_timestamp BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

-- ... (repetir para outras tabelas com atualizado_em)

-- ========== PARTE 2: TRIGGER para Validar company_id ==========

CREATE OR REPLACE FUNCTION validate_company_id()
RETURNS TRIGGER AS $$
DECLARE
  v_company_id UUID;
BEGIN
  -- Pegar company_id da sessão
  v_company_id := current_setting('app.company_id', true)::uuid;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'app.company_id not set in session';
  END IF;

  IF NEW.company_id IS NULL THEN
    NEW.company_id := v_company_id;
  ELSIF NEW.company_id != v_company_id THEN
    RAISE EXCEPTION 'company_id mismatch: tried to insert % but session is %', NEW.company_id, v_company_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar em todas as tabelas com company_id
CREATE TRIGGER clients_validate_company_id BEFORE INSERT ON clients
  FOR EACH ROW EXECUTE FUNCTION validate_company_id();

CREATE TRIGGER deals_validate_company_id BEFORE INSERT ON deals
  FOR EACH ROW EXECUTE FUNCTION validate_company_id();

CREATE TRIGGER policies_validate_company_id BEFORE INSERT ON policies
  FOR EACH ROW EXECUTE FUNCTION validate_company_id();

-- ... (repetir para todas as tabelas operacionais)

-- ========== PARTE 3: ROW-LEVEL SECURITY POLICIES ==========

-- Criar ROLE de aplicação
CREATE ROLE app_user LOGIN PASSWORD 'change_me_in_production';
ALTER ROLE app_user NOINHERIT;
ALTER ROLE app_user NOBYPASSRLS;

-- ====== RLS Policies para Companies (SuperAdmin only)
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY companies_select_policy ON companies
  FOR SELECT
  USING (
    current_setting('app.role', true) = 'super_admin'
  );

CREATE POLICY companies_insert_policy ON companies
  FOR INSERT
  WITH CHECK (
    current_setting('app.role', true) = 'super_admin'
  );

CREATE POLICY companies_update_policy ON companies
  FOR UPDATE
  USING (
    current_setting('app.role', true) = 'super_admin'
  )
  WITH CHECK (
    current_setting('app.role', true) = 'super_admin'
  );

-- ====== RLS Policies para Users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select_policy ON users
  FOR SELECT
  USING (
    company_id = current_setting('app.company_id')::uuid
  );

CREATE POLICY users_insert_policy ON users
  FOR INSERT
  WITH CHECK (
    company_id = current_setting('app.company_id')::uuid
  );

CREATE POLICY users_update_policy ON users
  FOR UPDATE
  USING (
    company_id = current_setting('app.company_id')::uuid
  )
  WITH CHECK (
    company_id = current_setting('app.company_id')::uuid AND
    (NEW.company_id = current_setting('app.company_id')::uuid)
  );

-- ====== RLS Policies para Clients
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY clients_select_policy ON clients
  FOR SELECT
  USING (
    company_id = current_setting('app.company_id')::uuid
  );

CREATE POLICY clients_insert_policy ON clients
  FOR INSERT
  WITH CHECK (
    company_id = current_setting('app.company_id')::uuid
  );

CREATE POLICY clients_update_policy ON clients
  FOR UPDATE
  USING (
    company_id = current_setting('app.company_id')::uuid
  )
  WITH CHECK (
    company_id = current_setting('app.company_id')::uuid
  );

CREATE POLICY clients_delete_policy ON clients
  FOR DELETE
  USING (
    company_id = current_setting('app.company_id')::uuid
  );

-- ====== RLS Policies para Deals
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY deals_select_policy ON deals
  FOR SELECT
  USING (
    company_id = current_setting('app.company_id')::uuid
  );

CREATE POLICY deals_insert_policy ON deals
  FOR INSERT
  WITH CHECK (
    company_id = current_setting('app.company_id')::uuid
  );

CREATE POLICY deals_update_policy ON deals
  FOR UPDATE
  USING (
    company_id = current_setting('app.company_id')::uuid
  )
  WITH CHECK (
    company_id = current_setting('app.company_id')::uuid
  );

CREATE POLICY deals_delete_policy ON deals
  FOR DELETE
  USING (
    company_id = current_setting('app.company_id')::uuid
  );

-- ====== RLS Policies para Policies
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY policies_select_policy ON policies
  FOR SELECT
  USING (
    company_id = current_setting('app.company_id')::uuid
  );

CREATE POLICY policies_insert_policy ON policies
  FOR INSERT
  WITH CHECK (
    company_id = current_setting('app.company_id')::uuid
  );

CREATE POLICY policies_update_policy ON policies
  FOR UPDATE
  USING (
    company_id = current_setting('app.company_id')::uuid
  )
  WITH CHECK (
    company_id = current_setting('app.company_id')::uuid
  );

-- ====== RLS para Audit Logs (SuperAdmin + own company records)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_select_policy ON audit_logs
  FOR SELECT
  USING (
    current_setting('app.role', true) = 'super_admin' OR
    company_id = current_setting('app.company_id')::uuid
  );

CREATE POLICY audit_logs_insert_policy ON audit_logs
  FOR INSERT
  WITH CHECK (
    company_id = current_setting('app.company_id')::uuid
  );

-- Audit logs nunca podem ser atualizados ou deletados por usuários
-- (apenas sistema pode, via application code checks)

-- ====== RLS para Tasks
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tasks_select_policy ON tasks
  FOR SELECT
  USING (
    company_id = current_setting('app.company_id')::uuid
  );

CREATE POLICY tasks_insert_policy ON tasks
  FOR INSERT
  WITH CHECK (
    company_id = current_setting('app.company_id')::uuid
  );

CREATE POLICY tasks_update_policy ON tasks
  FOR UPDATE
  USING (
    company_id = current_setting('app.company_id')::uuid
  )
  WITH CHECK (
    company_id = current_setting('app.company_id')::uuid
  );

-- ====== RLS para Claims
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY claims_select_policy ON claims
  FOR SELECT
  USING (
    company_id = current_setting('app.company_id')::uuid
  );

CREATE POLICY claims_insert_policy ON claims
  FOR INSERT
  WITH CHECK (
    company_id = current_setting('app.company_id')::uuid
  );

CREATE POLICY claims_update_policy ON claims
  FOR UPDATE
  USING (
    company_id = current_setting('app.company_id')::uuid
  )
  WITH CHECK (
    company_id = current_setting('app.company_id')::uuid
  );

-- ====== RLS para Documents
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY documents_select_policy ON documents
  FOR SELECT
  USING (
    company_id = current_setting('app.company_id')::uuid
  );

CREATE POLICY documents_insert_policy ON documents
  FOR INSERT
  WITH CHECK (
    company_id = current_setting('app.company_id')::uuid
  );

CREATE POLICY documents_delete_policy ON documents
  FOR DELETE
  USING (
    company_id = current_setting('app.company_id')::uuid
  );

-- ========== PARTE 4: GRANT Permissions to app_user ==========

-- Tabelas de plataforma (SuperAdmin only, não granto)
-- Tabelas operacionais: granto SELECT, INSERT, UPDATE, DELETE
GRANT SELECT, INSERT, UPDATE, DELETE ON clients TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON deals TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON policies TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON claims TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON documents TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON notes TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON timeline_events TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON health_requests TO app_user;

-- Apenas INSERT em audit_logs
GRANT INSERT ON audit_logs TO app_user;
GRANT SELECT ON audit_logs TO app_user;

-- Sequence access para autoincrement
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- ========== PARTE 5: Test RLS (Manual verification) ==========
-- Depois de aplicar, teste com:
-- SET app.company_id = 'test-company-id-1';
-- SELECT * FROM clients;
-- SET app.company_id = 'test-company-id-2';
-- SELECT * FROM clients; -- Deve retornar 0 linhas

COMMIT;

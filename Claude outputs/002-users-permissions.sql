-- FASE 0: Migration 002 - Users & Permissions
-- Executar DEPOIS de 001-platform-tables.sql

-- ====== ROLES (Papéis no sistema)
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE, -- NULL = role global (super_admin)
  name VARCHAR(100) NOT NULL,
  description TEXT,
  level INT DEFAULT 0, -- 0=super_admin, 1=company_admin, 2=manager, 3=user
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, name)
);

CREATE INDEX idx_roles_company_id ON roles(company_id);
CREATE INDEX idx_roles_level ON roles(level);

-- ====== PERMISSIONS (Permissões granulares)
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(100) NOT NULL UNIQUE, -- can_create_clients, can_edit_deals, can_view_reports, etc
  description TEXT,
  resource VARCHAR(100), -- clients, deals, policies, reports
  action VARCHAR(50), -- create, read, update, delete, export
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO permissions (code, description, resource, action) VALUES
('can_create_clients', 'Criar novos clientes', 'clients', 'create'),
('can_edit_clients', 'Editar clientes', 'clients', 'update'),
('can_delete_clients', 'Deletar clientes', 'clients', 'delete'),
('can_view_clients', 'Visualizar clientes', 'clients', 'read'),
('can_export_clients', 'Exportar clientes', 'clients', 'export'),

('can_create_deals', 'Criar negócios', 'deals', 'create'),
('can_edit_deals', 'Editar negócios', 'deals', 'update'),
('can_delete_deals', 'Deletar negócios', 'deals', 'delete'),
('can_view_deals', 'Visualizar negócios', 'deals', 'read'),
('can_export_deals', 'Exportar negócios', 'deals', 'export'),

('can_create_policies', 'Criar apólices', 'policies', 'create'),
('can_edit_policies', 'Editar apólices', 'policies', 'update'),
('can_delete_policies', 'Deletar apólices', 'policies', 'delete'),
('can_view_policies', 'Visualizar apólices', 'policies', 'read'),
('can_export_policies', 'Exportar apólices', 'policies', 'export'),

('can_create_claims', 'Criar sinistros', 'claims', 'create'),
('can_edit_claims', 'Editar sinistros', 'claims', 'update'),
('can_view_claims', 'Visualizar sinistros', 'claims', 'read'),

('can_create_health_requests', 'Criar requisições de saúde', 'health_requests', 'create'),
('can_view_health_requests', 'Visualizar requisições de saúde', 'health_requests', 'read'),

('can_view_reports', 'Visualizar relatórios', 'reports', 'read'),
('can_export_reports', 'Exportar relatórios', 'reports', 'export'),

('can_manage_users', 'Gerenciar usuários', 'users', 'update'),
('can_manage_roles', 'Gerenciar papéis', 'roles', 'update'),
('can_manage_subscription', 'Gerenciar assinatura', 'subscription', 'update'),
('can_view_audit_logs', 'Visualizar audit logs', 'audit_logs', 'read');

-- ====== ROLE_PERMISSIONS (Muitos-para-muitos)
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(role_id, permission_id)
);

CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission_id ON role_permissions(permission_id);

-- ====== USERS (Usuários do sistema)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL, -- bcrypt hash
  full_name VARCHAR(255),
  phone VARCHAR(20),
  role_id UUID REFERENCES roles(id),
  status VARCHAR(50) DEFAULT 'active', -- active, inactive, suspended
  last_login TIMESTAMP,
  login_attempts INT DEFAULT 0,
  locked_until TIMESTAMP, -- Bloqueado até essa hora (brute force)
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  deleted_by UUID,
  UNIQUE(company_id, email)
);

CREATE INDEX idx_users_company_id ON users(company_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_role_id ON users(role_id);

-- ====== USER_PERMISSIONS (Permissões granulares por usuário)
CREATE TABLE user_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, permission_id)
);

CREATE INDEX idx_user_permissions_user_id ON user_permissions(user_id);

-- ====== SESSIONS (Controle de sessões por dispositivo)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  refresh_token_hash VARCHAR(255) NOT NULL, -- SHA-256(refresh_token)
  refresh_token_family VARCHAR(255), -- Para detectar theft (rotação)
  device_name VARCHAR(255), -- "Chrome on Windows", "Safari on iOS"
  ip_address VARCHAR(45),
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  last_used_at TIMESTAMP,
  revoked_at TIMESTAMP,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_company_id ON sessions(company_id);
CREATE INDEX idx_sessions_refresh_token_hash ON sessions(refresh_token_hash);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- ====== PASSWORD_RESETS (Tokens de reset de senha)
CREATE TABLE password_resets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE, -- SHA-256(token)
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  ip_address VARCHAR(45),
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_password_resets_user_id ON password_resets(user_id);
CREATE INDEX idx_password_resets_token_hash ON password_resets(token_hash);

-- ====== TEAMS (Organização dentro da empresa)
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  UNIQUE(company_id, name)
);

CREATE INDEX idx_teams_company_id ON teams(company_id);

-- ====== TEAM_MEMBERS (Membros de times)
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_in_team VARCHAR(100), -- owner, manager, member
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, user_id)
);

CREATE INDEX idx_team_members_team_id ON team_members(team_id);
CREATE INDEX idx_team_members_user_id ON team_members(user_id);

-- ====== Enable RLS
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

COMMIT;

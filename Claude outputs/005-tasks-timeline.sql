-- FASE 0: Migration 005 - Tasks & Timeline
-- Executar DEPOIS de 004-products-policies.sql

-- ====== TASKS (Tarefas/lembretes)
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  assigned_to_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT,
  devido_em DATE,
  completado_em TIMESTAMP,
  prioridade VARCHAR(50) DEFAULT 'media', -- baixa, media, alta, critica
  tipo VARCHAR(50), -- follow_up, remindeer, call, email, meeting
  recurso_tipo VARCHAR(100), -- clients, deals, policies
  recurso_id UUID,
  status VARCHAR(50) DEFAULT 'open', -- open, completed, cancelled
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tasks_company_id ON tasks(company_id);
CREATE INDEX idx_tasks_assigned_to_id ON tasks(assigned_to_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_devido_em ON tasks(devido_em);
CREATE INDEX idx_tasks_recurso ON tasks(recurso_tipo, recurso_id);

-- ====== TIMELINE_EVENTS (Histórico de eventos para usuário)
CREATE TABLE timeline_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recurso_tipo VARCHAR(100) NOT NULL, -- clients, deals, policies, claims
  recurso_id UUID NOT NULL,
  acao VARCHAR(100) NOT NULL, -- created, updated, moved, commented, etc
  descricao TEXT,
  dados_anteriores JSONB,
  dados_novos JSONB,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_timeline_events_company_id ON timeline_events(company_id);
CREATE INDEX idx_timeline_events_recurso ON timeline_events(recurso_tipo, recurso_id);
CREATE INDEX idx_timeline_events_criado_em ON timeline_events(criado_em);

-- ====== DOCUMENTS (Armazenamento de documentos)
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  uploaded_by_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recurso_tipo VARCHAR(100) NOT NULL, -- clients, deals, policies
  recurso_id UUID NOT NULL,
  nome_original VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100),
  tamanho_bytes INT,
  storage_key VARCHAR(500), -- Chave no S3/R2
  storage_url TEXT, -- URL assinada (expira em 1h)
  checksum_md5 VARCHAR(32), -- Para detectar duplicatas
  scanned_for_malware BOOLEAN DEFAULT false,
  malware_found BOOLEAN DEFAULT false,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deletado_em TIMESTAMP,
  deletado_por UUID
);

CREATE INDEX idx_documents_company_id ON documents(company_id);
CREATE INDEX idx_documents_recurso ON documents(recurso_tipo, recurso_id);
CREATE INDEX idx_documents_storage_key ON documents(storage_key);

-- ====== NOTES (Notas/comentários)
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recurso_tipo VARCHAR(100) NOT NULL, -- clients, deals, policies
  recurso_id UUID NOT NULL,
  conteudo TEXT NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deletado_em TIMESTAMP
);

CREATE INDEX idx_notes_company_id ON notes(company_id);
CREATE INDEX idx_notes_recurso ON notes(recurso_tipo, recurso_id);
CREATE INDEX idx_notes_criado_em ON notes(criado_em);

-- ====== Enable RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

COMMIT;

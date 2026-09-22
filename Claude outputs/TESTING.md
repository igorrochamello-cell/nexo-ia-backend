# PipeNexo Testing Guide

Complete testing procedures for FASE 0 security foundation.

## 🧪 Test Categories

1. **Unit Tests** - Individual functions and services
2. **Integration Tests** - API endpoints with database
3. **Security Tests** - Authentication, authorization, isolation
4. **Load Tests** - Performance under stress
5. **Manual Tests** - Browser-based frontend testing

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Run all tests
npm run test

# Run tests in watch mode (auto-rerun on file changes)
npm run test:watch

# Run specific test file
npm run test -- security.test.ts

# Run with coverage report
npm run test -- --coverage
```

## 📝 Unit Tests (24 Total)

Organized in `src/__tests__/security.test.ts`

### Category 1: Authentication (5 tests)

```bash
✓ Login with valid email and password
  - Tests: Email validation, password verification, token generation
  - Expected: Returns accessToken, refreshToken, userId, companyId

✓ Login with invalid password
  - Tests: Wrong password rejection
  - Expected: 401 Unauthorized + "Invalid email or password"

✓ Account lockout after 5 failed login attempts
  - Tests: Incremental lockout counter, 15-minute lock duration
  - Expected: After 5 attempts → "Account locked for 15 minutes"

✓ Refresh token provides new access token
  - Tests: Token rotation, new expiration
  - Expected: Returns fresh accessToken with 15-minute expiry

✓ Reusing refresh token detects theft
  - Tests: Family tracking, reuse detection
  - Expected: 403 Forbidden + "Possible token theft detected"
```

**Run authentication tests:**
```bash
npm run test -- --grep "Authentication"
```

### Category 2: Tenant Isolation (5 tests)

```bash
✓ Cannot read other company's data (IDOR protection)
  - Setup: Login as Company 1, try to access Company 2 client
  - Expected: 403 Forbidden + RLS enforcement log

✓ RLS policy blocks unauthorized access at database
  - Setup: Attempt to SELECT with wrong company_id in RLS context
  - Expected: Query returns 0 rows

✓ Injecting company_id in request body is rejected
  - Setup: POST /clients with company_id override in JSON
  - Expected: 400 Bad Request + "company_id cannot be provided"

✓ List endpoints filtered by company_id
  - Setup: Create 2 clients in Company 1, login as Company 1
  - Expected: GET /clients returns 2 rows (not from other companies)

✓ DELETE request isolated by company
  - Setup: Try to delete Company 2 client using Company 1 token
  - Expected: 404 Not Found (client doesn't exist in Company 1's view)
```

**Run isolation tests:**
```bash
npm run test -- --grep "Tenant Isolation"
```

### Category 3: Permissions (4 tests)

```bash
✓ Deny access without required permission
  - Setup: User with 'read' permission attempts 'delete'
  - Expected: 403 Forbidden + "Missing permission: clients.delete"

✓ Role-based permission checks
  - Setup: Admin has all permissions, Manager has subset
  - Expected: Admin → 200, Manager → 403 on admin-only action

✓ Soft delete enforces audit trail
  - Setup: DELETE /clients/:id
  - Expected: deleted_at set, original data preserved, entry in audit_logs

✓ Audit trail maintains before/after values
  - Setup: UPDATE client, check audit_logs entry
  - Expected: dados_anteriores and dados_novos both populated
```

**Run permission tests:**
```bash
npm run test -- --grep "Permissions"
```

### Category 4: Web Security (5 tests)

```bash
✓ Security headers present in responses
  - Expected headers:
    - X-Content-Type-Options: nosniff
    - X-Frame-Options: DENY
    - Strict-Transport-Security: max-age=31536000
    - Content-Security-Policy: default-src 'self'

✓ XSS payload in request is escaped/rejected
  - Setup: POST /clients with name: "<script>alert('XSS')</script>"
  - Expected: 400 Bad Request OR XSS content HTML-encoded in response

✓ Email validation rejects malformed addresses
  - Setup: POST /auth/login with email: "not-an-email"
  - Expected: 400 Bad Request + "Invalid email format"

✓ CORS enforces same-origin policy
  - Setup: Request from different origin
  - Expected: No Access-Control-Allow-Origin header OR specific origin only

✓ HSTS header forces HTTPS
  - Expected: Strict-Transport-Security: max-age=31536000; includeSubDomains
```

**Run security tests:**
```bash
npm run test -- --grep "Web Security"
```

### Category 5: Rate Limiting (3 tests)

```bash
✓ Login rate limit: 5 attempts per 15 minutes
  - Setup: Make 6 consecutive login requests
  - Expected: 6th request → 429 Too Many Requests

✓ Global rate limit: 100 requests per 15 minutes
  - Setup: Make 101 rapid requests to any endpoint
  - Expected: 101st request → 429 Too Many Requests

✓ Rate limit counter resets after window expires
  - Setup: Make 5 requests, wait 16 minutes, make 1 more
  - Expected: 6th request → 200 OK (window expired)
```

**Run rate limiting tests:**
```bash
npm run test -- --grep "Rate Limiting"
```

### Category 6: Audit Logging (2 tests)

```bash
✓ CREATE action logged with user and timestamp
  - Setup: POST /clients, check audit_logs
  - Expected: Entry with acao=created, user_id, timestamp, dados_novos

✓ UPDATE action logs before and after values
  - Setup: PUT /clients/:id, check audit_logs
  - Expected: Entry with dados_anteriores and dados_novos
```

**Run audit tests:**
```bash
npm run test -- --grep "Audit Logging"
```

## 📊 Test Coverage Report

```bash
npm run test -- --coverage
```

Expected output:
```
File                    % Statements % Branch % Function  % Lines
─────────────────────────────────────────────────────────────────
All files                    85.2     82.1    87.3      86.5
  src/
    index.ts                 92.1     88.0    94.2      92.3
    services/auth.ts         88.5     85.3    89.1      88.7
    middleware/auth.ts       79.2     75.0    81.2      80.3
    routes/clients-full.ts   82.3     78.5    84.1      83.2
    ...
```

Target: **>80% coverage** on critical paths

## 🔒 Manual Security Testing

### 1. Test IDOR (Insecure Direct Object Reference)

```bash
# Login as Company 1
TOKEN1=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pipenexo.test","password":"TestPassword123!"}' \
  | jq -r '.accessToken')

# Login as Company 2
TOKEN2=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@seguros-brasil.test","password":"TestPassword123!"}' \
  | jq -r '.accessToken')

# Get Company 1 client ID
CLIENT1=$(curl -s -H "Authorization: Bearer $TOKEN1" \
  http://localhost:3001/api/clients | jq -r '.data[0].id')

# Try to access Company 1 client with Company 2 token
curl -H "Authorization: Bearer $TOKEN2" \
  http://localhost:3001/api/clients/$CLIENT1

# Expected: 403 Forbidden
```

### 2. Test Token Theft Detection

```bash
# Get initial refresh token
RESPONSE=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pipenexo.test","password":"TestPassword123!"}')

REFRESH_TOKEN=$(echo $RESPONSE | jq -r '.refreshToken')

# Reuse the same refresh token (first use - should work)
RESPONSE2=$(curl -s -X POST http://localhost:3001/api/auth/refresh \
  -H "Authorization: Bearer $REFRESH_TOKEN")

echo "First refresh: $RESPONSE2"

# Reuse the OLD refresh token again (should fail)
RESPONSE3=$(curl -s -X POST http://localhost:3001/api/auth/refresh \
  -H "Authorization: Bearer $REFRESH_TOKEN")

echo "Second refresh: $RESPONSE3"
# Expected: 403 Forbidden + "Possible token theft detected"
```

### 3. Test Rate Limiting

```bash
# Make 6 login attempts rapidly
for i in {1..6}; do
  echo "Attempt $i:"
  curl -s -X POST http://localhost:3001/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@pipenexo.test","password":"WrongPassword"}' \
    | jq '.message'
done

# Attempt 6 should show: "Account locked for 15 minutes"
```

### 4. Test SQL Injection Prevention

```bash
# Try SQL injection in search parameter
curl -s "http://localhost:3001/api/clients?search='; DROP TABLE clients; --" \
  -H "Authorization: Bearer $TOKEN"

# Expected: No error, query safely escaped, returns 0 results
```

### 5. Test XSS Prevention

```bash
# Try XSS in client name
curl -s -X POST http://localhost:3001/api/clients \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "nomeCompleto": "<img src=x onerror=alert(\"XSS\")>",
    "email": "test@test.com",
    "cpfCnpj": "12345678901234"
  }' | jq '.nomeCompleto'

# Expected: HTML entities escaped: "&lt;img src=x ...&gt;"
```

## 🌐 Frontend Testing (Browser)

### Setup

```bash
npm run dev
# Server runs on http://localhost:3001
```

### Test Scenario 1: Login Flow

1. Open http://localhost:3001/login.html
2. Enter: admin@pipenexo.test / TestPassword123!
3. Expected: Redirects to dashboard
4. Check browser console: No errors, API calls logged

### Test Scenario 2: Tenant Isolation

1. Login as admin@pipenexo.test (Company 1)
2. Open DevTools → Network tab
3. Click "Clientes" tab
4. Verify: Response shows 5 clients
5. Open DevTools → Application → LocalStorage
6. Copy accessToken
7. Open Incognito window, go to http://localhost:3001/login.html
8. Open DevTools console, run:
   ```javascript
   const api = new ApiService();
   api.accessToken = "<paste-company1-token>";
   api.request('GET', '/clients');
   ```
9. Expected: 403 Forbidden (RLS enforcement)

### Test Scenario 3: Auto Token Refresh

1. Login and open DevTools → Network tab
2. Make any API request
3. Wait 15+ minutes (or mock time)
4. Make another API request
5. Expected: Automatic refresh token call, then API request succeeds
6. Check Storage: accessToken changed, refreshToken rotated

### Test Scenario 4: Error Handling

1. Start server
2. Stop server (simulate offline)
3. On dashboard, click "Clientes"
4. Expected: Error message "Erro ao carregar clientes"
5. Restart server
6. Click retry or page reload
7. Expected: Loads successfully

### Test Scenario 5: Permission Denied

1. Login as user@pipenexo.test (User role, no delete permission)
2. Click "Clientes"
3. Click "Deletar" on any client
4. Expected: Either button disabled OR error message "Acesso negado"

## ⚡ Load Testing

### Setup

```bash
npm install -g artillery
```

### Load Test Configuration

Create `load-test.yml`:

```yaml
config:
  target: "http://localhost:3001"
  phases:
    - duration: 60
      arrivalRate: 10
  processor: "./load-test-processor.js"

scenarios:
  - name: "CRM Usage Pattern"
    flow:
      - post:
          url: "/api/auth/login"
          json:
            email: "admin@pipenexo.test"
            password: "TestPassword123!"
          capture:
            json: "$.accessToken"
            as: "token"
      - get:
          url: "/api/clients"
          headers:
            Authorization: "Bearer {{ token }}"
      - get:
          url: "/api/deals"
          headers:
            Authorization: "Bearer {{ token }}"
      - get:
          url: "/api/policies"
          headers:
            Authorization: "Bearer {{ token }}"
      - get:
          url: "/api/dashboard"
          headers:
            Authorization: "Bearer {{ token }}"
```

### Run Load Test

```bash
# Run for 60 seconds, 10 users per second
artillery run load-test.yml

# Expected output:
# Scenario: CRM Usage Pattern
#   ├ 0 errors
#   ├ Average response time: 120ms
#   ├ P95: 350ms
#   ├ P99: 800ms
```

### Stress Test (Find Breaking Point)

```yaml
config:
  target: "http://localhost:3001"
  phases:
    - duration: 60
      arrivalRate: 1
    - duration: 60
      arrivalRate: 5
    - duration: 60
      arrivalRate: 10
    - duration: 60
      arrivalRate: 20
    - duration: 60
      arrivalRate: 50
```

## 📈 Performance Benchmarks

### Acceptable Response Times

| Endpoint | P50 | P95 | P99 |
|----------|-----|-----|-----|
| POST /auth/login | 150ms | 400ms | 800ms |
| GET /clients | 50ms | 200ms | 400ms |
| POST /clients | 100ms | 300ms | 600ms |
| GET /dashboard | 200ms | 600ms | 1200ms |
| GET /policies | 75ms | 250ms | 500ms |

### Database Performance Targets

- **Login query**: <50ms
- **List clients**: <100ms
- **Create client**: <150ms
- **Search**: <200ms (full-text)
- **Dashboard aggregation**: <500ms

## 🔍 Debugging Tips

### Enable Debug Logging

```bash
DEBUG=* npm run dev
```

### Check Database Queries

```bash
# In PostgreSQL
SET log_statement = 'all';
SET log_duration = on;

# Then run test and check logs
```

### Monitor Connections

```bash
# Check active connections
psql -c "SELECT count(*) FROM pg_stat_activity;"

# Kill long-running queries
psql -c "SELECT pid, query, query_start FROM pg_stat_activity WHERE query_start < NOW() - INTERVAL '5 minutes';"
```

### Clear Cache Between Tests

```bash
# Clear Redis
redis-cli FLUSHALL

# Truncate audit logs
psql pipenexo -c "TRUNCATE audit_logs RESTART IDENTITY CASCADE;"
```

## ✅ Pre-Deployment Test Checklist

- [ ] All 24 security tests passing
- [ ] No console errors in browser
- [ ] Load test: <800ms P99 latency
- [ ] IDOR: Cannot access other company's data
- [ ] Token theft: Detected and rejected
- [ ] Rate limit: Working correctly
- [ ] XSS: Payload escaped
- [ ] SQL injection: Safely handled
- [ ] CORS: Properly configured
- [ ] Database backups: Automated and tested
- [ ] Error handling: Graceful failures
- [ ] Logging: Production-ready format
- [ ] Email (if enabled): Test email sending
- [ ] File uploads (if enabled): Test upload/download

## 📞 Troubleshooting Test Failures

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common test issues.

## 📚 Related Files

- [README.md](./README.md) - Project overview
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Production deployment
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Common issues

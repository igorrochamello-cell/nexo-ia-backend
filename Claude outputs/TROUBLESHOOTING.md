# PipeNexo Troubleshooting Guide

Common issues and solutions for FASE 0 implementation.

## 🔧 Database Issues

### Problem: "Connection refused" on localhost:5432

**Symptoms:**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solutions:**

1. **Start PostgreSQL with Docker:**
   ```bash
   docker-compose up -d postgres
   docker-compose logs postgres  # Check logs
   ```

2. **Check PostgreSQL is running:**
   ```bash
   # macOS
   brew services list | grep postgres
   
   # Linux
   sudo systemctl status postgresql
   
   # Windows
   Get-Service -Name postgresql-*
   ```

3. **Verify connection string:**
   ```bash
   # Should be in .env:
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pipenexo
   ```

4. **Test connection:**
   ```bash
   psql postgresql://postgres:postgres@localhost:5432/pipenexo -c "SELECT version();"
   ```

---

### Problem: "Database does not exist"

**Symptoms:**
```
Error: database "pipenexo" does not exist
```

**Solutions:**

1. **Create database:**
   ```bash
   createdb pipenexo
   ```

2. **Or via Docker:**
   ```bash
   docker exec pipenexo-postgres createdb -U postgres pipenexo
   ```

3. **Run migrations:**
   ```bash
   for i in {1..8}; do
     psql $DATABASE_URL < migrations/00$i-*.sql
   done
   ```

---

### Problem: "Password authentication failed"

**Symptoms:**
```
Error: password authentication failed for user "postgres"
```

**Solutions:**

1. **Check credentials in .env:**
   ```bash
   cat .env | grep DATABASE_URL
   ```

2. **With Docker, use default credentials:**
   ```env
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pipenexo
   ```

3. **Reset PostgreSQL password:**
   ```bash
   # Local PostgreSQL
   sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
   ```

4. **Stop Docker and restart:**
   ```bash
   docker-compose down -v  # Remove volumes
   docker-compose up -d
   ```

---

### Problem: "Relation does not exist"

**Symptoms:**
```
Error: relation "clients" does not exist at character 123
```

**Solutions:**

1. **Check migrations ran successfully:**
   ```bash
   psql $DATABASE_URL -c "\dt"  # List all tables
   ```

2. **Verify all 8 migrations:**
   ```bash
   for i in {1..8}; do
     echo "Migration 00$i:"
     psql $DATABASE_URL -c "SELECT COUNT(*) FROM information_schema.tables 
       WHERE table_schema = 'public' AND table_name LIKE '00$i%';"
   done
   ```

3. **Re-run migrations in correct order:**
   ```bash
   # Drop all tables first (CAREFUL - data loss!)
   psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
   
   # Re-run all migrations
   for i in {1..8}; do
     psql $DATABASE_URL < migrations/00$i-*.sql
     echo "✅ Migration 00$i completed"
   done
   ```

---

### Problem: "Trigger function does not exist"

**Symptoms:**
```
Error: function "update_atualizado_em" does not exist
```

**Solutions:**

1. **Ensure migration 008 ran:**
   ```bash
   psql $DATABASE_URL -c "SELECT proname FROM pg_proc 
     WHERE proname LIKE '%atualizado%';"
   ```

2. **Re-run migration 008:**
   ```bash
   psql $DATABASE_URL < migrations/008-triggers-rls.sql
   ```

---

## 🔑 Authentication Issues

### Problem: "Invalid email or password"

**Symptoms:**
```json
{"message": "Invalid email or password", "status": 401}
```

**Solutions:**

1. **Verify test data was seeded:**
   ```bash
   psql $DATABASE_URL -c "SELECT email, ativo FROM users LIMIT 5;"
   ```

2. **Seed database if empty:**
   ```bash
   npm run seed
   ```

3. **Check correct credentials:**
   ```
   Email: admin@pipenexo.test
   Password: TestPassword123!
   ```

4. **Verify password hashing works:**
   ```bash
   # In test
   const bcrypt = require('bcryptjs');
   bcrypt.compare('TestPassword123!', 
     '$2a$10$...')  // Hashed password from DB
   ```

---

### Problem: "Account locked for 15 minutes"

**Symptoms:**
```json
{"message": "Account locked for 15 minutes", "status": 403}
```

**Solutions:**

1. **Wait 15 minutes** (or modify code for testing)

2. **Or reset lockout in database:**
   ```bash
   psql $DATABASE_URL -c "
     UPDATE users SET 
       failed_login_attempts = 0, 
       account_locked_until = NULL
     WHERE email = 'admin@pipenexo.test';"
   ```

3. **Or manually clear for testing:**
   ```sql
   UPDATE users SET failed_login_attempts = 0, account_locked_until = NULL WHERE email = $1;
   ```

---

### Problem: "Invalid JWT" or "Token expired"

**Symptoms:**
```json
{"message": "Invalid token", "status": 401}
```

**Solutions:**

1. **Check token format:**
   ```bash
   # Token should be: Authorization: Bearer eyJhbGciOi...
   # NOT: Authorization: eyJhbGciOi...
   ```

2. **Verify JWT_SECRET in .env:**
   ```bash
   # Same secret used for signing and verifying
   JWT_SECRET=your-32-character-secret-key-here!
   ```

3. **Check token expiration:**
   ```javascript
   // Decode token (don't verify) to see expiration
   const decoded = require('jsonwebtoken').decode(token);
   console.log(decoded.exp);  // Expiration timestamp
   console.log(new Date(decoded.exp * 1000));  // Readable date
   ```

4. **Refresh the token:**
   ```bash
   curl -X POST http://localhost:3001/api/auth/refresh \
     -H "Authorization: Bearer YOUR_REFRESH_TOKEN"
   ```

---

### Problem: "Token theft detected"

**Symptoms:**
```json
{"message": "Possible token theft detected", "status": 403}
```

**Solutions:**

1. **This is expected behavior** - it means someone reused an old refresh token

2. **Get a new token:**
   ```bash
   curl -X POST http://localhost:3001/api/auth/login \
     -d '{"email":"admin@pipenexo.test","password":"TestPassword123!"}'
   ```

3. **Use new refresh token for subsequent refreshes**

---

## 🚫 Authorization Issues

### Problem: "Missing permission: X"

**Symptoms:**
```json
{"message": "Missing permission: clients.delete", "status": 403}
```

**Solutions:**

1. **Check user's role permissions:**
   ```bash
   psql $DATABASE_URL -c "
     SELECT r.name, p.name 
     FROM users u
     JOIN roles r ON u.role_id = r.id
     JOIN role_permissions rp ON r.id = rp.role_id
     JOIN permissions p ON rp.permission_id = p.id
     WHERE u.email = 'user@pipenexo.test';"
   ```

2. **Add missing permission to role:**
   ```sql
   INSERT INTO role_permissions (role_id, permission_id, company_id)
   SELECT r.id, p.id, r.company_id
   FROM roles r, permissions p
   WHERE r.name = 'User' 
     AND p.name = 'clients.delete'
     AND r.company_id = p.company_id;
   ```

3. **Or use admin account:**
   ```bash
   # Admin role has all permissions
   curl -H "Authorization: Bearer ADMIN_TOKEN" \
     http://localhost:3001/api/clients/123
   ```

---

### Problem: "IDOR: Cannot access other company's data"

**Expected behavior** - verifies tenant isolation works

**To test:**
1. Get token from Company 1
2. Try to access Company 2's data
3. Should return: 403 Forbidden or 404 Not Found

---

## 🌐 CORS Issues

### Problem: "Access to XMLHttpRequest blocked by CORS policy"

**Symptoms:**
```
Access to XMLHttpRequest at 'http://localhost:3001/api/clients' from origin 'http://localhost:3000' has been blocked by CORS policy
```

**Solutions:**

1. **Check CORS configuration in src/index.ts:**
   ```typescript
   app.use(cors({
     origin: process.env.FRONTEND_URL || 'http://localhost:3000',
     credentials: true,
   }));
   ```

2. **Update FRONTEND_URL in .env:**
   ```env
   FRONTEND_URL=http://localhost:3000
   ```

3. **For production, whitelist domain:**
   ```env
   FRONTEND_URL=https://pipenexo.vercel.app
   ```

4. **Test CORS:**
   ```bash
   curl -H "Origin: http://localhost:3000" \
     -H "Access-Control-Request-Method: POST" \
     -X OPTIONS http://localhost:3001/api/auth/login -v
   ```

---

## 📝 Rate Limiting Issues

### Problem: "429 Too Many Requests"

**Symptoms:**
```json
{"message": "Too many requests, please try again later", "status": 429}
```

**Solutions:**

1. **Wait for rate limit window to expire**
   - Login: 5 attempts per 15 minutes
   - Global: 100 requests per 15 minutes

2. **Clear rate limit in Redis (if using):**
   ```bash
   redis-cli
   > KEYS "*rate-limit*"
   > DEL key1 key2 key3
   > QUIT
   ```

3. **For testing, reduce limits in .env:**
   ```env
   RATE_LIMIT_LOGIN_ATTEMPTS=100  # Much higher for testing
   RATE_LIMIT_GLOBAL_MAX=10000
   ```

---

## 🧪 Test Failures

### Problem: "Tests timing out"

**Symptoms:**
```
Timeout of 5000ms exceeded
```

**Solutions:**

1. **Increase timeout in test:**
   ```typescript
   it('should do something', async () => {
     // ... test code
   }, 10000);  // 10 second timeout
   ```

2. **Ensure database is running:**
   ```bash
   docker-compose ps | grep postgres
   ```

3. **Check database performance:**
   ```bash
   psql $DATABASE_URL -c "SELECT version();"
   ```

---

### Problem: "Tests fail with 'relation does not exist'"

**Symptoms:**
```
Error: relation "clients" does not exist
```

**Solutions:**

1. **Ensure test database exists:**
   ```bash
   createdb pipenexo_test
   ```

2. **Run migrations on test database:**
   ```bash
   psql pipenexo_test < migrations/001-platform-tables.sql
   psql pipenexo_test < migrations/002-users-permissions.sql
   # ... all 8 migrations
   ```

3. **Set TEST_DATABASE_URL in .env:**
   ```env
   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pipenexo_test
   ```

4. **Or use in-memory database for tests** (if using)

---

### Problem: "Test data isolation - data from previous test leaks"

**Symptoms:**
```
Expected 5 clients but got 10 (from previous test)
```

**Solutions:**

1. **Clear database between tests:**
   ```typescript
   beforeEach(async () => {
     await db.delete(schema.clients);
     // Create fresh test data
   });
   ```

2. **Use test transactions (rollback after test):**
   ```typescript
   let transaction;
   
   beforeEach(() => {
     transaction = db.transaction();
   });
   
   afterEach(async () => {
     await transaction.rollback();
   });
   ```

3. **Use separate test database:**
   ```bash
   # Before tests
   createdb pipenexo_test_$$
   psql pipenexo_test_$$ < migrations/*.sql
   
   # Run tests
   TEST_DATABASE_URL=postgresql://...:5432/pipenexo_test_$$ npm run test
   
   # After tests
   dropdb pipenexo_test_$$
   ```

---

## 🚀 Server Issues

### Problem: Server won't start

**Symptoms:**
```
Error: listen EADDRINUSE :::3001
```

**Solutions:**

1. **Port already in use - kill process:**
   ```bash
   # macOS/Linux
   lsof -ti:3001 | xargs kill -9
   
   # Windows
   netstat -ano | findstr :3001
   taskkill /PID <PID> /F
   ```

2. **Use different port:**
   ```bash
   PORT=3002 npm run dev
   ```

3. **Check .env PORT setting:**
   ```env
   PORT=3001
   ```

---

### Problem: "Cannot find module '@/..'"

**Symptoms:**
```
Error: Cannot find module '@/db/schema'
```

**Solutions:**

1. **Check tsconfig.json path aliases:**
   ```json
   {
     "compilerOptions": {
       "paths": {
         "@/*": ["./src/*"]
       }
     }
   }
   ```

2. **Install tsx (TypeScript executor):**
   ```bash
   npm install -D tsx
   ```

3. **Use tsx to run:**
   ```bash
   npx tsx src/index.ts
   ```

---

### Problem: "ENOENT: no such file or directory, open '.env'"

**Symptoms:**
```
Error: ENOENT: no such file or directory, open '.env'
```

**Solutions:**

1. **Create .env from .env.example:**
   ```bash
   cp .env.example .env
   ```

2. **Fill in required values:**
   ```env
   DATABASE_URL=postgresql://...
   JWT_SECRET=your-32-character-secret
   ```

---

## 🌍 Frontend Issues

### Problem: "Cannot POST /api/auth/login" (404)

**Symptoms:**
```
404 Not Found
POST /api/auth/login
```

**Solutions:**

1. **Ensure backend server is running:**
   ```bash
   npm run dev
   ```

2. **Verify API_URL in frontend:**
   ```javascript
   // In api.js
   const api = new ApiService('http://localhost:3001/api');
   ```

3. **Check REACT_APP_API_URL env variable:**
   ```env
   REACT_APP_API_URL=http://localhost:3001/api
   ```

---

### Problem: "Blank page / white screen"

**Symptoms:**
- No error, just blank page

**Solutions:**

1. **Check browser console for errors (F12)**

2. **Ensure JavaScript is enabled**

3. **Check script tags in HTML:**
   ```html
   <script src="/js/api.js"></script>
   ```

4. **Verify file paths are correct:**
   ```bash
   ls -la public/js/api.js
   ls -la app/dashboard.html
   ```

5. **Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)**

---

### Problem: "localStorage is undefined"

**Symptoms:**
```
Uncaught TypeError: localStorage is undefined
```

**Solutions:**

1. **This happens in private/incognito mode** - expected behavior

2. **Or using Node.js without browser environment** - wrap in check:
   ```javascript
   if (typeof localStorage !== 'undefined') {
     localStorage.setItem('token', token);
   }
   ```

---

## 🔐 Security Test Failures

### Problem: "Security test: Cannot read other company data - FAILED"

**Expected behavior** - this test verifies tenant isolation works

**If failing:**

1. **Check RLS policies are enabled:**
   ```bash
   psql $DATABASE_URL -c "
     SELECT tablename FROM pg_tables 
     WHERE schemaname='public' LIMIT 1;" 
   # Then for each table:
   psql $DATABASE_URL -c "
     SELECT * FROM pg_policies 
     WHERE schemaname='public' AND tablename='clients';"
   ```

2. **Verify company_id extraction in middleware:**
   ```typescript
   // authMiddleware should extract company_id from JWT
   const companyId = decoded.sub.split(':')[1];
   ```

3. **Check RLS context is set:**
   ```typescript
   // Should be called before query
   await db.execute(sql`SET app.company_id = '${companyId}'::uuid`);
   ```

---

## 📊 Performance Issues

### Problem: Slow API responses (>1000ms)

**Symptoms:**
```
GET /api/clients took 2000ms
```

**Solutions:**

1. **Check database query performance:**
   ```bash
   # Enable slow query log
   psql $DATABASE_URL -c "SET log_min_duration_statement = 100;"
   
   # Run query and check logs
   ```

2. **Add indexes if missing:**
   ```sql
   CREATE INDEX idx_clients_company_id ON clients(company_id);
   CREATE INDEX idx_policies_company_id ON policies(company_id);
   ```

3. **Monitor database connections:**
   ```bash
   psql $DATABASE_URL -c "
     SELECT count(*), state 
     FROM pg_stat_activity 
     GROUP BY state;"
   ```

4. **Check connection pool settings:**
   ```env
   DB_POOL_MIN=2
   DB_POOL_MAX=10  # Adjust based on load
   ```

5. **Profile with Node.js:**
   ```bash
   node --prof src/index.ts
   # Run some requests
   # Ctrl+C to stop
   # node --prof-process isolate-*.log | head -50
   ```

---

## 📞 Getting Help

1. **Check logs:**
   ```bash
   # Backend logs
   tail -f logs/error.log
   tail -f logs/combined.log
   ```

2. **Enable debug mode:**
   ```bash
   DEBUG=* npm run dev
   ```

3. **Check database directly:**
   ```bash
   psql $DATABASE_URL
   # Then run queries to verify data
   ```

4. **Open GitHub issue with:**
   - Error message (full stack trace)
   - Steps to reproduce
   - Environment (OS, Node version, PostgreSQL version)
   - Relevant logs

---

## 🔗 Related Documentation

- [README.md](./README.md) - Project overview
- [TESTING.md](./TESTING.md) - Testing procedures
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Deployment guide

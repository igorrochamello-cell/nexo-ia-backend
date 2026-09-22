# PipeNexo Deployment Guide

Complete instructions for deploying PipeNexo to production on Vercel.

## 📋 Pre-Deployment Checklist

- [ ] All tests passing (`npm run test`)
- [ ] Environment variables configured
- [ ] Database migrations tested locally
- [ ] Security headers verified
- [ ] CORS properly configured
- [ ] Rate limiting tested under load
- [ ] Logging configured for production
- [ ] Error handling verified
- [ ] Refresh token rotation tested
- [ ] RLS policies verified

## 🚀 Deployment Steps

### 1. Prepare Production Build

```bash
# Build TypeScript
npm run build

# Verify bundle size
npm run analyze

# Run tests one final time
npm run test
```

### 2. Setup Vercel Project

#### Option A: Via Vercel CLI
```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod
```

#### Option B: Via GitHub Integration (Recommended)

1. **Push code to GitHub**
   ```bash
   git remote add origin https://github.com/igorrochamello/pipenexo
   git push -u origin main
   ```

2. **Connect to Vercel**
   - Go to https://vercel.com/new
   - Select "Import Git Repository"
   - Select your GitHub repo
   - Configure project settings

3. **Configure Environment Variables**
   In Vercel dashboard → Settings → Environment Variables:

   ```env
   # Database
   DATABASE_URL=postgresql://user:password@host:5432/pipenexo
   DB_POOL_MIN=2
   DB_POOL_MAX=10

   # JWT
   JWT_SECRET=<generate-strong-secret-32-chars-min>
   ACCESS_TOKEN_EXPIRY=900
   REFRESH_TOKEN_EXPIRY=604800

   # Server
   NODE_ENV=production
   PORT=3000
   LOG_LEVEL=info

   # Security
   RATE_LIMIT_LOGIN_ATTEMPTS=5
   RATE_LIMIT_LOGIN_WINDOW=900
   RATE_LIMIT_GLOBAL_WINDOW=900
   RATE_LIMIT_GLOBAL_MAX=100
   ACCOUNT_LOCKOUT_DURATION=900

   # Frontend
   REACT_APP_API_URL=https://pipenexo.vercel.app/api
   ```

4. **Click Deploy**
   Vercel will automatically:
   - Build the project
   - Run tests
   - Deploy to production
   - Provide a URL

### 3. Setup Production Database

#### Option A: Managed PostgreSQL Service

**Recommended providers:**
- **Neon** (Auto-scaling, branching) - https://neon.tech
- **AWS RDS** (Enterprise features)
- **DigitalOcean** (Simple, affordable)
- **Supabase** (PostgreSQL + extras)

**Example with Neon:**

1. Create account at https://neon.tech
2. Create new project
3. Copy connection string
4. Set as `DATABASE_URL` in Vercel environment variables
5. Run migrations:
   ```bash
   psql $DATABASE_URL < migrations/001-platform-tables.sql
   psql $DATABASE_URL < migrations/002-users-permissions.sql
   # ... run all 8 migrations
   ```

6. Seed production data (optional):
   ```bash
   DATABASE_URL=your_prod_url npm run seed
   ```

#### Option B: PostgreSQL Cluster

For enterprise deployments:
- Use AWS RDS with Multi-AZ
- Enable automated backups
- Configure automated failover
- Use read replicas for analytics
- Monitor with CloudWatch

### 4. Run Production Migrations

```bash
# Connect to production database
export DATABASE_URL="postgresql://user:password@host:5432/pipenexo"

# Run migrations in order (1-8)
for i in {1..8}; do
  psql $DATABASE_URL < migrations/00$i-*.sql
  echo "✅ Migration 00$i completed"
done
```

### 5. Setup SSL/TLS Certificate

Vercel automatically provides SSL certificate for `*.vercel.app` domains.

For custom domain (e.g., `pipenexo.com.br`):

1. **Add Custom Domain in Vercel**
   - Dashboard → Settings → Domains
   - Add `pipenexo.com.br`
   - Add `www.pipenexo.com.br`

2. **Update DNS Records**
   ```
   Type: CNAME
   Name: pipenexo
   Value: cname.vercel-dns.com
   
   Type: CNAME
   Name: www
   Value: cname.vercel-dns.com
   ```

3. **Verify Certificate**
   - Vercel automatically provisions SSL
   - Wait 5-10 minutes for propagation
   - Test: `curl -I https://pipenexo.com.br`

### 6. Configure Monitoring & Logging

#### Sentry (Error Tracking)

```bash
# Install Sentry
npm install @sentry/node

# Add to index.ts
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
```

In Vercel environment variables:
```
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project
```

#### LogRocket (Session Replay)

```bash
npm install logrocket

# Add to frontend (login.html, dashboard.html)
<script src="https://cdn.lr-in.com/LogRocket.min.js"></script>
<script>
  window.LogRocket && window.LogRocket.init('org/project');
</script>
```

#### Winston Logger Configuration

For production, logs should go to:
- CloudWatch (AWS)
- Stackdriver (GCP)
- Loggly
- Papertrail

Update `src/utils/logger.ts`:
```typescript
// Production logging
if (process.env.NODE_ENV === 'production') {
  logger.add(new transports.Console({
    format: format.json(),
  }));
  
  // Add CloudWatch transport
  const CloudWatchTransport = require('winston-cloudwatch');
  logger.add(new CloudWatchTransport({
    logGroupName: '/pipenexo/backend',
    logStreamName: `${process.env.DEPLOYMENT_ENV}`,
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
    awsRegion: 'us-east-1',
  }));
}
```

### 7. Setup Email Service (Optional)

For password reset emails:

#### SendGrid
```bash
npm install @sendgrid/mail
```

Update `src/services/auth.ts`:
```typescript
import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendPasswordResetEmail(email: string, resetUrl: string) {
  await sgMail.send({
    to: email,
    from: 'noreply@pipenexo.com.br',
    subject: 'Redefinir Senha - PipeNexo CRM',
    html: `<a href="${resetUrl}">Clique para redefinir sua senha</a>`,
  });
}
```

In Vercel environment variables:
```
SENDGRID_API_KEY=SG.xxxxx
```

### 8. Setup Monitoring & Alerts

#### Vercel Monitoring
- Go to Dashboard → Monitoring
- Enable Performance Monitoring
- Set up alerts for:
  - High error rates (>1%)
  - Response time degradation
  - Database connection issues

#### Database Backups

**For Neon:**
- Automatic backups every day
- 7-day retention

**For AWS RDS:**
```bash
# Manual backup
aws rds create-db-snapshot \
  --db-instance-identifier pipenexo-prod \
  --db-snapshot-identifier pipenexo-backup-$(date +%Y%m%d)
```

**For DigitalOcean:**
- Enable automated backups
- 3 backup retention

### 9. Setup CDN (Optional)

For static assets (frontend):

#### Cloudflare
```bash
# Add domain to Cloudflare
# Update DNS to point to Cloudflare nameservers
# Enable Caching:
#   - Browser Cache TTL: 1 month
#   - Cache Level: Standard
#   - Minify CSS/JS: Enabled
```

#### Vercel's Built-in CDN
- Automatically caches static assets globally
- No additional configuration needed
- Included in Vercel deployment

### 10. Test Production Deployment

```bash
# Test login
curl -X POST https://pipenexo.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pipenexo.test","password":"TestPassword123!"}'

# Test API endpoint
curl -H "Authorization: Bearer TOKEN" \
  https://pipenexo.vercel.app/api/dashboard

# Test database connection
curl https://pipenexo.vercel.app/api/health
```

## 🔄 CI/CD Pipeline

### GitHub Actions Setup

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Vercel

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: pipenexo_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm install
      
      - run: npm run test
      
      - run: npm run lint
      
      - run: npm run build

  deploy:
    if: github.ref == 'refs/heads/main'
    needs: test
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - uses: vercel/action@main
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          prod: true
```

### Setup GitHub Secrets

In GitHub repository → Settings → Secrets:

```
VERCEL_TOKEN=<get from Vercel>
VERCEL_ORG_ID=<get from Vercel>
VERCEL_PROJECT_ID=<get from Vercel>
```

## 📊 Production Checklist

- [ ] Environment variables set in Vercel
- [ ] Database connected and migrations run
- [ ] Custom domain configured with SSL
- [ ] Logging configured (Sentry/CloudWatch)
- [ ] Backups automated
- [ ] Rate limiting tested
- [ ] CORS configured correctly
- [ ] Security headers verified
- [ ] Refresh token rotation working
- [ ] Error pages configured
- [ ] 404 page exists
- [ ] Monitoring alerts setup
- [ ] Uptime monitoring enabled
- [ ] Performance baseline established

## 🔍 Monitoring Dashboard

Setup dashboards to track:

### Key Metrics
- **Error Rate**: Target <0.1%
- **Response Time**: P95 <500ms, P99 <1s
- **Availability**: Target 99.9%
- **Database Connections**: < 50% pool capacity
- **Token Refresh Rate**: Track suspicious patterns

### Health Checks

Create `src/routes/health.ts`:

```typescript
router.get('/health', async (req, res) => {
  try {
    // Check database connection
    await db.execute(sql`SELECT 1`);
    
    return res.json({
      status: 'healthy',
      timestamp: new Date(),
      uptime: process.uptime(),
      database: 'connected',
      memory: process.memoryUsage(),
    });
  } catch (error) {
    return res.status(503).json({
      status: 'unhealthy',
      error: error.message,
    });
  }
});
```

Test with:
```bash
curl https://pipenexo.vercel.app/api/health
```

## 🆘 Rollback Plan

If production deployment has issues:

```bash
# Option 1: Revert to previous Vercel deployment
# Via Vercel Dashboard → Deployments → Select previous → Redeploy

# Option 2: Git rollback
git revert <commit-hash>
git push origin main
# Vercel will automatically deploy the new commit

# Option 3: Emergency database restore
# If data corruption occurred:
# 1. Stop application
# 2. Restore from backup
# 3. Verify data integrity
# 4. Restart application
```

## 📞 Support & Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues.

For Vercel support: https://vercel.com/support

For database issues, contact your provider's support.

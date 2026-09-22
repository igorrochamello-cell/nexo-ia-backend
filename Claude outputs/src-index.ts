// src/index.ts
import 'dotenv/config';
import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { z } from 'zod';

// Database
import { initializeDatabase } from './db/connection';
import { db } from './db/client';

// Middleware
import { authMiddleware } from './middleware/auth';
import { csrfProtection } from './middleware/csrf';
import { errorHandler, asyncHandler } from './middleware/errors';

// Routes
import authRoutes from './routes/auth';
import clientRoutes from './routes/clients';
import dealRoutes from './routes/deals';
import policyRoutes from './routes/policies';
import dashboardRoutes from './routes/dashboard';

// Logger
import { logger } from './utils/logger';

const app: Express = express();
const PORT = process.env.PORT || 3000;

// ========== SECURITY MIDDLEWARE (Helmet) ==========
app.use(helmet());
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'https:'],
    fontSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"],
    frameSrc: ["'none'"],
    objectSrc: ["'none'"],
  },
}));

// ========== CORS ==========
const corsOptions = {
  origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  maxAge: 86400,
};
app.use(cors(corsOptions));

// ========== BODY PARSING ==========
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ========== LOGGING ==========
app.use(morgan(':method :url :status :response-time ms'));

// ========== RATE LIMITING ==========
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: parseInt(process.env.RATE_LIMIT_LOGIN_MAX || '5'),
  message: 'Too many login attempts, please try again later.',
  skip: (req) => req.method !== 'POST',
});

app.use('/api/', globalLimiter);
app.use('/api/auth/login', loginLimiter);

// ========== HEALTH CHECK ==========
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========== PUBLIC ROUTES (No auth required) ==========
app.use('/api/auth', authRoutes);

// ========== CSRF Token endpoint (Pré-auth)
app.post('/api/csrf', csrfProtection, (req: Request, res: Response) => {
  const token = req.csrfToken?.() || '';
  res.json({ csrfToken: token });
});

// ========== PROTECTED ROUTES (Auth required) ==========
app.use(authMiddleware);

// CRM Routes
app.use('/api/clients', clientRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/dashboard', dashboardRoutes);

// ========== 404 Handler ==========
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// ========== ERROR HANDLER ==========
app.use(errorHandler);

// ========== STARTUP ==========
async function startServer() {
  try {
    // Initialize Database
    await initializeDatabase();
    logger.info('✅ Database connected');

    // Start Server
    app.listen(PORT, () => {
      logger.info(`✅ Server running on http://localhost:${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
      logger.info(`CORS enabled for: ${process.env.CORS_ORIGIN}`);
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;

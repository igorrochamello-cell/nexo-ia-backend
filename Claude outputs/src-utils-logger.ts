// src/utils/logger.ts
import winston from 'winston';
import fs from 'fs';
import path from 'path';

const logDir = process.env.LOG_DIR || './logs';

// Ensure log directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logLevel = process.env.LOG_LEVEL || 'info';

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'pipenexo-backend' },
  transports: [
    // Console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `[${timestamp}] ${level}: ${message} ${metaStr}`;
        })
      ),
    }),
    // File: all logs
    new winston.transports.File({
      filename: path.join(logDir, 'app.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // File: errors only
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 10,
    }),
  ],
});

export function logAudit(
  companyId: string,
  userId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  valueBefore?: any,
  valueAfter?: any
) {
  logger.info('AUDIT', {
    companyId,
    userId,
    action,
    resourceType,
    resourceId,
    valueBefore,
    valueAfter,
  });
}

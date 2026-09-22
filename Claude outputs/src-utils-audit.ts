// src/utils/audit.ts
import { db } from '@/db/client';
import { auditLogs } from '@/db/schema';
import { logger } from './logger';

interface AuditLogInput {
  companyId: string;
  userId: string;
  action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'EXPORT';
  resourceType: string;
  resourceId?: string;
  valueBefore?: any;
  valueAfter?: any;
  ipAddress?: string;
  userAgent?: string;
  status?: 'success' | 'failure';
  errorMessage?: string;
}

export const audit = {
  async logAction(input: AuditLogInput) {
    try {
      await db.insert(auditLogs).values({
        companyId: input.companyId,
        userId: input.userId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        valueBefore: input.valueBefore,
        valueAfter: input.valueAfter,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        status: input.status || 'success',
        errorMessage: input.errorMessage,
      });
    } catch (error) {
      logger.error('Failed to log audit:', error);
      // Don't throw - audit failures should not break the application
    }
  },

  async logCreateAction(
    companyId: string,
    userId: string,
    resourceType: string,
    resourceId: string,
    valueAfter: any,
    ipAddress?: string,
    userAgent?: string
  ) {
    return this.logAction({
      companyId,
      userId,
      action: 'CREATE',
      resourceType,
      resourceId,
      valueAfter,
      ipAddress,
      userAgent,
    });
  },

  async logUpdateAction(
    companyId: string,
    userId: string,
    resourceType: string,
    resourceId: string,
    valueBefore: any,
    valueAfter: any,
    ipAddress?: string,
    userAgent?: string
  ) {
    return this.logAction({
      companyId,
      userId,
      action: 'UPDATE',
      resourceType,
      resourceId,
      valueBefore,
      valueAfter,
      ipAddress,
      userAgent,
    });
  },

  async logDeleteAction(
    companyId: string,
    userId: string,
    resourceType: string,
    resourceId: string,
    valueBefore: any,
    ipAddress?: string,
    userAgent?: string
  ) {
    return this.logAction({
      companyId,
      userId,
      action: 'DELETE',
      resourceType,
      resourceId,
      valueBefore,
      ipAddress,
      userAgent,
    });
  },
};

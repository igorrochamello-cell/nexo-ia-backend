// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '@/services/auth';
import { db } from '@/db/client';
import { users, userPermissions, permissions, rolePermissions, roles } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/utils/logger';

declare global {
  namespace Express {
    interface Request {
      context: {
        userId: string;
        companyId: string;
        email: string;
        role: string;
        permissions: Set<string>;
        ipAddress: string;
        userAgent: string;
      };
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 1. Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = authHeader.substring(7);

    // 2. Verify JWT
    const payload = verifyAccessToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // 3. Load user from database (to verify still active)
    const user = await db.query.users.findFirst({
      where: eq(users.id, payload.userId),
    });

    if (!user || user.status !== 'active') {
      res.status(401).json({ error: 'User not found or inactive' });
      return;
    }

    // 4. Verify company match (security: token company must match user's company)
    if (user.companyId !== payload.companyId) {
      logger.error('🚨 Company mismatch in token:', {
        userId: payload.userId,
        tokenCompanyId: payload.companyId,
        userCompanyId: user.companyId,
      });
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    // 5. Load permissions (via role + individual)
    const userPermissionsList = await db.query.userPermissions.findMany({
      where: eq(userPermissions.userId, user.id),
      with: { permission: true },
    });

    let rolePermissionsList: typeof permissions.$inferSelect[] = [];
    if (user.roleId) {
      const rolePerms = await db.query.rolePermissions.findMany({
        where: eq(rolePermissions.roleId, user.roleId),
        with: { permission: true },
      });
      rolePermissionsList = rolePerms.map((rp) => rp.permission);
    }

    // Combine permissions
    const allPermissions = new Set<string>();
    userPermissionsList.forEach((up) => allPermissions.add(up.permission.code));
    rolePermissionsList.forEach((p) => allPermissions.add(p.code));

    // 6. Inject context into request
    req.context = {
      userId: user.id,
      companyId: user.companyId,
      email: user.email,
      role: user.roleId || 'user',
      permissions: allPermissions,
      ipAddress: req.ip || '',
      userAgent: req.get('user-agent') || '',
    };

    // 7. Set PostgreSQL session variable for RLS
    // (This happens in the database layer, not here)

    logger.debug('User authenticated:', {
      userId: user.id,
      email: user.email,
      companyId: user.companyId,
    });

    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ========== PERMISSION CHECK MIDDLEWARE ==========
export function requirePermission(...requiredPermissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.context) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const hasPermission = requiredPermissions.some((perm) =>
      req.context.permissions.has(perm)
    );

    if (!hasPermission) {
      logger.warn('Permission denied:', {
        userId: req.context.userId,
        required: requiredPermissions,
        userPermissions: Array.from(req.context.permissions),
      });
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

// ========== TENANT ISOLATION HELPER ==========
export function getTenantFilter(companyId: string) {
  return { company_id: companyId };
}

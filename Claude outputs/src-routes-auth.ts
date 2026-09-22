// src/routes/auth.ts
import express, { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  loginUser,
  createPasswordResetToken,
  completePasswordReset,
  verifyPasswordResetToken,
  revokeSession,
  revokeAllSessions,
} from '@/services/auth';
import { authMiddleware } from '@/middleware/auth';
import { asyncHandler, ValidationError } from '@/middleware/errors';
import { logger } from '@/utils/logger';
import { db } from '@/db/client';
import { audit } from '@/utils/audit';

const router = Router();

// ========== VALIDATION SCHEMAS ==========
const LoginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token required'),
});

const PasswordResetSchema = z.object({
  email: z.string().email('Invalid email'),
});

const PasswordResetCompleteSchema = z.object({
  token: z.string().min(1, 'Reset token required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

// ========== POST /auth/login ==========
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = LoginSchema.parse(req.body);

  const deviceName = req.headers['user-agent']?.substring(0, 100) || 'Unknown Device';
  const ipAddress = req.ip || '';

  const result = await loginUser(
    email,
    password,
    deviceName,
    ipAddress,
    req.headers['user-agent'] || ''
  );

  if (!result) {
    // Don't reveal whether user exists
    logger.warn('Failed login attempt:', { email, ip: ipAddress });
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Log successful login to audit
  await audit.logAction({
    companyId: 'unknown', // Will be filled by service
    userId: 'unknown',
    action: 'LOGIN',
    resourceType: 'auth',
    ipAddress,
    userAgent: req.headers['user-agent'] || '',
  });

  // Return tokens
  // Access token in body (short-lived)
  // Refresh token in httpOnly cookie (long-lived)
  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.json({
    accessToken: result.accessToken,
    expiresIn: '15m',
  });
}));

// ========== POST /auth/refresh ==========
router.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = RefreshSchema.parse(req.body);

  const result = await loginUser.refreshAccessToken(refreshToken);

  if (!result) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }

  res.json({
    accessToken: result.accessToken,
    expiresIn: '15m',
  });
}));

// ========== POST /auth/logout ==========
router.post('/logout', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.body;

  if (sessionId) {
    // Logout from specific device
    await revokeSession(sessionId);
  } else {
    // Logout from all devices
    await revokeAllSessions(req.context.userId);
  }

  // Clear refresh token cookie
  res.clearCookie('refreshToken');

  await audit.logAction({
    companyId: req.context.companyId,
    userId: req.context.userId,
    action: 'LOGOUT',
    resourceType: 'auth',
    ipAddress: req.context.ipAddress,
  });

  res.json({ message: 'Logged out successfully' });
}));

// ========== POST /auth/password-reset-request ==========
router.post(
  '/password-reset-request',
  asyncHandler(async (req: Request, res: Response) => {
    const { email } = PasswordResetSchema.parse(req.body);

    // Find user (don't reveal if exists)
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, email),
    });

    if (user) {
      const token = await createPasswordResetToken(user.id);

      // TODO: Send email with reset link
      // await sendPasswordResetEmail(email, token);

      logger.info('Password reset token created:', { userId: user.id });
    }

    // Always return same response (don't leak user existence)
    res.json({
      message: 'If email exists, password reset link has been sent',
    });
  })
);

// ========== POST /auth/password-reset-complete ==========
router.post(
  '/password-reset-complete',
  asyncHandler(async (req: Request, res: Response) => {
    const { token, newPassword } = PasswordResetCompleteSchema.parse(req.body);

    const success = await completePasswordReset(token, newPassword);

    if (!success) {
      return res.status(400).json({
        error: 'Invalid or expired reset token',
      });
    }

    res.clearCookie('refreshToken');

    res.json({
      message: 'Password updated successfully. Please login again.',
    });
  })
);

// ========== GET /auth/me (Current user info) ==========
router.get('/me', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const user = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.id, req.context.userId),
    with: {
      role: true,
      permissions: { with: { permission: true } },
    },
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role?.name,
    permissions: user.permissions.map((p) => p.permission.code),
  });
}));

export default router;

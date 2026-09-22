// src/services/auth.ts
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '@/db/client';
import { users, sessions, passwordResets } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/utils/logger';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenHash: string;
}

interface JWTPayload {
  userId: string;
  companyId: string;
  email: string;
  role: string;
  permissions: string[];
}

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'change_me';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'change_me';
const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

// ========== PASSWORD HASHING ==========
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ========== TOKENS ==========
export function generateAccessToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_ACCESS_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRY,
    algorithm: 'HS256',
  });
}

export function generateRefreshToken(): string {
  // 32-byte random token
  return crypto.randomBytes(32).toString('hex');
}

export function hashRefreshToken(token: string): string {
  // SHA-256 hash (stored in database)
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function verifyAccessToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    logger.debug('Invalid access token:', error);
    return null;
  }
}

// ========== SESSION MANAGEMENT ==========
export async function createSession(
  userId: string,
  companyId: string,
  deviceName: string,
  ipAddress: string,
  userAgent: string
): Promise<TokenPair> {
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);
  
  // Store session in database
  const session = await db.insert(sessions).values({
    userId,
    companyId,
    refreshTokenHash,
    deviceName,
    ipAddress,
    userAgent,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    lastUsedAt: new Date(),
  });

  // Get user details for JWT
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) throw new Error('User not found');

  // Generate tokens
  const accessToken = generateAccessToken({
    userId,
    companyId,
    email: user.email,
    role: user.roleId || 'user',
    permissions: [], // Será carregado do banco no middleware
  });

  return {
    accessToken,
    refreshToken,
    refreshTokenHash,
  };
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string } | null> {
  const refreshTokenHash = hashRefreshToken(refreshToken);

  // Find session
  const session = await db.query.sessions.findFirst({
    where: eq(sessions.refreshTokenHash, refreshTokenHash),
  });

  if (!session || session.expiresAt < new Date()) {
    return null; // Token expired or not found
  }

  // Check for token reuse (theft detection)
  if (session.lastUsedAt && new Date().getTime() - session.lastUsedAt.getTime() < 1000) {
    // Token used twice within 1 second = likely theft
    logger.warn('🚨 Possible token theft detected:', { sessionId: session.id });
    // Revoke all sessions for this user
    await db.update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.userId, session.userId));
    return null;
  }

  // Update last used
  await db.update(sessions)
    .set({ lastUsedAt: new Date() })
    .where(eq(sessions.id, session.id));

  // Get user
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
  });

  if (!user || user.status !== 'active') return null;

  // Generate new access token
  const accessToken = generateAccessToken({
    userId: user.id,
    companyId: session.companyId,
    email: user.email,
    role: user.roleId || 'user',
    permissions: [],
  });

  return { accessToken };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await db.update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.id, sessionId));
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await db.update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.userId, userId));
}

// ========== PASSWORD RESET ==========
export async function createPasswordResetToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashRefreshToken(token); // Reutilizar hash function

  await db.insert(passwordResets).values({
    userId,
    tokenHash,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
  });

  return token;
}

export async function verifyPasswordResetToken(token: string): Promise<string | null> {
  const tokenHash = hashRefreshToken(token);

  const reset = await db.query.passwordResets.findFirst({
    where: and(
      eq(passwordResets.tokenHash, tokenHash),
      new Date()
    ),
  });

  if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
    return null;
  }

  return reset.userId;
}

export async function completePasswordReset(token: string, newPassword: string): Promise<boolean> {
  const userId = await verifyPasswordResetToken(token);
  if (!userId) return false;

  const passwordHash = await hashPassword(newPassword);

  // Update password
  await db.update(users)
    .set({ passwordHash })
    .where(eq(users.id, userId));

  // Mark token as used
  const tokenHash = hashRefreshToken(token);
  await db.update(passwordResets)
    .set({ usedAt: new Date() })
    .where(eq(passwordResets.tokenHash, tokenHash));

  // Revoke all sessions (force re-login)
  await revokeAllSessions(userId);

  return true;
}

// ========== LOGIN ==========
export async function loginUser(
  email: string,
  password: string,
  deviceName: string,
  ipAddress: string,
  userAgent: string
): Promise<{ accessToken: string; refreshToken: string } | null> {
  // Find user
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) {
    logger.warn('Login attempt with invalid email:', { email });
    return null;
  }

  if (user.status !== 'active') {
    logger.warn('Login attempt with inactive user:', { userId: user.id, status: user.status });
    return null;
  }

  // Check brute force
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    logger.warn('Login attempt while account locked:', { userId: user.id });
    return null;
  }

  // Verify password
  const passwordValid = await verifyPassword(password, user.passwordHash);

  if (!passwordValid) {
    // Increment failed attempts
    const newAttempts = (user.loginAttempts || 0) + 1;
    let lockUntil: Date | null = null;

    if (newAttempts >= 5) {
      // Lock account for 15 minutes after 5 attempts
      lockUntil = new Date(Date.now() + 15 * 60 * 1000);
    }

    await db.update(users)
      .set({
        loginAttempts: newAttempts,
        lockedUntil: lockUntil,
      })
      .where(eq(users.id, user.id));

    logger.warn('Failed login attempt:', { userId: user.id, attempts: newAttempts });
    return null;
  }

  // Reset failed attempts
  await db.update(users)
    .set({
      loginAttempts: 0,
      lockedUntil: null,
      lastLogin: new Date(),
    })
    .where(eq(users.id, user.id));

  // Create session
  const { accessToken, refreshToken } = await createSession(
    user.id,
    user.companyId,
    deviceName,
    ipAddress,
    userAgent
  );

  logger.info('User logged in:', { userId: user.id, email });

  return { accessToken, refreshToken };
}

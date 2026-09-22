// src/db/schema.ts
// Drizzle ORM schema definitions (corresponding to SQL migrations)

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  decimal,
  boolean,
  json,
  date,
  uniqueIndex,
  index,
  relations,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ========== COMPANIES ==========
export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  cnpjCpf: varchar('cnpj_cpf', { length: 20 }),
  plan: varchar('plan', { length: 50 }).default('free'),
  status: varchar('status', { length: 50 }).default('active'),
  subscriptionId: uuid('subscription_id'),
  maxUsers: integer('max_users').default(1),
  modules: text('modules').array(),
  createdAt: timestamp('criado_em').defaultNow(),
  updatedAt: timestamp('atualizado_em').defaultNow(),
  deletedAt: timestamp('deleted_at'),
  deletedBy: uuid('deleted_by'),
});

// ========== USERS ==========
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  email: varchar('email', { length: 255 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  fullName: varchar('full_name', { length: 255 }),
  phone: varchar('phone', { length: 20 }),
  roleId: uuid('role_id'),
  status: varchar('status', { length: 50 }).default('active'),
  lastLogin: timestamp('last_login'),
  loginAttempts: integer('login_attempts').default(0),
  lockedUntil: timestamp('locked_until'),
  createdAt: timestamp('criado_em').defaultNow(),
  updatedAt: timestamp('atualizado_em').defaultNow(),
  deletedAt: timestamp('deleted_at'),
  deletedBy: uuid('deleted_by'),
}, (table) => ({
  uniqueEmailPerCompany: uniqueIndex().on(table.companyId, table.email),
  companyIdx: index().on(table.companyId),
  statusIdx: index().on(table.status),
}));

// ========== ROLES ==========
export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  level: integer('level').default(0),
  createdAt: timestamp('criado_em').defaultNow(),
  updatedAt: timestamp('atualizado_em').defaultNow(),
}, (table) => ({
  companyIdx: index().on(table.companyId),
}));

// ========== PERMISSIONS ==========
export const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 100 }).notNull().unique(),
  description: text('description'),
  resource: varchar('resource', { length: 100 }),
  action: varchar('action', { length: 50 }),
  createdAt: timestamp('criado_em').defaultNow(),
});

// ========== ROLE_PERMISSIONS ==========
export const rolePermissions = pgTable('role_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  roleId: uuid('role_id').notNull().references(() => roles.id),
  permissionId: uuid('permission_id').notNull().references(() => permissions.id),
  createdAt: timestamp('criado_em').defaultNow(),
}, (table) => ({
  roleIdx: index().on(table.roleId),
  permissionIdx: index().on(table.permissionId),
}));

// ========== SESSIONS ==========
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  refreshTokenHash: varchar('refresh_token_hash', { length: 255 }).notNull(),
  refreshTokenFamily: varchar('refresh_token_family', { length: 255 }),
  deviceName: varchar('device_name', { length: 255 }),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at').notNull(),
  lastUsedAt: timestamp('last_used_at'),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('criado_em').defaultNow(),
}, (table) => ({
  userIdx: index().on(table.userId),
  companyIdx: index().on(table.companyId),
  tokenIdx: index().on(table.refreshTokenHash),
}));

// ========== PASSWORD_RESETS ==========
export const passwordResets = pgTable('password_resets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('criado_em').defaultNow(),
}, (table) => ({
  userIdx: index().on(table.userId),
  tokenIdx: index().on(table.tokenHash),
}));

// ========== CLIENTS ==========
export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  name: varchar('nome', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  phone: varchar('telefone', { length: 20 }),
  cpfCnpj: varchar('cpf_cnpj', { length: 20 }),
  type: varchar('tipo', { length: 50 }),
  address: text('endereco'),
  city: varchar('cidade', { length: 100 }),
  state: varchar('estado', { length: 2 }),
  zip: varchar('cep', { length: 10 }),
  originId: uuid('origem_id'),
  responsableId: uuid('responsavel_id'),
  tags: text('tags').array(),
  notes: text('notas'),
  createdById: uuid('criado_por_id'),
  createdAt: timestamp('criado_em').defaultNow(),
  updatedAt: timestamp('atualizado_em').defaultNow(),
  deletedAt: timestamp('deleted_at'),
  deletedBy: uuid('deleted_by'),
}, (table) => ({
  uniqueCpfCnpj: uniqueIndex().on(table.companyId, table.cpfCnpj),
  companyIdx: index().on(table.companyId),
}));

// ========== AUDIT_LOGS (IMUTÁVEL) ==========
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  userId: uuid('user_id'),
  action: varchar('acao', { length: 50 }).notNull(),
  resourceType: varchar('recurso_tipo', { length: 100 }).notNull(),
  resourceId: uuid('recurso_id'),
  valueBefore: json('valor_antes'),
  valueAfter: json('valor_depois'),
  ipAddress: varchar('ip', { length: 45 }),
  userAgent: text('user_agent'),
  status: varchar('status', { length: 50 }).default('success'),
  errorMessage: text('error_message'),
  createdAt: timestamp('criado_em').defaultNow(),
}, (table) => ({
  companyIdx: index().on(table.companyId),
  userIdx: index().on(table.userId),
  acaoIdx: index().on(table.action),
  resourceIdx: index().on(table.resourceType, table.resourceId),
  dateIdx: index().on(table.createdAt),
}));

// ========== USER_PERMISSIONS ==========
export const userPermissions = pgTable('user_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  permissionId: uuid('permission_id').notNull().references(() => permissions.id),
  createdAt: timestamp('criado_em').defaultNow(),
}, (table) => ({
  userIdx: index().on(table.userId),
}));

// ========== RELATIONS for eager loading ==========
export const companiesRelations = relations(companies, ({ many }) => ({
  users: many(users),
  auditLogs: many(auditLogs),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  company: one(companies, { fields: [users.companyId], references: [companies.id] }),
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  permissions: many(userPermissions),
  auditLogs: many(auditLogs),
  sessions: many(sessions),
}));

export const userPermissionsRelations = relations(userPermissions, ({ one }) => ({
  user: one(users, { fields: [userPermissions.userId], references: [users.id] }),
  permission: one(permissions, { fields: [userPermissions.permissionId], references: [permissions.id] }),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, { fields: [rolePermissions.permissionId], references: [permissions.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
  company: one(companies, { fields: [sessions.companyId], references: [companies.id] }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  permissions: many(rolePermissions),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  roles: many(rolePermissions),
  users: many(userPermissions),
}));

export const clientsRelations = relations(clients, ({ one }) => ({
  company: one(companies, { fields: [clients.companyId], references: [companies.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  company: one(companies, { fields: [auditLogs.companyId], references: [companies.id] }),
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

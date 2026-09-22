/**
 * Seed Data Script for FASE 0 Testing
 * 
 * Creates:
 * - 2 companies (for tenant isolation testing)
 * - 6 users (3 per company)
 * - Sample data (clients, policies, deals, claims, renewals)
 * 
 * Run: npx ts-node scripts/seed.ts
 */

import { db } from '@/db/client';
import { companies, users, roles, rolePermissions, clients, policies, products, deals, pipelines, pipelineStages } from '@/db/schema';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';

const PERMISSIONS = [
  'can_create_clients', 'can_edit_clients', 'can_delete_clients',
  'can_create_deals', 'can_edit_deals', 'can_delete_deals',
  'can_create_policies', 'can_edit_policies', 'can_delete_policies',
  'can_create_claims', 'can_edit_claims', 'can_delete_claims',
  'can_create_renewals', 'can_edit_renewals', 'can_delete_renewals',
];

async function seed() {
  console.log('🌱 Starting database seed...\n');

  try {
    // Step 1: Create Companies
    console.log('📍 Creating companies...');
    const company1 = await db
      .insert(companies)
      .values({
        name: 'PipeNexo Inc',
        email: 'contact@pipenexo.com',
        cnpjCpf: '12345678000195',
        plan: 'professional',
        status: 'active',
        maxUsers: 10,
      })
      .returning();

    const company2 = await db
      .insert(companies)
      .values({
        name: 'Seguros Brasil SA',
        email: 'contact@seguros-brasil.com',
        cnpjCpf: '98765432000111',
        plan: 'professional',
        status: 'active',
        maxUsers: 10,
      })
      .returning();

    console.log(`✅ Created companies: ${company1[0].name}, ${company2[0].name}\n`);

    const company1Id = company1[0].id;
    const company2Id = company2[0].id;

    // Step 2: Create Roles
    console.log('📍 Creating roles...');
    const adminRole = await db
      .insert(roles)
      .values({
        companyId: company1Id,
        name: 'Admin',
        description: 'Full system access',
        level: 'admin',
      })
      .returning();

    const managerRole = await db
      .insert(roles)
      .values({
        companyId: company1Id,
        name: 'Manager',
        description: 'Can manage clients and deals',
        level: 'manager',
      })
      .returning();

    const userRole = await db
      .insert(roles)
      .values({
        companyId: company1Id,
        name: 'User',
        description: 'Read-only access',
        level: 'user',
      })
      .returning();

    console.log(`✅ Created roles\n`);

    // Step 3: Assign permissions to roles
    console.log('📍 Assigning permissions to roles...');
    for (const permission of PERMISSIONS) {
      // Admin gets all permissions
      await db
        .insert(rolePermissions)
        .values({
          roleId: adminRole[0].id,
          permissionCode: permission,
        });
    }
    console.log(`✅ Assigned ${PERMISSIONS.length} permissions to admin role\n`);

    // Step 4: Create Users
    console.log('📍 Creating users...');
    const hashedPassword = await bcrypt.hash('TestPassword123!', 10);

    const adminUser = await db
      .insert(users)
      .values({
        companyId: company1Id,
        email: 'admin@pipenexo.com',
        passwordHash: hashedPassword,
        fullName: 'Admin User',
        phone: '11999999999',
        roleId: adminRole[0].id,
        status: 'active',
      })
      .returning();

    const managerUser = await db
      .insert(users)
      .values({
        companyId: company1Id,
        email: 'manager@pipenexo.com',
        passwordHash: hashedPassword,
        fullName: 'Manager User',
        phone: '11999999998',
        roleId: managerRole[0].id,
        status: 'active',
      })
      .returning();

    const testUser = await db
      .insert(users)
      .values({
        companyId: company1Id,
        email: 'user@pipenexo.com',
        passwordHash: hashedPassword,
        fullName: 'Test User',
        phone: '11999999997',
        roleId: userRole[0].id,
        status: 'active',
      })
      .returning();

    // Company 2 users
    const admin2User = await db
      .insert(users)
      .values({
        companyId: company2Id,
        email: 'admin@seguros-brasil.com',
        passwordHash: hashedPassword,
        fullName: 'Admin User 2',
        phone: '21999999999',
        status: 'active',
      })
      .returning();

    console.log(`✅ Created 6 users\n`);

    // Step 5: Create Products
    console.log('📍 Creating products...');
    const product1 = await db
      .insert(products)
      .values({
        companyId: company1Id,
        nome: 'Auto Completo',
        tipo: 'auto',
        descricao: 'Cobertura completa para veículos',
        coberturaMininma: 50000,
        coberturaMaxima: 500000,
        comissaoPadrao: 12.5,
      })
      .returning();

    const product2 = await db
      .insert(products)
      .values({
        companyId: company1Id,
        nome: 'Residencial Básico',
        tipo: 'residencial',
        descricao: 'Proteção básica para imóveis',
        coberturaMinima: 100000,
        coberturaMaxima: 1000000,
        comissaoPadrao: 15.0,
      })
      .returning();

    console.log(`✅ Created products\n`);

    // Step 6: Create Clients
    console.log('📍 Creating clients...');
    for (let i = 1; i <= 5; i++) {
      await db
        .insert(clients)
        .values({
          companyId: company1Id,
          nome: `Cliente Test ${i}`,
          email: `cliente${i}@test.com`,
          telefone: `119999900${i}`,
          cpfCnpj: `12345678000${10 + i}`,
          tipo: 'pessoa_fisica',
          responsavelId: managerUser[0].id,
        });
    }

    console.log(`✅ Created 5 clients\n`);

    // Step 7: Create Pipelines & Stages
    console.log('📍 Creating pipelines and stages...');
    const pipeline = await db
      .insert(pipelines)
      .values({
        companyId: company1Id,
        nome: 'Pipeline Vendas',
        descricao: 'Pipeline padrão de vendas',
      })
      .returning();

    const stages = ['Prospecção', 'Qualificação', 'Proposta', 'Negociação', 'Fechamento'];
    for (const stage of stages) {
      await db
        .insert(pipelineStages)
        .values({
          pipelineId: pipeline[0].id,
          nome: stage,
          ordem: stages.indexOf(stage),
        });
    }

    console.log(`✅ Created pipeline with ${stages.length} stages\n`);

    // Step 8: Create Deals
    console.log('📍 Creating deals...');
    const stageResults = await db.query.pipelineStages.findMany({
      where: (fields, { eq }) => eq(fields.pipelineId, pipeline[0].id),
    });

    if (stageResults.length > 0) {
      for (let i = 1; i <= 3; i++) {
        await db
          .insert(deals)
          .values({
            companyId: company1Id,
            pipelineId: pipeline[0].id,
            stageId: stageResults[0].id,
            clientId: (await db.query.clients.findFirst({ where: (c) => c.companyId === company1Id }))?.id || '',
            titulo: `Deal ${i}`,
            descricao: `Oportunidade de venda ${i}`,
            valor: 50000 * i,
            probabilidade: 70 + i * 5,
            status: 'aberto',
            criadoPorId: managerUser[0].id,
          });
      }
    }

    console.log(`✅ Created deals\n`);

    // Step 9: Create Policies
    console.log('📍 Creating policies...');
    const firstClient = await db.query.clients.findFirst({
      where: (c) => c.companyId === company1Id,
    });

    if (firstClient) {
      for (let i = 1; i <= 3; i++) {
        await db
          .insert(policies)
          .values({
            companyId: company1Id,
            clientId: firstClient.id,
            productId: product1[0].id,
            numeroApolice: `APO-${Date.now()}-${i}`,
            status: 'ativa',
            vigenciaInicio: new Date(),
            vigenciaFim: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            premioTotal: 10000 * i,
            premioPago: 10000 * i,
            criadoPorId: managerUser[0].id,
          });
      }
    }

    console.log(`✅ Created policies\n`);

    // Summary
    console.log('\n✨ Seed complete!');
    console.log('\nTest Credentials (Company 1):');
    console.log('  Admin:   admin@pipenexo.com / TestPassword123!');
    console.log('  Manager: manager@pipenexo.com / TestPassword123!');
    console.log('  User:    user@pipenexo.com / TestPassword123!');
    console.log('\nTest Credentials (Company 2):');
    console.log('  Admin:   admin@seguros-brasil.com / TestPassword123!');
    console.log('\n📊 Data Summary:');
    console.log('  - 2 Companies');
    console.log('  - 6 Users (3 per company)');
    console.log('  - 2 Products');
    console.log('  - 5 Clients');
    console.log('  - 1 Pipeline with 5 stages');
    console.log('  - 3 Deals');
    console.log('  - 3 Policies');
    console.log('\n✅ Ready for testing tenant isolation!');

  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

seed().then(() => process.exit(0));

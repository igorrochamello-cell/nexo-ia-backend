import { Router, Request, Response } from 'express';
import { db } from '@/db/client';
import { clients, deals, policies, claims, renewals, tasks } from '@/db/schema';
import { authMiddleware } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errors';
import { eq, and, isNull, sql, gt } from 'drizzle-orm';

const router = Router();
router.use(authMiddleware);

// GET /dashboard - Get company metrics overview
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.context!;

    // Get total counts
    const clientsCount = await db
      .select({ count: sql`count(*)` })
      .from(clients)
      .where(and(eq(clients.companyId, companyId), isNull(clients.deletedAt)));

    const dealsCount = await db
      .select({ count: sql`count(*)` })
      .from(deals)
      .where(and(eq(deals.companyId, companyId), isNull(deals.deletedAt)));

    const dealsOpenCount = await db
      .select({ count: sql`count(*)` })
      .from(deals)
      .where(and(eq(deals.companyId, companyId), eq(deals.status, 'aberto'), isNull(deals.deletedAt)));

    const policiesCount = await db
      .select({ count: sql`count(*)` })
      .from(policies)
      .where(and(eq(policies.companyId, companyId), isNull(policies.deletedAt)));

    const policiesActiveCount = await db
      .select({ count: sql`count(*)` })
      .from(policies)
      .where(and(eq(policies.companyId, companyId), eq(policies.status, 'ativa'), isNull(policies.deletedAt)));

    const claimsCount = await db
      .select({ count: sql`count(*)` })
      .from(claims)
      .where(and(eq(claims.companyId, companyId), isNull(claims.deletedAt)));

    const claimsOpenCount = await db
      .select({ count: sql`count(*)` })
      .from(claims)
      .where(and(eq(claims.companyId, companyId), eq(claims.status, 'aberto'), isNull(claims.deletedAt)));

    const renewalsCount = await db
      .select({ count: sql`count(*)` })
      .from(renewals)
      .where(and(eq(renewals.companyId, companyId), isNull(renewals.deletedAt)));

    const renewalsPendingCount = await db
      .select({ count: sql`count(*)` })
      .from(renewals)
      .where(and(eq(renewals.companyId, companyId), eq(renewals.status, 'pendente'), isNull(renewals.deletedAt)));

    const tasksCount = await db
      .select({ count: sql`count(*)` })
      .from(tasks)
      .where(and(eq(tasks.companyId, companyId), eq(tasks.status, 'open'), isNull(tasks.deletedAt)));

    // Get financial metrics
    const totalPoliciesValue = await db
      .select({ sum: sql`sum(${policies.premioTotal})` })
      .from(policies)
      .where(and(eq(policies.companyId, companyId), eq(policies.status, 'ativa'), isNull(policies.deletedAt)));

    const totalClaimsValue = await db
      .select({ sum: sql`sum(${claims.valorIndenizacao})` })
      .from(claims)
      .where(and(eq(claims.companyId, companyId), isNull(claims.deletedAt)));

    const totalDealsValue = await db
      .select({ sum: sql`sum(${deals.valor})` })
      .from(deals)
      .where(and(eq(deals.companyId, companyId), isNull(deals.deletedAt)));

    res.json({
      overview: {
        totalClients: Number(clientsCount[0]?.count || 0),
        totalPolicies: Number(policiesCount[0]?.count || 0),
        activePolicies: Number(policiesActiveCount[0]?.count || 0),
        totalClaims: Number(claimsCount[0]?.count || 0),
        openClaims: Number(claimsOpenCount[0]?.count || 0),
        totalRenewals: Number(renewalsCount[0]?.count || 0),
        pendingRenewals: Number(renewalsPendingCount[0]?.count || 0),
      },
      pipeline: {
        totalDeals: Number(dealsCount[0]?.count || 0),
        openDeals: Number(dealsOpenCount[0]?.count || 0),
        totalValue: Number(totalDealsValue[0]?.sum || 0),
      },
      financial: {
        activePolicesAmount: Number(totalPoliciesValue[0]?.sum || 0),
        totalClaimsAmount: Number(totalClaimsValue[0]?.sum || 0),
      },
      tasks: {
        openTasks: Number(tasksCount[0]?.count || 0),
      },
    });
  })
);

export default router;

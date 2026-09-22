// src/routes/clients.ts
import { Router, Request, Response } from 'express';
import { requirePermission } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errors';

const router = Router();

// GET /api/clients - List all clients
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  res.json({ message: 'GET /clients - FASE 1 feature' });
}));

// POST /api/clients - Create client
router.post(
  '/',
  requirePermission('can_create_clients'),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ message: 'POST /clients - FASE 1 feature' });
  })
);

// GET /api/clients/:id - Get specific client
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  res.json({ message: 'GET /clients/:id - FASE 1 feature' });
}));

// PUT /api/clients/:id - Update client
router.put(
  '/:id',
  requirePermission('can_edit_clients'),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ message: 'PUT /clients/:id - FASE 1 feature' });
  })
);

// DELETE /api/clients/:id - Delete client (soft delete)
router.delete(
  '/:id',
  requirePermission('can_delete_clients'),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ message: 'DELETE /clients/:id - FASE 1 feature' });
  })
);

export default router;

// ========== src/routes/deals.ts ==========
// Similar structure for deals

// ========== src/routes/policies.ts ==========
// Similar structure for policies

// ========== src/routes/dashboard.ts ==========
// GET /api/dashboard - Return metrics
// const dashboardRouter = Router();
// dashboardRouter.get('/', asyncHandler(async (req, res) => {
//   res.json({
//     totalClients: 0,
//     totalDeals: 0,
//     totalPolicies: 0,
//     revenue: 0,
//   });
// }));
// export default dashboardRouter;

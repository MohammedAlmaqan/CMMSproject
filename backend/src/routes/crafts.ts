import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/crafts:
 *   get:
 *     summary: List crafts
 *     description: >
 *       Returns all non-deleted crafts ordered by craftCode ascending. Read-only reference
 *       endpoint - no role restriction beyond authentication, so any signed-in user can
 *       populate a craft dropdown.
 *     tags: [Crafts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Array of crafts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   craftId: { type: string }
 *                   workCenterId: { type: string }
 *                   craftCode: { type: string }
 *                   description: { type: string }
 *                   hourlyRate: { type: number, format: float, description: "Float-typed in v1.0.0; Decimal migration is v1.1" }
 *                   createdBy: { type: string }
 *                   createdDate: { type: string, format: date-time }
 *                   modifiedBy: { type: string }
 *                   modifiedDate: { type: string, format: date-time }
 *                   isDeleted: { type: boolean }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const crafts = await prisma.craft.findMany({
      where: { isDeleted: false },
      orderBy: { craftCode: 'asc' },
    });

    res.json(crafts);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching crafts');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
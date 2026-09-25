import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/audit-log:
 *   get:
 *     summary: List audit log entries (Administrator only)
 *     description: >
 *       Returns a page of field-level change records ordered by timestamp descending, each
 *       with the acting user's id, full name and username. Restricted to the Administrator
 *       role by authorizeMinRole; other roles receive HTTP 403.
 *     tags: [Audit Log]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Case-insensitive match against tableName, recordId or fieldName
 *       - in: query
 *         name: tableName
 *         schema:
 *           type: string
 *         description: Exact table name filter, e.g. WorkOrder
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by action - Create, Update, Delete, Run
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *         description: Offset, default 0
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *         description: Page size, default 50
 *     responses:
 *       '200':
 *         description: Audit log page
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       auditId: { type: string }
 *                       tableName: { type: string }
 *                       recordId: { type: string }
 *                       action: { type: string }
 *                       fieldName: { type: string, nullable: true }
 *                       oldValue: { type: string, nullable: true }
 *                       newValue: { type: string, nullable: true }
 *                       ipAddress: { type: string, nullable: true }
 *                       timestamp: { type: string, format: date-time }
 *                       user:
 *                         type: object
 *                         properties:
 *                           userId: { type: string }
 *                           fullName: { type: string }
 *                           username: { type: string }
 *                 total: { type: integer }
 *                 skip: { type: integer }
 *                 take: { type: integer }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller is not an Administrator
 *       '500':
 *         description: Internal server error
 */
router.get('/', authorizeMinRole('Administrator'), async (req: Request, res: Response) => {
  try {
    const { search, tableName, action, skip, take } = req.query;
    const where: any = {};

    if (search) {
      where.OR = [
        { tableName: { contains: search as string, mode: 'insensitive' } },
        { recordId: { contains: search as string, mode: 'insensitive' } },
        { fieldName: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    if (tableName) where.tableName = tableName as string;
    if (action) where.action = action as string;

    const skipNum = skip ? parseInt(skip as string, 10) : 0;
    const takeNum = take ? parseInt(take as string, 10) : 50;

    const [entries, total] = await Promise.all([
      prisma.auditLogEntry.findMany({
        where,
        include: {
          user: { select: { userId: true, fullName: true, username: true } },
        },
        orderBy: { timestamp: 'desc' },
        skip: skipNum,
        take: takeNum,
      }),
      prisma.auditLogEntry.count({ where }),
    ]);

    res.json({ data: entries, total, skip: skipNum, take: takeNum });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching audit log');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

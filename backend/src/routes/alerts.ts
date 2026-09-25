import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/alerts:
 *   get:
 *     summary: List alerts for the current user
 *     description: >
 *       Returns every SystemAlert addressed to the authenticated user, newest first.
 *       Scoped by userId, so one user can never read another user's alerts.
 *     tags: [Alerts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Alerts for the current user
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   alertId: { type: string }
 *                   alertType: { type: string }
 *                   userId: { type: string }
 *                   title: { type: string }
 *                   message: { type: string }
 *                   isRead: { type: boolean }
 *                   createdDate: { type: string, format: date-time }
 *                   relatedEntityType: { type: string, nullable: true }
 *                   relatedEntityId: { type: string, nullable: true }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
/**
 * @openapi
 * /api/alerts/unread-count:
 *   get:
 *     summary: Unread alert count for the current user
 *     description: >
 *       Lightweight badge endpoint. Returns only a count so the UI can poll it cheaply.
 *     tags: [Alerts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Unread count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count: { type: integer }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
/**
 * @openapi
 * /api/alerts/read-all:
 *   put:
 *     summary: Mark all of the current user's alerts as read
 *     description: >
 *       Bulk update of every unread alert owned by the authenticated user. Writes one
 *       AuditLogEntry with fieldName "read-all". Declared before /:id/read so the literal
 *       segment is not captured by the parameterised route.
 *     tags: [Alerts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: All alerts marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "All alerts marked as read" }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Requester
 *       '500':
 *         description: Internal server error
 */
/**
 * @openapi
 * /api/alerts/{id}/read:
 *   put:
 *     summary: Mark one alert as read
 *     description: >
 *       Marks a single alert as read. The alert must belong to the authenticated user;
 *       a mismatch returns HTTP 404 rather than 403 so the endpoint does not confirm the
 *       existence of another user's alert.
 *     tags: [Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: SystemAlert alertId
 *     responses:
 *       '200':
 *         description: The updated alert
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 alertId: { type: string }
 *                 alertType: { type: string }
 *                 userId: { type: string }
 *                 title: { type: string }
 *                 message: { type: string }
 *                 isRead: { type: boolean }
 *                 createdDate: { type: string, format: date-time }
 *                 relatedEntityType: { type: string, nullable: true }
 *                 relatedEntityId: { type: string, nullable: true }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Requester
 *       '404':
 *         description: Alert not found for this user
 *       '500':
 *         description: Internal server error
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const alerts = await prisma.systemAlert.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdDate: 'desc' },
    });

    res.json(alerts);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching alerts');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/unread-count', async (req: Request, res: Response) => {
  try {
    const count = await prisma.systemAlert.count({
      where: { userId: req.user!.userId, isRead: false },
    });

    res.json({ count });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching unread alert count');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/read-all', authorizeMinRole('Requester'), async (req: Request, res: Response) => {
  try {
    await prisma.systemAlert.updateMany({
      where: { userId: req.user!.userId, isRead: false },
      data: { isRead: true },
    });

    await logAudit(
      { tableName: 'SystemAlert', recordId: req.user!.userId, action: 'Update', fieldName: 'read-all' },
      req.user!.userId,
      req.ip
    );

    res.json({ message: 'All alerts marked as read' });
  } catch (error) {
    logger.error({ err: error }, 'Error marking all alerts as read');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id/read', authorizeMinRole('Requester'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.systemAlert.findFirst({
      where: { alertId: id, userId: req.user!.userId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    const alert = await prisma.systemAlert.update({
      where: { alertId: id },
      data: { isRead: true },
    });

    await logAudit(
      { tableName: 'SystemAlert', recordId: id, action: 'Update', fieldName: 'read' },
      req.user!.userId,
      req.ip
    );

    res.json(alert);
  } catch (error) {
    logger.error({ err: error }, 'Error marking alert as read');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

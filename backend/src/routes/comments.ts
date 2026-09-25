import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { validate, commentCreateSchema } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/comments:
 *   get:
 *     summary: List comments for an entity
 *     description: >
 *       Comments are polymorphic: they attach to a target identified by the entityType and
 *       entityId pair, not by a foreign key. Both query parameters are required and the
 *       endpoint returns HTTP 400 without them. Comments are returned newest first, each
 *       with the author's userId, fullName and username.
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: entityType
 *         required: true
 *         schema:
 *           type: string
 *         description: Target type - WorkOrder, Notification or Equipment
 *         example: WorkOrder
 *       - in: query
 *         name: entityId
 *         required: true
 *         schema:
 *           type: string
 *         description: Primary key of the target row
 *     responses:
 *       '200':
 *         description: Comments for the entity, newest first
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   commentId: { type: string }
 *                   entityType: { type: string }
 *                   entityId: { type: string }
 *                   content: { type: string }
 *                   createdDate: { type: string, format: date-time }
 *                   user:
 *                     type: object
 *                     properties:
 *                       userId: { type: string }
 *                       fullName: { type: string }
 *                       username: { type: string }
 *       '400':
 *         description: entityType or entityId missing
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 *   post:
 *     summary: Add a comment to an entity
 *     description: >
 *       Validated by the zod schema `commentCreateSchema` (see utils/validation.ts) via the
 *       validate middleware. The author is taken from the bearer token, not from the body.
 *       Writes an AuditLogEntry with action Create.
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `commentCreateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [entityType, entityId, content]
 *             properties:
 *               entityType:
 *                 type: string
 *                 description: WorkOrder, Notification or Equipment
 *                 example: WorkOrder
 *               entityId:
 *                 type: string
 *               content:
 *                 type: string
 *     responses:
 *       '201':
 *         description: Comment created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 commentId: { type: string }
 *                 entityType: { type: string }
 *                 entityId: { type: string }
 *                 content: { type: string }
 *                 createdDate: { type: string, format: date-time }
 *                 user:
 *                   type: object
 *                   properties:
 *                     userId: { type: string }
 *                     fullName: { type: string }
 *                     username: { type: string }
 *       '400':
 *         description: zod validation failed
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Requester
 *       '500':
 *         description: Internal server error
 */
/**
 * @openapi
 * /api/comments/{id}:
 *   delete:
 *     summary: Delete a comment
 *     description: >
 *       Hard delete - Comment has no isDeleted column, per rule 3.4 the parent entity is the
 *       soft-delete boundary. Only the comment's own author or an Administrator may delete
 *       it; anyone else receives HTTP 403. Writes an AuditLogEntry with action Delete.
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Comment commentId
 *     responses:
 *       '200':
 *         description: Comment deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Comment deleted successfully" }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller is neither the comment author nor an Administrator
 *       '404':
 *         description: Comment not found
 *       '500':
 *         description: Internal server error
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.query;
    if (!entityType || !entityId) {
      return res.status(400).json({ error: 'entityType and entityId query parameters are required' });
    }

    const comments = await prisma.comment.findMany({
      where: { entityType: entityType as string, entityId: entityId as string },
      include: { user: { select: { userId: true, fullName: true, username: true } } },
      orderBy: { createdDate: 'desc' },
    });

    res.json(comments);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching comments');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authorizeMinRole('Requester'), validate(commentCreateSchema), async (req: Request, res: Response) => {
  try {
    const { entityType, entityId, content } = req.body;

    const comment = await prisma.comment.create({
      data: {
        entityType,
        entityId,
        userId: req.user!.userId,
        content,
      },
      include: { user: { select: { userId: true, fullName: true, username: true } } },
    });

    await logAudit(
      { tableName: 'Comment', recordId: comment.commentId, action: 'Create' },
      req.user!.userId,
      req.ip
    );

    res.status(201).json(comment);
  } catch (error) {
    logger.error({ err: error }, 'Error creating comment');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3.4: Comment carries no isDeleted column — hard delete is deliberate (user-entered text is
// removed from the live entity thread; the entity itself is the soft-delete boundary).
router.delete('/:id', authorizeMinRole('Requester'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.comment.findUnique({
      where: { commentId: id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    if (existing.userId !== req.user!.userId && req.user!.role !== 'Administrator') {
      return res.status(403).json({ error: 'Only the comment author or an administrator can delete this comment' });
    }

    await prisma.comment.delete({
      where: { commentId: id },
    });

    await logAudit(
      { tableName: 'Comment', recordId: id, action: 'Delete' },
      req.user!.userId,
      req.ip
    );

    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting comment');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
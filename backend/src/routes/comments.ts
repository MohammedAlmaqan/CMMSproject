import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { validate, commentCreateSchema } from '../utils/validation.js';

const router = Router();

router.use(authenticate);

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
    console.error('Error fetching comments:', error);
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
    console.error('Error creating comment:', error);
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
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
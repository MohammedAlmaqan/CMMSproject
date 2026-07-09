import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';

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

router.post('/', async (req: Request, res: Response) => {
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

    res.status(201).json(comment);
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.comment.findUnique({
      where: { commentId: id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    await prisma.comment.delete({
      where: { commentId: id },
    });

    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

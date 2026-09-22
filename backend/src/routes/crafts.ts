import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', async (_req: Request, res: Response) => {
  try {
    const crafts = await prisma.craft.findMany({
      where: { isDeleted: false },
      orderBy: { craftCode: 'asc' },
    });

    res.json(crafts);
  } catch (error) {
    console.error('Error fetching crafts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
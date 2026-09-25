import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

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
    logger.error({ err: error }, 'Error fetching crafts');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
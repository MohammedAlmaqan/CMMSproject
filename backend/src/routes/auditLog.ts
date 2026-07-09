import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
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
    console.error('Error fetching audit log:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

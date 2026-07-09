import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

function buildTree(flat: any[]): any[] {
  const map = new Map<string, any>();
  const roots: any[] = [];

  for (const item of flat) {
    map.set(item.failureCodeId, { ...item, children: [] });
  }

  for (const item of flat) {
    const node = map.get(item.failureCodeId)!;
    if (item.parentCodeId && map.has(item.parentCodeId)) {
      map.get(item.parentCodeId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const search = req.query.search as string | undefined;
    const where: any = { isDeleted: false };

    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const codes = await prisma.failureCode.findMany({
      where,
      orderBy: { code: 'asc' },
    });

    res.json(codes);
  } catch (error) {
    console.error('Error fetching failure codes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/tree', async (_req: Request, res: Response) => {
  try {
    const codes = await prisma.failureCode.findMany({
      where: { isDeleted: false },
      orderBy: { code: 'asc' },
    });

    const tree = buildTree(codes);
    res.json(tree);
  } catch (error) {
    console.error('Error fetching failure code tree:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const code = await prisma.failureCode.findFirst({
      where: { failureCodeId: String(req.params.id), isDeleted: false },
      include: {
        parent: true,
        children: { where: { isDeleted: false } },
      },
    });

    if (!code) {
      return res.status(404).json({ error: 'Failure code not found' });
    }

    res.json(code);
  } catch (error) {
    console.error('Error fetching failure code:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { parentCodeId, code, description } = req.body;

    const failureCode = await prisma.failureCode.create({
      data: {
        parentCodeId: parentCodeId || null,
        code,
        description,
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
      },
    });

    res.status(201).json(failureCode);
  } catch (error: any) {
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Referenced parent failure code not found' });
    }
    console.error('Error creating failure code:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.failureCode.findFirst({
      where: { failureCodeId: String(req.params.id), isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Failure code not found' });
    }

    const { parentCodeId, code, description } = req.body;

    const failureCode = await prisma.failureCode.update({
      where: { failureCodeId: String(req.params.id) },
      data: {
        ...(parentCodeId !== undefined && { parentCodeId: parentCodeId || null }),
        ...(code !== undefined && { code }),
        ...(description !== undefined && { description }),
        modifiedBy: req.user!.userId,
      },
    });

    res.json(failureCode);
  } catch (error: any) {
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Referenced parent failure code not found' });
    }
    console.error('Error updating failure code:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.failureCode.findFirst({
      where: { failureCodeId: String(req.params.id), isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Failure code not found' });
    }

    await prisma.failureCode.update({
      where: { failureCodeId: String(req.params.id) },
      data: {
        isDeleted: true,
        modifiedBy: req.user!.userId,
      },
    });

    res.json({ message: 'Failure code deleted successfully' });
  } catch (error) {
    console.error('Error deleting failure code:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

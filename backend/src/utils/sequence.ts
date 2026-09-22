import { PrismaClient } from '@prisma/client';
import { prisma } from './prisma.js';

export async function nextSequence(db: PrismaClient, code: string): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const row = await db.sequenceCounter.upsert({
        where: { code },
        update: { value: { increment: 1 } },
        create: { code, value: 1 },
      });
      return row.value;
    } catch (error: any) {
      if (error.code !== 'P2002') throw error;
    }
  }
  throw new Error(`Unable to allocate sequence for ${code}`);
}

export async function generateWoNumber(): Promise<string> {
  const prefixConfig = await prisma.systemConfig.findUnique({ where: { key: 'wo_number_prefix' } });
  const prefix = prefixConfig?.value || 'WO';
  const sequence = await nextSequence(prisma, 'WORK_ORDER');
  return `${prefix}-${String(sequence).padStart(6, '0')}`;
}

export async function generateNotifNumber(): Promise<string> {
  const prefixConfig = await prisma.systemConfig.findUnique({ where: { key: 'notif_number_prefix' } });
  const prefix = prefixConfig?.value || 'N';
  const sequence = await nextSequence(prisma, 'NOTIFICATION');
  return `${prefix}-${String(sequence).padStart(6, '0')}`;
}
import { prisma } from './prisma.js';
import { computeWorkOrderCosts, roundMoney } from './costRules.js';
import type { WorkOrderCostInput } from './costRules.js';
import { logAuditFieldChange } from '../middleware/audit.js';
import type { Prisma, PrismaClient } from '@prisma/client';

/** Who caused a recompute. Required, so a cost change can never land in the
 *  database without someone attached to it. */
export interface CostActor {
  userId: string;
  ipAddress: string | undefined;
}

/** The part of a Prisma client a recompute touches, including the audit table so
 *  the same value can be handed to `logAuditFieldChange`. Both a `PrismaClient`
 *  and a `Prisma.TransactionClient` satisfy it, which is what lets one helper
 *  serve request-scoped and in-transaction callers alike. */
type CostDb = Pick<
  PrismaClient,
  'workOrder' | 'workOrderOperation' | 'workOrderMaterial' | 'externalServiceCost' | 'laborEntry' | 'auditLogEntry'
>;

/**
 * Recompute a work order's stored planned and actual cost from its base
 * relations.
 *
 * `client` is optional and defaults to the global client, so the fourteen
 * existing call sites are unchanged. Pass a transaction client to make the
 * recompute part of the caller's transaction: the reads must then run on the
 * same client, because a global client cannot see rows the open transaction has
 * written but not yet committed, and would compute zero for work whose
 * operations were created a moment earlier in the same transaction.
 *
 * The cost columns and their audit rows are written on the same client for the
 * same reason: an audit row that outlived a rolled-back cost change, or a cost
 * change that committed without its audit row, would each be a silent lie in
 * the trail. Passing a transaction client therefore makes a *successful* audit
 * write atomic with the cost it describes.
 *
 * It does not make a *failed* audit write fatal. `logAuditFieldChange` catches
 * and logs its own errors (see `middleware/audit.ts`), by long-standing policy:
 * a missing audit row must not fail the request that caused it. So the
 * guarantee a transaction buys here is on the cost - derived figure and stored
 * figure commit together, or neither does - not on the audit row. Making audit
 * failures fatal is a separate policy question this module does not decide.
 */
export async function recomputeWorkOrderCosts(
  workOrderId: string,
  actor: CostActor,
  client: CostDb | Prisma.TransactionClient = prisma,
) {
  // Read the stored figures first: a recompute that lands on the same numbers
  // is not a change, and writing an audit row for it would pad the trail with
  // events an auditor has to read past to find the real ones.
  const prior = await client.workOrder.findUnique({
    where: { workOrderId },
    select: { plannedCost: true, actualCost: true },
  });

  const [operations, woMaterials, externalServices, laborEntries] = await Promise.all([
    client.workOrderOperation.findMany({
      where: { workOrderId, isDeleted: false },
      include: { craft: true },
    }),
    client.workOrderMaterial.findMany({ where: { workOrderId, isDeleted: false } }),
    client.externalServiceCost.findMany({ where: { workOrderId, isDeleted: false } }),
    client.laborEntry.findMany({
      where: { isDeleted: false, operation: { workOrderId, isDeleted: false } },
      include: { operation: { include: { craft: true } } },
    }),
  ]);

  // The arithmetic is in utils/costRules.ts so it can be tested as arithmetic.
  // Prisma rows satisfy the input shape structurally: an absent relation or a
  // null numeric column arrives here as null, which the pure function treats
  // as zero rather than propagating NaN into a stored cost.
  const input = {
    operations,
    woMaterials,
    externalServices,
    laborEntries,
  } as unknown as WorkOrderCostInput;

  const costs = computeWorkOrderCosts(input);

  const plannedCost = roundMoney(costs.plannedCost);
  const actualCost = roundMoney(costs.actualCost);

  await client.workOrder.update({
    where: { workOrderId },
    data: { plannedCost, actualCost },
  });

  // One row per figure that actually moved, naming the field so the trail
  // says which number changed rather than only that "costs" changed.
  // String() keeps this correct if D-17 later moves the columns to Decimal.
  if (prior && Number(prior.plannedCost) !== plannedCost) {
    await logAuditFieldChange({
      table: 'WorkOrder',
      recordId: workOrderId,
      action: 'Update',
      field: 'plannedCost',
      oldValue: String(prior.plannedCost),
      newValue: String(plannedCost),
      userId: actor.userId,
      ipAddress: actor.ipAddress,
      db: client,
    });
  }
  if (prior && Number(prior.actualCost) !== actualCost) {
    await logAuditFieldChange({
      table: 'WorkOrder',
      recordId: workOrderId,
      action: 'Update',
      field: 'actualCost',
      oldValue: String(prior.actualCost),
      newValue: String(actualCost),
      userId: actor.userId,
      ipAddress: actor.ipAddress,
      db: client,
    });
  }

  // Returns the figures as written, not the raw ones from `computeWorkOrderCosts`.
  // The rounded values are what the columns now hold, so a caller that goes on to
  // record this work order's cost somewhere else -- a WorkOrderSnapshot, say --
  // records the same number the database holds. Handing back the unrounded pair
  // would let the two disagree by a fraction of a cent, which is precisely the
  // kind of drift the derived figure exists to prevent.
  return { plannedCost, actualCost };
}

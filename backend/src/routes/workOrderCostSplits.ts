import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAuditFieldChange, changedFields, auditMiddleware } from '../middleware/audit.js';
import { validate, costSplitReplaceSchema } from '../utils/validation.js';
import { checkAllocation, describeProblem, allocate } from '../utils/costSplits.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.use(authenticate);

// SOW 3.5.2: cost splitting when a work order covers more than one cost centre.
// The CostSplit model existed and was already returned by the work order read,
// but nothing created or changed a row and nothing checked the total. That is
// the dangerous half: an unvalidated set of percentages leaves a work order 60%
// allocated and the 3.5.1 figures then reconcile to nothing.
//
// The allocation is written as a WHOLE SET, not line by line, and that is a
// deliberate design decision rather than a convenience. "These percentages total
// 100%" is a property of the set, so it cannot be enforced by validating each
// line as it arrives: the first line of a two-way split is incomplete by
// definition, and a per-line rule would make the feature impossible to use. So
// there is one replace endpoint that takes the whole allocation, validates it as
// a unit, and writes it in a transaction. A DELETE of the final line returns the
// work order to being unallocated, which is a legal end state.

/**
 * @openapi
 * /api/work-order-cost-splits:
 *   get:
 *     summary: List the cost allocation for a work order
 *     description: >
 *       Returns the percentage allocation of one work order's cost across cost
 *       centres, with each share of the work order's actual cost. Splitting is
 *       opt-in: a work order with no rows is charged wholly to its own single
 *       cost centre. allocatedActualCost values always re-add to actualCost,
 *       because the remainder is distributed largest-share-first rather than
 *       rounded independently per line.
 *     tags: [CostSplits]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: workOrderId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       '200':
 *         description: The allocation, with allocated amounts
 *       '400':
 *         description: workOrderId query parameter is required
 *       '401':
 *         description: Missing or invalid bearer token
 *       '404':
 *         description: Work order not found
 *       '500':
 *         description: Internal server error
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const workOrderId = req.query.workOrderId as string | undefined;
    if (!workOrderId) {
      return res.status(400).json({ error: 'workOrderId query parameter is required' });
    }

    const workOrder = await prisma.workOrder.findFirst({
      where: { workOrderId, isDeleted: false },
      select: { workOrderId: true, actualCost: true, plannedCost: true, costCenterCode: true },
    });
    if (!workOrder) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const splits = await prisma.costSplit.findMany({
      where: { workOrderId, isDeleted: false },
      orderBy: { costCenterCode: 'asc' },
    });

    // Reported against actualCost, the figure 3.5.1 reports and the one a cost
    // centre is actually charged.
    const amounts = allocate(Number(workOrder.actualCost || 0), splits);
    const allocated = splits.map((split, index) => ({
      ...split,
      allocatedActualCost: amounts[index],
    }));

    const total = splits.reduce((sum, split) => sum + split.percentage, 0);

    res.json({
      workOrderId,
      workOrderCostCenterCode: workOrder.costCenterCode,
      actualCost: workOrder.actualCost,
      plannedCost: workOrder.plannedCost,
      splits: allocated,
      totalPercentage: total,
      isBalanced: splits.length === 0 || Math.abs(total - 100) < 1e-6,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching cost splits');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/work-order-cost-splits:
 *   put:
 *     summary: Replace a work order's cost allocation
 *     description: >
 *       Replaces the entire allocation for one work order. The submitted set is
 *       validated as a unit and must total 100%; an empty array clears the
 *       allocation and returns the work order to being charged to its own cost
 *       centre. Replacement is atomic, so a rejected set leaves the previous
 *       allocation untouched rather than half-applied.
 *     tags: [CostSplits]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [workOrderId, splits]
 *             properties:
 *               workOrderId: { type: string }
 *               splits:
 *                 type: array
 *                 description: Must total 100 when non-empty. May be empty to clear.
 *                 items:
 *                   type: object
 *                   required: [costCenterCode, percentage]
 *                   properties:
 *                     costCenterCode: { type: string }
 *                     percentage: { type: number, exclusiveMinimum: 0, exclusiveMaximum: 100 }
 *     responses:
 *       '200':
 *         description: Allocation replaced
 *       '400':
 *         description: Validation failed, or the allocation does not total 100%
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Maintenance Planner
 *       '404':
 *         description: Work order not found
 *       '500':
 *         description: Internal server error
 */
router.put('/', authorizeMinRole('Maintenance Planner'), validate(costSplitReplaceSchema), async (req: Request, res: Response) => {
  try {
    const { workOrderId, splits } = req.body;

    const workOrder = await prisma.workOrder.findFirst({
      where: { workOrderId, isDeleted: false },
      select: { workOrderId: true },
    });
    if (!workOrder) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const check = checkAllocation(splits);
    if (!check.ok) {
      return res.status(400).json({ error: describeProblem(check.problem) });
    }

    const removed = await prisma.costSplit.findMany({
      where: { workOrderId, isDeleted: false },
      select: { splitId: true, costCenterCode: true, percentage: true },
    });

    // Replace, do not upsert-per-line: a transaction is what makes a rejected
    // validation and a successful write mutually exclusive here. The previous
    // lines are retired (isDeleted=true) rather than destroyed, so the audit
    // trail keeps the allocation history.
    const updated = await prisma.$transaction(async (tx) => {
      await tx.costSplit.updateMany({ where: { workOrderId, isDeleted: false }, data: { isDeleted: true, modifiedBy: req.user!.userId } });
      if (splits.length === 0) {
        return [];
      }
      const created = [];
      for (const split of splits) {
        created.push(await tx.costSplit.create({
          data: { workOrderId, costCenterCode: split.costCenterCode, percentage: split.percentage, createdBy: req.user!.userId, modifiedBy: req.user!.userId },
        }));
      }
      return created;
    });

    // One set-level diff rather than a per-line diff: the allocation's meaning
    // is the whole set (the percentages must total 100), so the audit row
    // records the old and new allocation as ordered JSON. Sorted by cost centre
    // so an unchanged set cannot appear changed only because rows came back in
    // a different order.
    const byCostCenter = (a: { costCenterCode: string }, b: { costCenterCode: string }) =>
      a.costCenterCode.localeCompare(b.costCenterCode);
    const beforeSet = removed
      .map((s) => ({ costCenterCode: s.costCenterCode, percentage: s.percentage }))
      .sort(byCostCenter);
    const afterSet = updated
      .map((s) => ({ costCenterCode: s.costCenterCode, percentage: s.percentage }))
      .sort(byCostCenter);

    const setChange = changedFields(
      { costAllocation: beforeSet },
      { costAllocation: afterSet },
      ['costAllocation']
    );
    if (setChange.length > 0) {
      await logAuditFieldChange({
        table: 'CostSplit',
        recordId: workOrderId,
        action: 'Update',
        field: setChange[0].field,
        oldValue: setChange[0].oldValue,
        newValue: setChange[0].newValue,
        userId: req.user!.userId,
        ipAddress: req.ip,
      });
    }

    res.json({
      workOrderId,
      splits: updated,
      replacedCount: removed.length,
      totalPercentage: check.total,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error replacing cost splits');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/work-order-cost-splits/{id}:
 *   delete:
 *     summary: Clear a work order's cost allocation
 *     description: >
 *       Retires the named split line (isDeleted=true) and re-validates what is
 *       left, so a work order is never left with a partial allocation. Deleting
 *       the final line
 *       is allowed: the work order then reverts to being charged wholly to its
 *       own cost centre, which is a valid end state.
 *     tags: [CostSplits]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: CostSplit splitId
 *     responses:
 *       '200':
 *         description: Cost split deleted
 *       '400':
 *         description: The remaining allocation would not total 100%
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Maintenance Supervisor
 *       '404':
 *         description: Cost split not found
 *       '500':
 *         description: Internal server error
 */
router.delete('/:id', authorizeMinRole('Maintenance Supervisor'), auditMiddleware('CostSplit'), async (req: Request, res: Response) => {
  try {
    const splitId = String(req.params.id);
    const existing = await prisma.costSplit.findFirst({ where: { splitId, isDeleted: false } });
    if (!existing) {
      return res.status(404).json({ error: 'Cost split not found' });
    }

    const remaining = await prisma.costSplit.findMany({
      where: { workOrderId: existing.workOrderId, isDeleted: false, NOT: { splitId } },
      select: { costCenterCode: true, percentage: true },
    });
    const check = checkAllocation(remaining);
    if (!check.ok) {
      return res.status(400).json({ error: describeProblem(check.problem) });
    }

    await prisma.costSplit.update({ where: { splitId }, data: { isDeleted: true, modifiedBy: req.user!.userId } });

    res.json({ message: 'Cost split deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting cost split');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

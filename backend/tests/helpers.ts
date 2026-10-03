import request from 'supertest';
import app from '../src/index.js';
import { prisma } from '../src/utils/prisma.js';

export function api() {
  return request(app);
}

export function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * R.9 D3. Hard-delete helpers for test fixtures.
 *
 * The suite runs against a live database that `prisma/seed.ts` only wipes when
 * SEED_DEMO=1, so nothing prunes what a test leaves behind and residue
 * accumulates one gate run at a time. Measured over one full gate run, 20 of
 * the 35 DB-backed files left 220 rows behind, and a soft-deleted row counts:
 * excluding `isDeleted` from the cleanup would hide the residue precisely
 * because a test had marked it deleted.
 *
 * These hard-delete on purpose. The product's DELETE endpoints soft-delete,
 * which is right for a user and wrong for a fixture, so a teardown that goes
 * through the API leaves a row that is still a row.
 *
 * Delete order is child-first, and it is not negotiable: this schema is full
 * of RESTRICT edges (a work order's snapshots, operations, cost splits,
 * materials, checklists and external services all restrict it; a plan's meters
 * restrict it while its targets cascade; a craft is restricted by both kinds of
 * operation; a work centre by crafts, plans, task lists and work orders). Most
 * of these teardowns used to end in `.catch(() => {})`, so the P2003 that a
 * wrong order produces was swallowed and the rows stayed. Nothing here
 * swallows: a cleanup that cannot finish should fail the test loudly rather
 * than leave evidence behind quietly.
 */

function clean(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => typeof v === 'string' && v.length > 0))];
}

/**
 * Audit rows name the record they describe but hold no foreign key, so deleting
 * the record leaves the row behind, describing something that no longer exists.
 * Call this alongside every other purge, or the audit table grows just as fast
 * as the tables you did clean - which, measured, is exactly what happened.
 */
export async function purgeAudit(recordIds: (string | null | undefined)[]): Promise<void> {
  const ids = clean(recordIds);
  if (ids.length === 0) return;
  await prisma.auditLogEntry.deleteMany({ where: { recordId: { in: ids } } });
}

/* Some activity the suite performs is a real change to a real row: logging in
 * updates the account's login state, and "mark every alert read" is a bulk event
 * that audits under the acting user instead of under a fixture. Neither can be
 * cleaned up by record id, because neither has a fixture id to clean up by, and
 * a blanket sweep by actor or timestamp would be worse: the same rows exist in
 * the baseline - the suite mints its tokens by logging in before any file runs -
 * so deleting them wholesale shows up as rows *disappearing*, which breaks the
 * invariance check just as surely as leaving them behind.
 *
 * These two helpers scope the cleanup to what a file actually added: snapshot
 * the ids that already existed, then delete only rows outside that snapshot.
 * Nothing that was there before a file started can be removed by mistake, and
 * everything the file caused is removed even though the row it describes is
 * master data the file was only supposed to be borrowing. */

export async function auditIdsMatching(where: Record<string, unknown>): Promise<string[]> {
  const rows = await prisma.auditLogEntry.findMany({ where, select: { auditId: true } });
  return rows.map((r) => r.auditId);
}

/** Delete audit rows matching `where` that were not already present in `baseline`. */
export async function purgeNewAudit(baseline: string[], where: Record<string, unknown>): Promise<void> {
  await prisma.auditLogEntry.deleteMany({
    where: { AND: [where as never, baseline.length > 0 ? { auditId: { notIn: baseline } } : {}] },
  });
}

export async function purgeWorkOrders(workOrderIds: (string | null | undefined)[]): Promise<void> {
  const ids = clean(workOrderIds);
  if (ids.length === 0) return;

  const orders = await prisma.workOrder.findMany({ where: { workOrderId: { in: ids } }, select: { workOrderId: true, woNumber: true } });
  const operationIds = (
    await prisma.workOrderOperation.findMany({ where: { workOrderId: { in: ids } }, select: { operationId: true } })
  ).map((o) => o.operationId);
  const checklistIds = (
    await prisma.workOrderChecklist.findMany({ where: { workOrderId: { in: ids } }, select: { woChecklistId: true } })
  ).map((c) => c.woChecklistId);
  // Check items audit under their own id, not the checklist's, so the ids have
  // to be collected before the items go - otherwise the last write of the run
  // is left describing a row that has been deleted.
  const checklistItemIds = (
    await prisma.workOrderChecklistItem.findMany({ where: { woChecklistId: { in: checklistIds } }, select: { woChecklistItemId: true } })
  ).map((i) => i.woChecklistItemId);
  const costSplitIds = (
    await prisma.costSplit.findMany({ where: { workOrderId: { in: ids } }, select: { splitId: true } })
  ).map((s) => s.splitId);
  const serviceCostIds = (
    await prisma.externalServiceCost.findMany({ where: { workOrderId: { in: ids } }, select: { serviceCostId: true } })
  ).map((s) => s.serviceCostId);
  const materialLineIds = (
    await prisma.workOrderMaterial.findMany({ where: { workOrderId: { in: ids } }, select: { woMaterialId: true } })
  ).map((m) => m.woMaterialId);
  const laborEntryIds = (
    await prisma.laborEntry.findMany({ where: { operationId: { in: operationIds } }, select: { laborEntryId: true } })
  ).map((l) => l.laborEntryId);

  // The routes raise a notification per work order and leave it unlinked, so the
  // only handle on those rows is the work order number in the description. The
  // number is unique to an order, which makes this a precise match rather than a
  // guess at a time window - important, because the test files run in parallel
  // and anything looser would delete another file's fixtures.
  const woNumbers = orders.map((o) => o.woNumber).filter((n): n is string => typeof n === 'string' && n.length > 0);
  const described = woNumbers.length > 0
    ? (
        await prisma.notification.findMany({
          where: { OR: woNumbers.map((n) => ({ description: { contains: n } })) },
          select: { notificationId: true },
        })
      ).map((n) => n.notificationId)
    : [];
  // Alerts point at the work order they announce through `relatedEntityId`, so
  // they are found by that column. Reading the plan code out of the message
  // instead - which is what this did first - matches nothing, because the code is
  // a code and the column holds an id.
  const alertIds = (
    await prisma.systemAlert.findMany({
      where: { relatedEntityType: 'WorkOrder', relatedEntityId: { in: ids } },
      select: { alertId: true },
    })
  ).map((a) => a.alertId);
  const linked = (
    await prisma.workOrderNotifLink.findMany({ where: { workOrderId: { in: ids } }, select: { notificationId: true } })
  ).map((l) => l.notificationId);

  await prisma.workOrderSnapshot.deleteMany({ where: { workOrderId: { in: ids } } });
  await prisma.costSplit.deleteMany({ where: { workOrderId: { in: ids } } });
  await prisma.workOrderNotifLink.deleteMany({ where: { workOrderId: { in: ids } } });
  await prisma.externalServiceCost.deleteMany({ where: { workOrderId: { in: ids } } });
  await prisma.workOrderMaterial.deleteMany({ where: { workOrderId: { in: ids } } });
  await prisma.workOrderChecklistItem.deleteMany({ where: { woChecklistId: { in: checklistIds } } });
  await prisma.workOrderChecklist.deleteMany({ where: { workOrderId: { in: ids } } });
  await prisma.laborEntry.deleteMany({ where: { operationId: { in: operationIds } } });
  await prisma.workOrderOperation.deleteMany({ where: { workOrderId: { in: ids } } });
  await prisma.workOrder.deleteMany({ where: { workOrderId: { in: ids } } });

  // Remove a notification only when nothing else still points at it, so one
  // this test merely referenced is never taken out from under a seed row.
  const notifiedIds = [...new Set([...described, ...linked])];
  const stillLinked = (
    await prisma.workOrderNotifLink.findMany({ where: { notificationId: { in: notifiedIds } }, select: { notificationId: true } })
  ).map((l) => l.notificationId);
  await prisma.notification.deleteMany({ where: { notificationId: { in: notifiedIds.filter((id) => !stillLinked.includes(id)) } } });
  await prisma.systemAlert.deleteMany({ where: { alertId: { in: alertIds } } });

  // Audit is not foreign keyed, and it is written for the child rows too, not
  // only the order: operations, checklists and their items, cost splits, external
  // services and material lines each leave an entry under their own id. Missing
  // those leaves rows describing tables that no longer hold the row, which is how
  // one file accounted for several audit rows while its work orders were gone.
  await purgeAudit([
    ...ids,
    ...operationIds,
    ...checklistIds,
    ...checklistItemIds,
    ...costSplitIds,
    ...serviceCostIds,
    ...materialLineIds,
    ...laborEntryIds,
    ...notifiedIds,
    ...alertIds,
  ]);
}

/* Generation names its notification after the plan's *code* ("Associated
 * notification for PMG-47-067e0ffa"), so the code is the only handle on that row -
 * the plan id does not appear in it, and the notification is linked to nothing.
 * Callers know the code because they chose it. */
export async function purgeNotificationsByPlanCode(planCodes: (string | null | undefined)[]): Promise<void> {
  const codes = clean(planCodes);
  if (codes.length === 0) return;
  const ids = (
    await prisma.notification.findMany({
      where: { OR: codes.map((c) => ({ description: { contains: c } })) },
      select: { notificationId: true },
    })
  ).map((n) => n.notificationId);
  await purgeNotifications(ids);
}

export async function purgeMaintenancePlans(planIds: (string | null | undefined)[]): Promise<void> {
  const ids = clean(planIds);
  if (ids.length === 0) return;

  // A plan's work orders are found rather than remembered: nothing hands a
  // test the id of a row the scheduler created, and a missed one is exactly the
  // orphan this whole step exists to remove.
  await purgeWorkOrders(
    (await prisma.workOrder.findMany({ where: { sourcePlanId: { in: ids } }, select: { workOrderId: true } })).map((w) => w.workOrderId)
  );
  // Alerts carry the id of the row they announce in `relatedEntityId`, so a plan
  // alert is found by matching that column against the plan ids. Reading the plan
  // code out of the alert message instead - which is what this first attempt did -
  // matches nothing, because a code is not an id.
  const alertIds = (
    await prisma.systemAlert.findMany({
      where: { OR: ids.map((id) => ({ relatedEntityId: id })) },
      select: { alertId: true },
    })
  ).map((a) => a.alertId);

  // A plan's meters restrict the plan, so they go first. Their readings belong to
  // the equipment meter, which this never touches, so there is nothing to clean up
  // underneath them.
  await prisma.maintenancePlanMeter.deleteMany({ where: { planId: { in: ids } } });
  await prisma.maintenancePlanTarget.deleteMany({ where: { planId: { in: ids } } });
  await prisma.maintenancePlan.deleteMany({ where: { planId: { in: ids } } });

  await purgeAlerts(alertIds);
  await purgeAudit([...ids, ...alertIds]);
}

export async function purgeTaskLists(taskListIds: (string | null | undefined)[]): Promise<void> {
  const ids = clean(taskListIds);
  if (ids.length === 0) return;
  const operationIds = (
    await prisma.taskListOperation.findMany({ where: { taskListId: { in: ids } }, select: { taskOperationId: true } })
  ).map((o) => o.taskOperationId);
  await prisma.taskListMaterial.deleteMany({ where: { taskOperationId: { in: operationIds } } });
  await prisma.taskListOperation.deleteMany({ where: { taskListId: { in: ids } } });
  await prisma.taskList.deleteMany({ where: { taskListId: { in: ids } } });
  await purgeAudit(ids);
}

export async function purgeCrafts(craftIds: (string | null | undefined)[]): Promise<void> {
  const ids = clean(craftIds);
  if (ids.length === 0) return;
  // Both operation tables restrict a craft, and so do the things hanging off a
  // task list operation. Work orders first, then the material lines attached to
  // a task list operation, then the operation itself: deleting the operation
  // while its materials are still pointing at it raises P2003, and the whole
  // teardown has to finish rather than leave the craft behind. Everything is
  // scoped to these ids, so a seed operation sharing the table is never touched.
  await purgeWorkOrders(
    (await prisma.workOrder.findMany({
      where: { operations: { some: { craftId: { in: ids } } } },
      select: { workOrderId: true },
    })).map((w) => w.workOrderId)
  );
  const taskOperationIds = (
    await prisma.taskListOperation.findMany({ where: { craftId: { in: ids } }, select: { taskOperationId: true } })
  ).map((o) => o.taskOperationId);
  await prisma.taskListMaterial.deleteMany({ where: { taskOperationId: { in: taskOperationIds } } });
  await prisma.taskListOperation.deleteMany({ where: { craftId: { in: ids } } });
  await prisma.craft.deleteMany({ where: { craftId: { in: ids } } });
  await purgeAudit([...ids, ...taskOperationIds]);
}

export async function purgeMaterials(materialIds: (string | null | undefined)[]): Promise<void> {
  const ids = clean(materialIds);
  if (ids.length === 0) return;
  await prisma.equipmentBOMMaterial.deleteMany({ where: { materialId: { in: ids } } });
  await prisma.taskListMaterial.deleteMany({ where: { materialId: { in: ids } } });
  await prisma.workOrderMaterial.deleteMany({ where: { materialId: { in: ids } } });
  await prisma.material.deleteMany({ where: { materialId: { in: ids } } });
  await purgeAudit(ids);
}

export async function purgeWorkCenters(workCenterIds: (string | null | undefined)[]): Promise<void> {
  const ids = clean(workCenterIds);
  if (ids.length === 0) return;
  // A work centre is restricted by crafts, plans, task lists and work orders, so
  // everything hanging off it goes first. Scoped to these ids throughout, which
  // is what keeps this from touching seed data at a different centre.
  await purgeCrafts(
    (await prisma.craft.findMany({ where: { workCenterId: { in: ids } }, select: { craftId: true } })).map((c) => c.craftId)
  );
  await purgeTaskLists(
    (await prisma.taskList.findMany({ where: { workCenterId: { in: ids } }, select: { taskListId: true } })).map((t) => t.taskListId)
  );
  await purgeMaintenancePlans(
    (await prisma.maintenancePlan.findMany({ where: { workCenterId: { in: ids } }, select: { planId: true } })).map((p) => p.planId)
  );
  await purgeWorkOrders(
    (await prisma.workOrder.findMany({ where: { workCenterId: { in: ids } }, select: { workOrderId: true } })).map((w) => w.workOrderId)
  );
  await prisma.workCenter.deleteMany({ where: { workCenterId: { in: ids } } });
  await purgeAudit(ids);
}

export async function purgeNotifications(notificationIds: (string | null | undefined)[]): Promise<void> {
  const ids = clean(notificationIds);
  if (ids.length === 0) return;
  // Row 72 writes one `SystemAlert` per triage recipient for a High-priority
  // notification, related through `relatedEntityId`. A teardown that removes the
  // notification but not its alerts leaves a row pointing at nothing, which the
  // invariance check reports. They are found by the notification id, not by
  // title, because an id is exact and a title is not.
  const alertIds = (
    await prisma.systemAlert.findMany({
      where: { relatedEntityType: 'Notification', relatedEntityId: { in: ids } },
      select: { alertId: true },
    })
  ).map((a) => a.alertId);
  await prisma.workOrderNotifLink.deleteMany({ where: { notificationId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { notificationId: { in: ids } } });
  await purgeAlerts(alertIds);
  await purgeAudit(ids);
}

export async function purgeAlerts(alertIds: (string | null | undefined)[]): Promise<void> {
  const ids = clean(alertIds);
  if (ids.length === 0) return;
  await prisma.systemAlert.deleteMany({ where: { alertId: { in: ids } } });
  await purgeAudit(ids);
}

export async function purgeFailureCodes(ids: (string | null | undefined)[]): Promise<void> {
  const cleanIds = clean(ids);
  if (cleanIds.length === 0) return;
  await prisma.failureCode.deleteMany({ where: { failureCodeId: { in: cleanIds } } });
  await purgeAudit(cleanIds);
}

export async function purgeCauseCodes(ids: (string | null | undefined)[]): Promise<void> {
  const cleanIds = clean(ids);
  if (cleanIds.length === 0) return;
  // The WorkOrder FK is ON DELETE SET NULL, so work orders that named a cause
  // being purged are unlinked rather than left dangling.
  await prisma.causeCode.deleteMany({ where: { causeCodeId: { in: cleanIds } } });
  await purgeAudit(cleanIds);
}

export async function purgeSafetyChecklistTemplates(ids: (string | null | undefined)[]): Promise<void> {
  const cleanIds = clean(ids);
  if (cleanIds.length === 0) return;
  // A work order's checklist restricts the template it came from, and the items
  // on that checklist restrict it again. The attached checklists are removed here
  // rather than left for purgeWorkOrders because a template can outlive several
  // orders and this helper is the one that has to reach all of them.
  const checklistIds = (
    await prisma.workOrderChecklist.findMany({ where: { checklistTemplateId: { in: cleanIds } }, select: { woChecklistId: true } })
  ).map((c) => c.woChecklistId);
  const checklistItemIds = (
    await prisma.workOrderChecklistItem.findMany({ where: { woChecklistId: { in: checklistIds } }, select: { woChecklistItemId: true } })
  ).map((i) => i.woChecklistItemId);
  const itemIds = (
    await prisma.checklistItem.findMany({ where: { checklistTemplateId: { in: cleanIds } }, select: { itemId: true } })
  ).map((i) => i.itemId);

  await prisma.workOrderChecklistItem.deleteMany({ where: { woChecklistId: { in: checklistIds } } });
  await prisma.workOrderChecklist.deleteMany({ where: { checklistTemplateId: { in: cleanIds } } });
  await prisma.checklistItem.deleteMany({ where: { checklistTemplateId: { in: cleanIds } } });
  await prisma.safetyChecklistTemplate.deleteMany({ where: { checklistTemplateId: { in: cleanIds } } });

  await purgeAudit([...cleanIds, ...checklistIds, ...checklistItemIds, ...itemIds]);
}

export async function purgeBomMaterials(ids: (string | null | undefined)[]): Promise<void> {
  const cleanIds = clean(ids);
  if (cleanIds.length === 0) return;
  await prisma.equipmentBOMMaterial.deleteMany({ where: { bomId: { in: cleanIds } } });
  await purgeAudit(cleanIds);
}

export interface TestContext {
  adminToken: string;
  operatorToken: string;
  viewOnlyToken: string;
  technicianToken: string;
  supervisorToken: string;
  plannerToken: string;
  adminId: string;
  operatorId: string;
}

export const ctx: TestContext = {
  adminToken: '',
  operatorToken: '',
  viewOnlyToken: '',
  technicianToken: '',
  supervisorToken: '',
  plannerToken: '',
  adminId: '',
  operatorId: '',
};

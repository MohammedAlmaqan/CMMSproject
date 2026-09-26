/**
 * SOW 3.1.5: a material is issued to the operation that needs it.
 *
 * The link is only useful if it is true. `WorkOrderMaterial.operationId` points
 * at a `WorkOrderOperation`, and nothing in the database stops that operation
 * belonging to a different work order. Left unchecked, a material issued to
 * job WO-100 could be attributed to an operation on WO-200, and the material
 * cost would land against the wrong job in the cost rollup while both screens
 * showed a link that looked correct.
 *
 * Kept pure and separate for the same reason as workOrderRules.ts: the rule
 * should be provable without a database, and readable in one place rather than
 * inlined in two route handlers where one of them is easy to miss.
 */

/** Why an operation cannot accept a material line. `null` means it can. */
export type MaterialOperationRejection =
  | 'operation-not-found'
  | 'operation-other-work-order';

/**
 * True when a material may be issued to the operation that was looked up.
 *
 * `operationWorkOrderId` is the workOrderId of the operation the caller named, or
 * null when no such operation exists. `workOrderId` is the work order the
 * material line is being created against.
 *
 * The order of the two checks matters. "Not found" is reported before "wrong
 * work order", because a caller who names an operation that does not exist has a
 * different problem from one who names an operation that exists but belongs
 * elsewhere, and the second message would be misleading for the first case.
 */
export function materialOperationRejection(
  operationWorkOrderId: string | null,
  workOrderId: string,
): MaterialOperationRejection | null {
  if (operationWorkOrderId === null) {
    return 'operation-not-found';
  }
  if (operationWorkOrderId !== workOrderId) {
    return 'operation-other-work-order';
  }
  return null;
}

/**
 * True when the route must skip the lookup entirely, because no operation was
 * named. A part can genuinely be common to the whole job, so an absent link is a
 * valid state and not something to reject.
 */
export function needsOperationCheck(operationId: string | null | undefined): boolean {
  return typeof operationId === 'string' && operationId.length > 0;
}

/** Message used verbatim in the 404 and 400 responses. */
export function materialOperationMessage(rejection: MaterialOperationRejection): string {
  return rejection === 'operation-not-found'
    ? 'Operation not found'
    : 'Operation does not belong to this work order';
}

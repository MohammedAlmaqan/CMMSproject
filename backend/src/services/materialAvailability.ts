import { prisma } from '../utils/prisma.js';

/**
 * SOW 3.3.4: "Vendor must implement a material reservation concept".
 *
 * `WorkOrderMaterial.reservationQuantity` already existed and was already
 * accepted on create and update. What did not exist was any *meaning* attached
 * to it: nothing read it, nothing prevented the same stock being reserved twice,
 * and nothing told a planner what was left to issue. A number nobody acts on is
 * not a reservation concept, so this module is where the behaviour lives.
 *
 * Reservations are **derived, never stored as a running balance**. The reserved
 * figure for a material is recomputed from the live work-order lines on every
 * read. A materialised `Material.reservedStock` counter would drift the moment a
 * work order was cancelled, a line deleted, or a route updated a line without
 * remembering to adjust the counter -- and a wrong availability number is worse
 * than no availability number, because a planner will trust it and issue against
 * stock that was never there. Deriving costs an aggregate per read and cannot
 * drift.
 */

/**
 * A reservation stops holding stock once its work order can no longer be
 * worked. `Completed` and `Closed` are the normal ends; `Cancelled` is the
 * abnormal one and matters just as much, because a cancelled job must release
 * what it was holding or the material is stranded until somebody notices.
 */
export const RESERVATION_RELEASING_WORK_ORDER_STATUSES = ['Completed', 'Closed', 'Cancelled'] as const;

export interface MaterialAvailability {
  materialId: string;
  /** Physical quantity on hand, per `Material.currentStock`. */
  currentStock: number;
  /** Summed reservation across work orders that can still consume the material. */
  reservedQuantity: number;
  /** What may still be issued. Never negative. */
  availableQuantity: number;
}

export async function getMaterialAvailability(materialId: string): Promise<MaterialAvailability> {
  const material = await prisma.material.findFirst({
    where: { materialId, isDeleted: false },
    select: { materialId: true, currentStock: true },
  });
  if (!material) {
    throw Object.assign(new Error('Material not found'), { status: 404 });
  }

  const aggregate = await prisma.workOrderMaterial.aggregate({
    where: {
      materialId,
      isDeleted: false,
      workOrder: {
        isDeleted: false,
        status: { notIn: [...RESERVATION_RELEASING_WORK_ORDER_STATUSES] },
      },
    },
    _sum: { reservationQuantity: true },
  });

  const currentStock = material.currentStock ?? 0;
  const reservedQuantity = aggregate._sum.reservationQuantity ?? 0;

  return {
    materialId,
    currentStock,
    reservedQuantity,
    // Clamped: over-reserved stock is a data problem to report, not a negative
    // balance to hand to a planner as if it meant something.
    availableQuantity: Math.max(0, currentStock - reservedQuantity),
  };
}

export interface ReservationCheckArgs {
  materialId: string;
  /** The reservation the line will end up holding once this change is applied. */
  nextReservationQuantity: number;
  /**
   * The line being edited, excluded from the total. Without this, raising a
   * line's own reservation would count the old value against the new one and
   * reject the change it is meant to allow.
   */
  excludeWoMaterialId?: string;
}

/**
 * Throws 409 when a reservation would take more than is available. Callers that
 * write a reservation are expected to call this *before* writing, so the line
 * never lands in an over-reserved state.
 */
export async function assertReservable({
  materialId,
  nextReservationQuantity,
  excludeWoMaterialId,
}: ReservationCheckArgs): Promise<MaterialAvailability> {
  const availability = await getMaterialAvailability(materialId);

  if (nextReservationQuantity <= 0) {
    return availability;
  }

  // A line that is already live is part of the aggregate above. The only case
  // where a reservation is missing from that total is the line being edited, so
  // give its old value back before comparing.
  if (excludeWoMaterialId) {
    const existing = await prisma.workOrderMaterial.findFirst({
      where: { woMaterialId: excludeWoMaterialId, isDeleted: false },
      select: { reservationQuantity: true },
    });
    const priorReservation = existing?.reservationQuantity ?? 0;
    const effectivelyReserved = availability.reservedQuantity - priorReservation;

    if (effectivelyReserved + nextReservationQuantity > availability.currentStock) {
      throw Object.assign(
        new Error(
          `Cannot reserve ${nextReservationQuantity} of material ${materialId}: ` +
            `${effectivelyReserved.toFixed(3)} is already reserved and ${availability.currentStock.toFixed(3)} is on hand. ` +
            `Reduce the reservation, raise the stock, or close the work order holding the existing reservation.`
        ),
        { status: 409 }
      );
    }
    return availability;
  }

  if (availability.reservedQuantity + nextReservationQuantity > availability.currentStock) {
    throw Object.assign(
      new Error(
        `Cannot reserve ${nextReservationQuantity} of material ${materialId}: ` +
          `${availability.reservedQuantity.toFixed(3)} is already reserved and ${availability.currentStock.toFixed(3)} is on hand. ` +
          `Reduce the reservation, raise the stock, or close the work order holding the existing reservation.`
      ),
      { status: 409 }
    );
  }

  return availability;
}

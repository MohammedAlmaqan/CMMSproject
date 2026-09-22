import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export const workOrderStatusSchema = z.enum([
  'Draft',
  'Planned',
  'Scheduled',
  'In Progress',
  'Suspended',
  'Completed',
  'Closed',
  'Cancelled',
]);

export const prioritySchema = z.enum(['High', 'Medium', 'Low']);

export const workOrderTypeSchema = z.enum(['CM', 'PM', 'PdM', 'EM', 'CAL']);

export const commentEntityTypeSchema = z.enum([
  'WorkOrder',
  'Notification',
  'Equipment',
  'MaintenancePlan',
]);

export const workOrderCreateSchema = z.object({
  type: workOrderTypeSchema,
  priority: prioritySchema,
  description: z.string().min(3),
  functionalLocationId: z.string().min(1),
  equipmentId: z.string().min(1).nullable().optional(),
  workCenterId: z.string().min(1),
  supervisorUserId: z.string().min(1),
  plannedStart: z.string().min(1).nullable().optional(),
  plannedFinish: z.string().min(1).nullable().optional(),
  costCenterCode: z.string().optional(),
  internalOrder: z.string().optional(),
  breakdownFlag: z.boolean().optional(),
  safetyCriticalFlag: z.boolean().optional(),
});

export const workOrderUpdateSchema = workOrderCreateSchema.partial();

export const workOrderStatusBodySchema = z.object({
  status: workOrderStatusSchema,
});

export const operationCreateSchema = z.object({
  workOrderId: z.string().min(1),
  sequenceNumber: z.number().int().positive(),
  description: z.string().min(1),
  craftId: z.string().min(1),
  plannedHours: z.number().min(0).optional(),
  numberOfTechnicians: z.number().int().positive().optional(),
});

export const operationUpdateSchema = operationCreateSchema.partial();

export const woMaterialCreateSchema = z.object({
  workOrderId: z.string().min(1),
  materialId: z.string().min(1),
  plannedQuantity: z.number().min(0),
  actualQuantity: z.number().min(0).optional(),
  unitCost: z.number().min(0).optional(),
  reservationQuantity: z.number().min(0).optional(),
});

export const woMaterialUpdateSchema = woMaterialCreateSchema.partial();

export const laborCreateSchema = z.object({
  operationId: z.string().min(1),
  userId: z.string().min(1),
  hoursWorked: z.number().positive(),
  entryDateTime: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
});

export const commentCreateSchema = z.object({
  entityType: commentEntityTypeSchema,
  entityId: z.string().min(1),
  content: z.string().min(1),
});

export function validate(schema: z.ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = result.error.issues.map(
        (i) => `${i.path.join('.') || '(body)'}: ${i.message}`
      );
      return res.status(400).json({ error: issues.join('; ') });
    }
    req.body = result.data;
    next();
  };
}
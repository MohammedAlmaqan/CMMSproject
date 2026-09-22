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

export const laborUpdateSchema = z.object({
  operationId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  hoursWorked: z.number().positive().optional(),
  entryDateTime: z.string().min(1).nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const externalServiceCreateSchema = z.object({
  workOrderId: z.string().min(1),
  vendor: z.string().min(1),
  description: z.string().min(1),
  cost: z.number().nonnegative(),
  invoiceRef: z.string().optional(),
});

export const externalServiceUpdateSchema = externalServiceCreateSchema.partial();

export const checklistTemplateCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  isMandatory: z.boolean().optional(),
  items: z
    .array(
      z.object({
        sequenceNumber: z.number().int().positive(),
        description: z.string().min(1),
      })
    )
    .min(1),
});

export const checklistAttachSchema = z.object({
  checklistTemplateId: z.string().min(1),
});

export const checklistUpdateSchema = z.object({
  status: z.enum(['Pending', 'In Progress', 'Completed']),
  signedBy: z.string().min(1).optional(),
});

export const checklistItemUpdateSchema = z.object({
  response: z.enum(['Yes', 'No', 'NA']).optional(),
  comment: z.string().nullable().optional(),
});

export const notificationTypeSchema = z.enum(['M1', 'M2', 'M3']);

export const notificationStatusSchema = z.enum(['Open', 'In Process', 'Completed', 'Converted']);

export const notificationCreateSchema = z.object({
  type: notificationTypeSchema,
  priority: prioritySchema,
  description: z.string().min(3),
  functionalLocationId: z.string().min(1),
  equipmentId: z.string().min(1).nullable().optional(),
  reportedByUserId: z.string().min(1),
  breakdownFlag: z.boolean().optional(),
});

export const notificationUpdateSchema = z.object({
  type: notificationTypeSchema.optional(),
  priority: prioritySchema.optional(),
  description: z.string().min(3).optional(),
  functionalLocationId: z.string().min(1).optional(),
  equipmentId: z.string().min(1).nullable().optional(),
  reportedByUserId: z.string().min(1).optional(),
  breakdownFlag: z.boolean().optional(),
  status: notificationStatusSchema.optional(),
});

export const convertNotificationSchema = z.object({
  workCenterId: z.string().min(1).optional(),
  supervisorUserId: z.string().min(1).optional(),
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
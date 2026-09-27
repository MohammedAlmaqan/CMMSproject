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
  // SOW 3.1.4: a manually created work order copies its operations from a
  // reusable task list. Before this existed the only route to a task list's
  // operations was preventive-maintenance generation, so the reusable-template
  // feature was unreachable for a planner raising work by hand.
  taskListId: z.string().min(1).nullable().optional(),
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

export const operationUpdateSchema = operationCreateSchema.partial().extend({
  // SOW 3.3.3 requires a technician to be able to record actual hours and the
  // operation's own status. These two were missing from operationCreateSchema,
  // and because `validate()` assigns req.body = schema.safeParse(...).data, a
  // Zod object silently DROPS keys it does not declare. The PUT handler already
  // persisted both fields correctly, so the values never reached it: the schema
  // was the whole defect. Declaring them here is the fix.
  actualHours: z.number().min(0).nullable().optional(),
  // Free text in v1.0.0; the model column is a plain String, not an enum.
  status: z.string().trim().min(1).nullable().optional(),
});

export const equipmentBomCreateSchema = z.object({
  materialId: z.string().min(1),
  quantity: z.number().positive(),
});

export const equipmentBomUpdateSchema = z.object({
  quantity: z.number().positive(),
});

export const craftCreateSchema = z.object({
  workCenterId: z.string().min(1),
  craftCode: z.string().trim().min(1),
  description: z.string().trim().min(1),
  // SOW 3.1.3 and decision D-16: each craft carries its own hourly rate, and
  // that rate is what 3.5.1 cost estimation consumes.
  hourlyRate: z.number().min(0),
});

export const craftUpdateSchema = craftCreateSchema.partial();

export const systemConfigUpdateSchema = z.object({
  key: z.enum(['wo_number_prefix', 'notif_number_prefix']),
  value: z
    .string()
    .trim()
    .min(1)
    .max(20)
    // A prefix is pasted into every generated number, so it is restricted to
    // characters that cannot break a number's readability or a downstream
    // filter. No spaces, no separators, no path characters.
    .regex(/^[A-Za-z0-9_-]+$/, 'Prefix may contain only letters, digits, hyphen and underscore'),
});

export const costSplitItemSchema = z.object({
  costCenterCode: z.string().trim().min(1),
  // 3.5.2 percentage allocation. A single line cannot claim the whole work
  // order, which is the specific mistake 3.5.2 exists to prevent; the sum to
  // 100 is enforced across the set in the route.
  percentage: z.number().gt(0).lt(100),
});

/**
 * 3.5.2 allocation is replaced as a whole set, not appended to line by line.
 * The invariant ("these total 100%") is a property of the set, so it cannot be
 * enforced by validating each line as it is added: the first line of a two-way
 * split is always incomplete by definition.
 */
export const costSplitReplaceSchema = z.object({
  workOrderId: z.string().min(1),
  splits: z.array(costSplitItemSchema),
});

export const costSplitCreateSchema = costSplitItemSchema;
export const costSplitUpdateSchema = z.object({ percentage: z.number().gt(0).lt(100) });


export const woMaterialCreateSchema = z.object({
  workOrderId: z.string().min(1),
  materialId: z.string().min(1),
  // SOW 3.1.5: the operation this part is issued to. Optional, because a part can
  // genuinely be common to the whole job. When given, the route checks it is an
  // operation on this same work order, so a material cannot be attributed to
  // another job's operation.
  operationId: z.string().min(1).nullable().optional(),
  plannedQuantity: z.number().min(0),
  actualQuantity: z.number().min(0).optional(),
  unitCost: z.number().min(0).optional(),
  reservationQuantity: z.number().min(0).optional(),
});

export const woMaterialUpdateSchema = woMaterialCreateSchema.partial();

export const laborCreateSchema = z.object({
  operationId: z.string().min(1),
  // SOW 3.3.5: labour is identified by the technician's login, so userId is
  // optional here and the route fills it from the authenticated caller. It stays
  // accepted so a supervisor can book on someone's behalf, which the route
  // audits, and a Technician naming somebody else is rejected with 403.
  userId: z.string().min(1).optional(),
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
  // null clears an answer back to unanswered, which is what re-arms the SOW 3.3.7
  // gate. Without it a mistaken answer could never be corrected, and the gate
  // would stay open.
  response: z.enum(['Yes', 'No', 'NA']).nullable().optional(),
  comment: z.string().nullable().optional(),
});

export const materialImportRowSchema = z.object({
  materialCode: z.string().trim().min(1),
  description: z.string().trim().min(1),
  unitOfMeasure: z.string().trim().min(1),
  standardCost: z.coerce.number().nonnegative().optional(),
  currentStock: z.coerce.number().nonnegative().optional(),
});

export const equipmentImportRowSchema = z.object({
  equipmentCode: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  functionalLocationCode: z.string().trim().min(1),
  manufacturer: z.string().trim().optional(),
  model: z.string().trim().optional(),
  serialNumber: z.string().trim().optional(),
  assetTag: z.string().trim().optional(),
  equipmentClass: z.string().trim().optional(),
  criticality: z.enum(['A', 'B', 'C']),
  operationalStatus: z.enum(['Active', 'Inactive', 'Decommissioned']).optional(),
});

export const notificationTypeSchema = z.enum(['M1', 'M2', 'M3']);

export const notificationStatusSchema = z.enum(['Open', 'In Process', 'Completed', 'Converted']);

export const notificationCreateSchema = z
  .object({
    type: notificationTypeSchema,
    priority: prioritySchema,
    description: z.string().min(3),
    // SOW 3.2.2 lists "Functional Location / Equipment (mandatory selection)".
    // Requiring the location unconditionally was wrong in practice: a fault
    // raised against a specific machine already determines its location, and
    // forcing the reporter to pick one by hand is how a notification ends up
    // filed under a location that contradicts its own equipment. So the location
    // becomes optional and the route derives it from the equipment when only the
    // equipment is given. At least one of the two is still mandatory.
    functionalLocationId: z.string().min(1).nullable().optional(),
    equipmentId: z.string().min(1).nullable().optional(),
    reportedByUserId: z.string().min(1),
    breakdownFlag: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.functionalLocationId && !data.equipmentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['functionalLocationId'],
        message:
          'A functional location or an equipment must be selected: SOW 3.2.2 makes the selection mandatory',
      });
    }
  });

export const notificationUpdateSchema = z
  .object({
    type: notificationTypeSchema.optional(),
    priority: prioritySchema.optional(),
    description: z.string().min(3).optional(),
    functionalLocationId: z.string().min(1).nullable().optional(),
    equipmentId: z.string().min(1).nullable().optional(),
    reportedByUserId: z.string().min(1).optional(),
    breakdownFlag: z.boolean().optional(),
    status: notificationStatusSchema.optional(),
  });

export const convertNotificationSchema = z.object({
  workCenterId: z.string().min(1).optional(),
  supervisorUserId: z.string().min(1).optional(),
});

export const equipmentCreateSchema = z.object({
  equipmentCode: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  functionalLocationId: z.string().min(1),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  assetTag: z.string().optional(),
  equipmentClass: z.string().optional(),
  criticality: z.enum(['A', 'B', 'C']),
  installationDate: z.string().min(1).nullable().optional(),
  warrantyExpiryDate: z.string().min(1).nullable().optional(),
  operationalStatus: z.enum(['Active', 'Inactive', 'Decommissioned']).optional(),
  technicalParameters: z.record(z.string(), z.string()).optional(),
});

export const equipmentUpdateSchema = equipmentCreateSchema.partial();

export const functionalLocationCreateSchema = z.object({
  locationCode: z.string().min(1),
  description: z.string().min(1),
  parentLocationId: z.string().min(1).nullable().optional(),
  locationType: z.enum(['Plant', 'Area', 'Unit', 'Sub-unit', 'System']),
  operationalStatus: z.enum(['Active', 'Inactive']).optional(),
  installationDate: z.string().min(1).nullable().optional(),
  gpsCoordinates: z.string().min(1).nullable().optional(),
  safetyCritical: z.boolean().optional(),
});

export const functionalLocationUpdateSchema = functionalLocationCreateSchema.partial();

export const equipmentMeterCreateSchema = z.object({
  equipmentId: z.string().min(1),
  meterName: z.string().min(1),
  unitOfMeasure: z.string().min(1),
  lastReading: z.number().nonnegative().optional(),
  lastReadingDate: z.string().min(1).nullable().optional(),
});

export const equipmentMeterUpdateSchema = equipmentMeterCreateSchema.partial();

export const meterReadingCreateSchema = z.object({
  readingValue: z.number().nonnegative(),
  readingDate: z.string().min(1).optional(),
  notes: z.string().min(1).nullable().optional(),
});

export const schedulerRunSchema = z.object({}).strict();

export const materialCreateSchema = z.object({
  materialCode: z.string().trim().min(1),
  description: z.string().trim().min(1),
  unitOfMeasure: z.string().trim().min(1),
  standardCost: z.number().nonnegative().optional(),
  currentStock: z.number().nonnegative().optional(),
});

export const materialUpdateSchema = materialCreateSchema.partial();

export const workCenterCreateSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  dailyCapacityHours: z.number().nonnegative(),
  costRatePerHour: z.number().nonnegative(),
  isActive: z.boolean().optional(),
});

export const workCenterUpdateSchema = workCenterCreateSchema.partial();

/// A required material on a task list step. Zero is allowed and means "the step
/// needs this part, quantity not yet determined", which is a real state for a
/// template; a negative quantity is not, since it would reduce stock on issue.
export const taskListMaterialItemSchema = z.object({
  materialId: z.string().min(1),
  quantity: z.number().nonnegative(),
});
export const taskListOperationItemSchema = z.object({
  sequenceNumber: z.number().int().positive(),
  description: z.string().min(1),
  craftId: z.string().min(1),
  plannedHours: z.number().nonnegative().optional(),
  numberOfTechnicians: z.number().int().positive().optional(),
  // SOW 3.1.4 required materials. Attached to the step, not the list, so the
  // store can see which step is blocked when a part is short.
  materials: z.array(taskListMaterialItemSchema).optional(),
});

export const taskListCreateSchema = z.object({
  code: z.string().trim().min(1),
  description: z.string().trim().min(1),
  equipmentClass: z.string().nullable().optional(),
  equipmentId: z.string().min(1).nullable().optional(),
  workCenterId: z.string().min(1),
  operations: z.array(taskListOperationItemSchema).optional(),
});

export const taskListUpdateSchema = taskListCreateSchema.partial();

export const failureCodeCreateSchema = z.object({
  parentCodeId: z.string().min(1).nullable().optional(),
  code: z.string().trim().min(1),
  description: z.string().trim().min(1),
});

export const failureCodeUpdateSchema = failureCodeCreateSchema.partial();

/**
 * A plan target names exactly one asset (D-10 / SOW 3.4.1). The database CHECK
 * constraint enforces this too, but validating it at the boundary means the
 * caller gets a 400 naming the problem rather than a constraint violation.
 */
export const planTargetSchema = z
  .object({
    equipmentId: z.string().min(1).nullable().optional(),
    functionalLocationId: z.string().min(1).nullable().optional(),
  })
  .refine((t) => (t.equipmentId ? 1 : 0) + (t.functionalLocationId ? 1 : 0) === 1, {
    message: 'A plan target must name exactly one of equipmentId or functionalLocationId',
  });

/** SOW 3.4.2: a meter threshold on a plan, in the meter's own unit of measure. */
export const planMeterSchema = z.object({
  meterId: z.string().min(1),
  meterInterval: z.number().positive(),
});

const planShape = {
  planCode: z.string().trim().min(1),
  description: z.string().trim().min(1),
  equipmentId: z.string().min(1).nullable().optional(),
  functionalLocationId: z.string().min(1).nullable().optional(),
  workCenterId: z.string().min(1),
  taskListId: z.string().min(1),
  strategyType: z.enum(['Time', 'Meter', 'Combined']),
  // Positive, not merely non-negative. The scheduler computes cycles as
  // floor(gapDays / stepDays); a zero interval divided into it yields
  // Infinity, which silently stopped generating instead of being rejected.
  intervalValue: z.number().int().positive(),
  intervalUnit: z.enum(['Days', 'Weeks', 'Months']),
  callHorizonValue: z.number().int().nonnegative().optional(),
  callHorizonUnit: z.enum(['Days', 'Units']).optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1).nullable().optional(),
  activeFlag: z.boolean().optional(),
  // SOW 3.4.1 and 3.4.3.
  priority: z.enum(['High', 'Medium', 'Low']).optional(),
  generatedWorkOrderStatus: z.enum(['Draft', 'Planned']).optional(),
  notificationId: z.string().min(1).nullable().optional(),
  // D-10: one plan may cover many assets.
  targets: z.array(planTargetSchema).optional(),
  // SOW 3.4.2: multiple meters per plan.
  planMeters: z.array(planMeterSchema).optional(),
};

export const maintenancePlanCreateSchema = z
  .object(planShape)
  .superRefine((d, ctx) => {
    // SOW 3.4.1: the plan must say what it covers. Accept either the legacy
    // single columns or the new target list, but not neither.
    const legacyTargets = (d.equipmentId ? 1 : 0) + (d.functionalLocationId ? 1 : 0);
    const listTargets = d.targets?.length ?? 0;
    if (legacyTargets + listTargets === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['equipmentId'],
        message: 'A maintenance plan must target at least one equipment or functional location',
      });
    }
    // SOW 3.4.2: a meter strategy with no threshold can never come due, which
    // looks identical to a plan that simply has not run yet.
    if (d.strategyType === 'Meter' || d.strategyType === 'Combined') {
      if (!d.planMeters || d.planMeters.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['planMeters'],
          message: `strategyType '${d.strategyType}' requires at least one meter threshold`,
        });
      }
    }
    if (d.endDate) {
      const start = Date.parse(d.startDate);
      const end = Date.parse(d.endDate);
      if (Number.isNaN(start) || Number.isNaN(end)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'startDate and endDate must be parseable dates' });
      } else if (end < start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['endDate'],
          message: 'endDate cannot be before startDate',
        });
      }
    }
  });

export const maintenancePlanUpdateSchema = z
  .object(planShape)
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field is required' });

/**
 * The create-time cross-field rules, applied to a partial update.
 *
 * `maintenancePlanUpdateSchema` is `.partial()`, so a patch can never satisfy
 * the rules in `maintenancePlanCreateSchema` on its own: switching a Time plan
 * to `Meter` without sending thresholds passes every field check and leaves a
 * plan that can never come due. That failure is invisible from the outside -
 * the plan is active, the scheduler runs clean, and no work order ever appears.
 *
 * Scalar fields are merged from `patch` over `existing` here rather than by the
 * caller, so the value a rule inspects and the set of fields it fires for can
 * never come from two different places.
 *
 * The caller supplies the two set sizes it alone can know: `targetCount` is the
 * plan's coverage *after* the patch, which needs the same de-duplicating helper
 * the write path uses because a patch may name an asset in both the legacy
 * columns and the target list. `storedMeterCount` is the pre-patch threshold
 * count, read from the database; the patch's own list overrides it.
 *
 * Each rule runs only when the patch touches a field that rule depends on. That
 * second part matters: plans that predate this phase can already violate a rule,
 * and re-checking every rule on every edit would make such a plan impossible to
 * deactivate or correct one field at a time.
 */
export function planPatchIssues(
  patch: Record<string, unknown>,
  existing: {
    strategyType?: string | null;
    startDate?: Date | string | null;
    endDate?: Date | string | null;
  },
  sets: { targetCount: number; storedMeterCount: number }
): string[] {
  const issues: string[] = [];
  const touches = (...keys: string[]) => keys.some((k) => k in patch);
  const pick = <T>(key: string): T | null =>
    (key in patch ? (patch[key] as T | null) : (existing[key as keyof typeof existing] as T | null) ?? null);
  const asMs = (v: Date | string | null): number => {
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'string') return Date.parse(v);
    return Number.NaN;
  };

  if (touches('strategyType', 'planMeters')) {
    const strategy = pick<string>('strategyType');
    const meters = 'planMeters' in patch
      ? ((patch.planMeters as unknown[] | null | undefined) ?? []).length
      : sets.storedMeterCount;
    if ((strategy === 'Meter' || strategy === 'Combined') && meters === 0) {
      issues.push(
        `planMeters: strategyType '${strategy}' requires at least one meter threshold`
      );
    }
  }

  // A null endDate clears the rule: an open-ended plan is always legal.
  if (touches('startDate', 'endDate')) {
    const start = asMs(pick<Date | string>('startDate'));
    const end = asMs(pick<Date | string>('endDate'));
    if (!Number.isNaN(end)) {
      if (Number.isNaN(start)) {
        issues.push('endDate: startDate and endDate must be parseable dates');
      } else if (end < start) {
        issues.push('endDate: endDate cannot be before startDate');
      }
    }
  }

  if (touches('equipmentId', 'functionalLocationId', 'targets') && sets.targetCount === 0) {
    issues.push(
      'equipmentId: A maintenance plan must target at least one equipment or functional location'
    );
  }

  return issues;
}

export const userUpdateSchema = z
  .object({
    fullName: z.string().trim().min(1).optional(),
    email: z.string().email().optional(),
    role: z
      .enum(['View-Only', 'Requester', 'Technician', 'Maintenance Supervisor', 'Maintenance Planner', 'Administrator'])
      .optional(),
    workCenterId: z.string().min(1).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field is required' });

export const attachmentEntityTypeSchema = z.enum(['WorkOrder', 'Notification', 'Equipment']);

export const attachmentCreateSchema = z.object({
  entityType: attachmentEntityTypeSchema,
  entityId: z.string().min(1).regex(/^[A-Za-z0-9-]+$/),
});

/**
 * YYYY-MM-DD, and a real calendar date rather than 2026-02-31.
 *
 * The round trip is the check that matters: `new Date('2026-02-31T00:00:00Z')`
 * is not an Invalid Date in V8, it quietly rolls over to 3 March, so a
 * Number.isNaN test would wave 31 February straight through and the board would
 * then start on a day the caller never asked for.
 */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Not a real calendar date');

/**
 * Query schema for GET /api/work-centers/capacity.
 *
 * Both bounds default so the board is useful with no parameters at all, and the
 * 90-day ceiling bounds the response: the board emits one row per centre per day
 * with a per-craft breakdown, so an unbounded range would be a trivially
 * available way to ask the API for a very large payload.
 */
export const capacityQuerySchema = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .transform((q) => {
    const from = q.from ?? new Date().toISOString().slice(0, 10);
    const to =
      q.to ??
      new Date(new Date(`${from}T00:00:00Z`).getTime() + 13 * 86_400_000)
        .toISOString()
        .slice(0, 10);
    return { from, to };
  })
  .refine((r) => r.to >= r.from, { message: 'The range end date must not precede the start date' })
  .refine(
    (r) => new Date(`${r.to}T00:00:00Z`).getTime() - new Date(`${r.from}T00:00:00Z`).getTime() <= 89 * 86_400_000,
    { message: 'The range may not exceed 90 days' }
  );

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
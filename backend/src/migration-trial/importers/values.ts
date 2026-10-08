/**
 * Local mirrors of value sets that the migration sample must stay inside.
 *
 * The enum sets that validation.ts already exports are imported and used
 * directly by the importers; the inline option sets below are not exported by
 * validation.ts, so they are mirrored here from the canonical declarations they
 * name-follow:
 *
 * - Equipment.criticality -> validation.ts:352 `z.enum(['S','A','B','C'])`
 *   (widened by commit 5aa0094; S ranks above A - see FILL_REPORT "No bridge").
 * - Equipment.operationalStatus -> validation.ts:355.
 * - FunctionalLocation.operationalStatus -> validation.ts:366.
 * - FunctionalLocation.locationType -> validation.ts:365.
 *   (User.role comes from validation.ts userRoleSchema:628 directly, no mirror.)
 *
 * `name-follow` is checked in the unit tests: every member of these arrays must
 * parse through the corresponding canonical schema/spec declaration.
 */

export const criticalityValues = ['S', 'A', 'B', 'C'] as const;
export const equipmentOperationalStatusValues = ['Active', 'Inactive', 'Decommissioned'] as const;
export const functionalLocationOperationalStatusValues = ['Active', 'Inactive'] as const;
export const locationTypeValues = ['Plant', 'Area', 'Unit', 'Sub-unit', 'System'] as const;
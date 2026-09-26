/**
 * SOW 3.1.2: each equipment record is assigned to exactly one functional
 * location, and that location is the lowest level of the hierarchy.
 *
 * There is no `level` column on FunctionalLocation, and there cannot easily be
 * one: the depth of a location is a property of the tree around it, not of the
 * row. So "lowest level" is defined structurally as a location with no
 * non-deleted children.
 *
 * The alternative — trusting the locationType label, where System is the deepest
 * of Plant/Area/Unit/Sub-unit/System — is not equivalent. The labels are
 * free text in the model, nothing constrains a System from having children, and
 * a location that is a leaf but labelled Sub-unit would be wrongly rejected.
 * Structure is the property the requirement is actually about.
 *
 * The invariant also decays in the direction nobody checks: equipment is placed
 * at a leaf, and later somebody adds a child beneath that leaf, at which point
 * the equipment sits at a location that is no longer lowest level. Both
 * directions are therefore guarded, in equipment.ts and functionalLocations.ts.
 */

export interface LocationPlacement {
  /** Whether the location has any non-deleted children. */
  hasChildren: boolean;
}

export type PlacementCheck = { ok: true } | { ok: false; error: string };

export function checkEquipmentPlacement(location: LocationPlacement): PlacementCheck {
  if (location.hasChildren) {
    return {
      ok: false,
      error:
        'Equipment must be assigned to a lowest-level functional location: the selected location has child locations',
    };
  }
  return { ok: true };
}

export interface ChildAddition {
  /** Whether the parent location already holds equipment. */
  hasEquipment: boolean;
}

export type ChildCheck = { ok: true } | { ok: false; error: string };

export function checkChildAddition(parent: ChildAddition): ChildCheck {
  if (parent.hasEquipment) {
    return {
      ok: false,
      error:
        'This functional location holds equipment, so it is not a lowest-level location. Move the equipment down before adding a child location',
    };
  }
  return { ok: true };
}

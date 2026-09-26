import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(
  resolve(here, '../../../app/src/pages/TaskListsPage.tsx'), 'utf8');
const app = readFileSync(resolve(here, '../../../app/src/App.tsx'), 'utf8');
const sidebar = readFileSync(
  resolve(here, '../../../app/src/components/layout/Sidebar.tsx'), 'utf8');
const palette = readFileSync(
  resolve(here, '../../../app/src/components/layout/CommandPalette.tsx'), 'utf8');
const service = readFileSync(
  resolve(here, '../../../app/src/services/taskListService.ts'), 'utf8');
const taskLists = readFileSync(resolve(here, '../../src/routes/taskLists.ts'), 'utf8');

// SOW 3.1.4: task lists are reusable sets of operation steps with estimated
// labour hours, a craft and required materials, associated with an equipment
// class or a specific piece of equipment.
//
// The backend has supported the class and equipment association the whole time,
// and had no screen at all. So the register's "not there" finding was right about
// the capability being unusable and wrong about where the gap was: the missing
// piece was the screen, not the model.

describe('the task list screen exists', () => {
  it('is reachable by route', () => {
    expect(app).toMatch(/path="\/task-lists"[\s\S]{0,40}TaskListsPage/);
  });

  it('is in the sidebar, not hidden behind a URL', () => {
    // A capability reachable only by typing a URL is not usable by the people
    // who maintain templates.
    expect(sidebar).toMatch(/name: 'Task Lists', icon: \w+, path: '\/task-lists'/);
  });

  it('is in the command palette alongside the other master data', () => {
    expect(palette).toMatch(/label: 'Go to Task Lists'/);
  });
});

describe('it does the whole write path, not just a list', () => {
  it('has create, read, update and delete', () => {
    expect(service).toMatch(/create: \(body: TaskListInput\)/);
    expect(service).toMatch(/getById: \(id: string\)/);
    expect(service).toMatch(/update: \(id: string/);
    expect(service).toMatch(/remove: \(id: string\)/);
  });

  it('shows a create control only to roles the API allows', () => {
    // The API requires Requester on create and update. Offering the button to
    // View-Only would produce a 403 on every attempt.
    expect(page).toMatch(
      /const canWrite = hasPermission\(\['Requester', 'Technician', 'Maintenance Supervisor', 'Administrator'\]\)/);
  });

  it('gates delete to the role the API requires', () => {
    expect(page).toMatch(
      /const canDelete = hasPermission\(\['Maintenance Supervisor', 'Administrator'\]\)/);
    expect(taskLists).toMatch(/router\.delete\('\/:id', authorizeMinRole\('Maintenance Supervisor'\)/);
  });

  it('re-reads the list before editing rather than trusting a shared payload', () => {
    // The list payload comes from the app store, which other screens also use.
    // Editing from it risks writing back a stale step set.
    expect(page).toMatch(/const full = await taskListService\.getById\(tl\.taskListId\)/);
  });
});

describe('a task list can be templated by class or by asset', () => {
  it('offers both, and lets a list be neither', () => {
    // A fleet-wide routine has no single asset, so "neither" must be a valid
    // state rather than something the form forces the user to invent.
    expect(page).toMatch(/Equipment Class \(optional\)/);
    expect(page).toMatch(/Specific Equipment \(optional\)/);
    expect(page).toMatch(/Not tied to one asset/);
  });

  it('sends an empty association as null, not as an empty string', () => {
    expect(page).toMatch(/equipmentClass: equipmentClass\.trim\(\) \|\| null/);
    expect(page).toMatch(/equipmentId: equipmentId \|\| null/);
  });

  it('shows which association a list actually has', () => {
    expect(page).toMatch(/Class: \{tl\.equipmentClass\}/);
    expect(page).toMatch(/Not tied to an asset or class/);
  });
});

describe('required materials hang off the step', () => {
  it('adds materials to a step, not to the list', () => {
    // The placement is the point: a list-level requirement cannot say which step
    // is blocked when a part is short.
    expect(page).toMatch(/const addMaterial = \(index: number\)/);
    expect(page).toMatch(/Required materials/);
  });

  it('submits them nested under each operation', () => {
    expect(page).toMatch(/materials: o\.materials\.map\(\(m\) => \(\{/);
  });

  it('refuses a repeated material on one step, before the round trip', () => {
    // The database refuses it too; catching it here tells the planner which step
    // is at fault instead of returning a server error.
    expect(page).toMatch(/lists \$\{materialLabel\(m\.materialId\)\} more than once/);
  });

  it('allows a quantity of zero, which means required but not yet quantified', () => {
    expect(page).toMatch(/min="0"/);
    expect(page).toMatch(/Number\(m\.quantity\) < 0/);
  });

  it('says plainly when a step needs only labour', () => {
    // Silence would read as a form that failed to load its materials.
    expect(page).toMatch(/None\. This step needs no parts, only labour\./);
  });

  it('shows the requirements on the read side too', () => {
    expect(page).toMatch(/o\.materials!\.map\(\(m\) =>/);
    expect(page).toMatch(/×\{m\.quantity\}/);
  });

  it('counts the requirements on the collapsed row', () => {
    expect(page).toMatch(/materialCount/);
  });
});

describe('the step editor holds up under use', () => {
  it('renumbers after a removal so the sequence stays contiguous', () => {
    // The API requires a positive integer sequence; a gap left behind would be
    // rejected on save for a reason the user cannot see.
    expect(page).toMatch(/\.map\(\(o, i\) => \(\{ \.\.\.o, sequenceNumber: i \+ 1 \}\)\)/);
  });

  it('sends the renumbered sequence rather than the local one', () => {
    expect(page).toMatch(/sequenceNumber: i \+ 1,/);
  });

  it('names every field for a screen reader', () => {
    expect(page).toMatch(/aria-label=\{`Material for step \$\{o\.sequenceNumber\}`\}/);
    expect(page).toMatch(/aria-label=\{`Quantity for step \$\{o\.sequenceNumber\}`\}/);
    expect(page).toMatch(/aria-label=\{`Remove step \$\{o\.sequenceNumber\}`\}/);
  });

  it('discloses the expand state rather than only the icon', () => {
    expect(page).toMatch(/aria-expanded=\{isExpanded\}/);
  });

  it('explains why a list with no steps is a problem', () => {
    expect(page).toMatch(/A work order cannot be built from it\./);
  });

  it('reports a duplicate as the step it belongs to', () => {
    expect(page).toMatch(/Step \$\{o\.sequenceNumber\} lists/);
  });
});

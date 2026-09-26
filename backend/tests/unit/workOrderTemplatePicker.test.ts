import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const createPage = readFileSync(
  resolve(here, '../../../app/src/pages/WorkOrderCreatePage.tsx'), 'utf8');
const types = readFileSync(resolve(here, '../../../app/src/types/index.ts'), 'utf8');
const woRoute = readFileSync(resolve(here, '../../src/routes/workOrders.ts'), 'utf8');

// SOW 3.1.4. C.6 made the server copy a template's steps onto a new work order
// and nobody noticed that nothing in the app could ever pass a taskListId, so the
// copy path had no caller. A server capability with no caller is not a feature.

describe('a work order can be created from a task list', () => {
  it('offers the templates on the create form', () => {
    expect(createPage).toMatch(/<option value="">No template \(start empty\)<\/option>/);
  });

  it('sends the choice, and sends null when there is none', () => {
    expect(createPage).toMatch(/taskListId: taskListId \|\| null,/);
  });

  it('does not add taskListId to the row type, because nothing persists it', () => {
    // It is a create-only input. Declaring it on WorkOrder would suggest a
    // back-reference that the read path does not return.
    expect(types).toMatch(/WorkOrderCreateInput = Partial<WorkOrder> & \{ taskListId\?: string \| null \}/);
  });

  it('types the service against the create input', () => {
    expect(types).toMatch(/taskListId\?: string \| null \}/);
  });
});

describe('the choice is not a blind one', () => {
  it('says what will be copied before it is copied', () => {
    // Steps and required materials are the reason to pick a template, and the
    // count is the only way to know the pick was the wrong one.
    expect(createPage).toMatch(/steps and\{' '\}/);
  });

  it('counts the required materials in that summary', () => {
    expect(createPage).toMatch(/n \+ \(o\.materials\?\.length \?\? 0\), 0\)/);
  });

  it('warns when the template belongs to another work centre', () => {
    expect(createPage).toMatch(/This template belongs to a different work centre\./);
  });

  it('warns when the template was written for a different asset', () => {
    // Warned, not blocked: a planner may have a good reason to deviate, and
    // refusing would leave no way to record that they did.
    expect(createPage).toMatch(/is written for a different asset/);
  });

  it('names the asset in the warning, so it can be checked against the ticket', () => {
    expect(createPage).toMatch(/selectedTaskList\.equipment\.equipmentCode/);
  });

  it('raises no warning when the template is not tied to one asset', () => {
    // The rule keys on the template naming a specific asset, so a fleet-wide
    // routine applied to any asset stays silent.
    expect(createPage).toMatch(/if \(!selectedTaskList\?\.equipmentId \|\| !equipmentId\) return null;/);
  });
});

describe('a template outage does not stop anyone raising a work order', () => {
  it('settles the template fetch separately from the required options', () => {
    // Templates are an accelerator. Failing the whole form because they could
    // not be listed would block the ordinary case of raising a job by hand.
    expect(createPage).toMatch(/taskListService\.getAll\(\)\.catch\(\(\) => \[\] as TaskList\[\]\)/);
  });
});

describe('the server side the form depends on', () => {
  it('still copies the steps in the create transaction', () => {
    expect(woRoute).toMatch(/Passing[\s\S]{0,80}taskListId copies that reusable task list's operations/);
  });
});

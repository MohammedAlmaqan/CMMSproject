import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const detail = readFileSync(
  resolve(here, '../../../app/src/pages/WorkOrderDetailPage.tsx'), 'utf8');
const materialsRoute = readFileSync(
  resolve(here, '../../src/routes/workOrderMaterials.ts'), 'utf8');

// SOW 3.1.5: work order material lines must be tied to the operation that needs
// them. C.13 gave the column a home in the database and made the API validate
// it. What it did not do is let anyone set it, so the column stayed null in
// practice and a stevedore had no way to record which step was blocked.
//
// The backend treats a null operation as a legitimate job-level line rather than
// an error, because a crane hire charged to the job as a whole has no single
// step. The screen therefore has to offer job-level deliberately, not by being
// empty by accident.

describe('a material line can name the step it is issued to', () => {
  it('offers the work order own steps, not a free-text field', () => {
    // The API rejects an operation from another work order, so a text box could
    // only ever produce a failed save.
    expect(detail).toMatch(/<option key=\{op\.operationId\} value=\{op\.operationId\}>/);
  });

  it('labels each option with its sequence number, because steps are numbered', () => {
    expect(detail).toMatch(/Step \{op\.sequenceNumber\} — \{op\.description\}/);
  });

  it('offers job-level as a first class choice', () => {
    expect(detail).toMatch(/<option value="">Whole work order \(job-level\)<\/option>/);
  });

  it('sends the choice on create', () => {
    expect(detail).toMatch(/operationId: matForm\.operationId \|\| null,/);
  });

  it('sends the choice on update too, so a line can be reassigned', () => {
    expect(detail).toMatch(/operationId: editMatForm\.operationId \|\| null,/);
  });

  it('sends null rather than an empty string, so job-level is null in the database', () => {
    // An empty string is not null. Storing it would make the column non-null with
    // a value that matches no step, and the read side would try to render it.
    expect(detail).not.toMatch(/operationId: matForm\.operationId,/);
  });

  it('reads the operation back when editing an existing line', () => {
    expect(detail).toMatch(/operationId: wm\.operationId \?\? '',/);
  });
});

describe('the table shows where a part is going', () => {
  it('has a column for it', () => {
    expect(detail).toMatch(/'Issued To'/);
  });

  it('distinguishes a step line from a job-level line', () => {
    // Blank would be ambiguous: it would look like missing data rather than a
    // deliberate choice, and the two mean different things to a stevedore.
    expect(detail).toMatch(/<span className="text-amber">Step \{wm\.operation\.sequenceNumber\}<\/span>/);
    expect(detail).toMatch(/<span className="text-tertiary">Job-level<\/span>/);
  });

  it('lets the step be changed in place, not only at creation', () => {
    expect(detail).toMatch(/aria-label="Edit issued to step"/);
  });
});

describe('the backend contract the screen depends on', () => {
  it('rejects an operation belonging to a different work order', () => {
    expect(materialsRoute).toMatch(/workOrderId/);
    expect(materialsRoute).toMatch(/materialRules/);
  });

  it('returns the operation on the read side, or the column would be write-only', () => {
    expect(materialsRoute).toMatch(/operation: true/);
  });
});

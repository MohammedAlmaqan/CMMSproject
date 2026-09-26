import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const route = readFileSync(resolve(here, '../../src/routes/attachments.ts'), 'utf8');
const schema = readFileSync(resolve(here, '../../src/utils/validation.ts'), 'utf8');
const page = readFileSync(
  resolve(here, '../../../app/src/pages/EquipmentDetailPage.tsx'), 'utf8');
const woPage = readFileSync(
  resolve(here, '../../../app/src/pages/WorkOrderDetailPage.tsx'), 'utf8');

// SOW 3.1.2: equipment records are able to store documents, nameplates, manuals
// and drawings. The attachment API and service already supported the Equipment
// entity type, but no screen used it, so the capability existed only in the
// backend and the register recorded the capability as not being there.

describe('the backend already allowed equipment documents', () => {
  it('permits Equipment as an attachment target', () => {
    expect(schema).toMatch(/attachmentEntityTypeSchema = z\.enum\(\['WorkOrder', 'Notification', 'Equipment'\]\)/);
  });

  it('so the fix belongs in the screen, not in a new API', () => {
    // Adding a second, equipment-specific attachment API would have been the
    // wrong fix for a capability that was already present and simply unused.
    expect(page).not.toMatch(/equipmentService\.\w*[Dd]ocument/);
    expect(page).toMatch(/attachmentService\.upload\('Equipment'/);
  });
});

describe('the equipment screen stores documents', () => {
  it('has a documents tab', () => {
    expect(page).toMatch(/type EqTab =[^;]*'documents'/);
    expect(page).toMatch(/id: 'documents', label: 'Documents', icon: Paperclip/);
  });

  it('loads the documents for this equipment', () => {
    expect(page).toMatch(/attachmentService\.getByEntity\('Equipment', id!\)/);
  });

  it('uploads against the Equipment entity type', () => {
    expect(page).toMatch(/attachmentService\.upload\('Equipment', id!, file\)/);
  });

  it('downloads and deletes', () => {
    expect(page).toMatch(/attachmentService\.download\(att\)/);
    expect(page).toMatch(/attachmentService\.remove\(att\.attachmentId\)/);
  });

  it('reports the outcome instead of failing silently', () => {
    expect(page).toMatch(/setAttSuccess\(`Uploaded \$\{created\.originalName\}`\)/);
    expect(page).toMatch(/setAttError\(err instanceof ApiError \? err\.message : 'Upload failed'\)/);
  });

  it('clears the file input so the same file can be chosen twice', () => {
    // Without this, re-picking an unchanged file fires no change event and the
    // upload silently does nothing, which reads as a broken button.
    expect(page).toMatch(/fileInputRef\.current\.value = ''/);
  });

  it('says so plainly when there are none', () => {
    expect(page).toMatch(/No documents on this equipment/);
  });

  it('shows the size, author and date, so a document is identifiable', () => {
    expect(page).toMatch(/formatBytes\(att\.sizeBytes\)/);
    expect(page).toMatch(/att\.createdBy/);
    expect(page).toMatch(/new Date\(att\.createdDate\)\.toLocaleString\(\)/);
  });

  it('hides delete from roles the API would reject', () => {
    // The API independently requires Maintenance Supervisor, so this only
    // avoids offering a control that always fails.
    expect(page).toMatch(
      /const canDeleteAttachments = hasPermission\(\['Maintenance Supervisor', 'Administrator'\]\)/);
    expect(page).toMatch(/\{canDeleteAttachments && \(/);
  });

  it('names the icon-only buttons for screen readers', () => {
    expect(page).toMatch(/aria-label=\{`Download \$\{att\.originalName\}`\}/);
    expect(page).toMatch(/aria-label=\{`Delete \$\{att\.originalName\}`\}/);
  });
});

describe('documents cannot be attached to something that is not there', () => {
  it('confirms the parent exists and is not soft-deleted', () => {
    // An attachment is only reachable through its parent, so one whose parent
    // is missing or deleted can never be listed, downloaded or deleted from any
    // screen, while the file remains on disk. The upload path is now written by
    // two screens, so this is the point where that orphan becomes reachable.
    expect(route).toMatch(
      /prisma\.equipment\.findFirst\(\{ where: \{ equipmentId: entityId, isDeleted: false \}/);
    expect(route).toMatch(
      /prisma\.workOrder\.findFirst\(\{ where: \{ workOrderId: entityId, isDeleted: false \}/);
    expect(route).toMatch(
      /prisma\.notification\.findFirst\(\{ where: \{ notificationId: entityId, isDeleted: false \}/);
  });

  it('rejects with 404 rather than creating the row', () => {
    expect(route).toMatch(/if \(!parent\) \{\s*return res\.status\(404\)\.json\(\{ error: `\$\{entityType\} not found` \}\);/);
  });

  it('checks before writing the file, so a rejection leaves nothing on disk', () => {
    const post = route.slice(route.indexOf("router.post('/'"));
    const checkAt = post.indexOf('if (!parent)');
    const writeAt = post.indexOf('fs.writeFileSync');
    expect(checkAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(checkAt);
  });

  it('multer holds the file in memory, so nothing is written before the check', () => {
    expect(route).toMatch(/const storage = multer\.memoryStorage\(\)/);
  });
});

describe('both screens write the same way', () => {
  it('equipment gained documents without changing the work order behaviour', () => {
    expect(woPage).toMatch(/attachmentService\.upload\('WorkOrder', id!, file\)/);
    expect(page).toMatch(/attachmentService\.upload\('Equipment', id!, file\)/);
  });
});

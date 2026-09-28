import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(
  resolve(here, '../../../app/src/pages/WorkOrderDetailPage.tsx'), 'utf8');
const notifPage = readFileSync(
  resolve(here, '../../../app/src/pages/NotificationDetailPage.tsx'), 'utf8');
const route = readFileSync(resolve(here, '../../src/routes/workOrders.ts'), 'utf8');
const app = readFileSync(resolve(here, '../../../app/src/App.tsx'), 'utf8');

// SOW 3.2.3: the system shows the relationship and allows navigation between a
// notification and a work order. The matrix recorded that the forward direction
// worked and the reverse did not: the work order read already returned the
// links, but no screen presented them, so the relationship was only visible from
// the notification side.

describe('the work order read already carried the links', () => {
  it('includes the notification relation, so no extra query is needed', () => {
    // The gap was presentation only. Fetching again would have been the wrong
    // fix for a field that was already in the payload. The sweep's isDeleted
    // filter on the link list sits in front of the include.
    expect(route).toMatch(/notifications: \{\s*where: \{ isDeleted: false \},\s*include: \{\s*notification: \{ select: \{ notificationId: true, notificationNumber: true, description: true, status: true \} \}/);
  });
});

describe('the work order screen presents the reverse link', () => {
  it('has a notifications tab', () => {
    expect(page).toMatch(/type DetailTab =[^;]*'notifications'/);
    expect(page).toMatch(/id: 'notifications', label: 'Notifications', icon: Bell/);
  });

  it('counts the linked notifications on the tab', () => {
    expect(page).toMatch(/count: wo\.notifications\?\.length \|\| 0/);
  });

  it('renders a tab body for it', () => {
    expect(page).toMatch(/activeTab === 'notifications' &&/);
  });

  it('navigates to the notification, mirroring the other direction', () => {
    // NotificationDetailPage already navigates to /work-orders/:id. Without the
    // reverse the relationship is one-way, which is what the matrix recorded.
    expect(page).toMatch(/navigate\(`\/notifications\/\$\{n\.notificationId\}`\)/);
    expect(notifPage).toMatch(/navigate\(`\/work-orders\/\$\{wo\.workOrderId\}`\)/);
  });

  it('targets a route that exists', () => {
    expect(app).toMatch(/path="\/notifications\/:id"/);
  });

  it('shows the number, status and description, so the link is meaningful', () => {
    expect(page).toMatch(/n\.notificationNumber/);
    expect(page).toMatch(/n\.status/);
    expect(page).toMatch(/n\.description/);
  });

  it('says so plainly when nothing is linked', () => {
    // A work order raised by hand has no notifications, and an unexplained blank
    // tab reads as a loading failure.
    expect(page).toMatch(/No notifications are linked to this work order/);
  });

  it('is keyboard reachable, not mouse only', () => {
    expect(page).toMatch(/onKeyDown=\{\(e\) => \{\s*if \(e\.key === 'Enter' \|\| e\.key === ' '\)/);
  });
});

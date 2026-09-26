import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { systemConfigUpdateSchema } from '../../src/utils/validation.js';

const here = dirname(fileURLToPath(import.meta.url));
const route = readFileSync(resolve(here, '../../src/routes/systemConfig.ts'), 'utf8');
const sequence = readFileSync(resolve(here, '../../src/utils/sequence.ts'), 'utf8');
const page = readFileSync(
  resolve(here, '../../../app/src/pages/AdministrationPage.tsx'), 'utf8');
const service = readFileSync(
  resolve(here, '../../../app/src/services/systemConfigService.ts'), 'utf8');

// SOW 3.3.3 / 3.2.2: work order and notification numbers carry a configurable
// prefix. Generation already read SystemConfig, so the wiring existed — what did
// not exist was any way to change the value, and the admin screen printed a
// hardcoded "WO-". The setting was configurable in name only.

describe('the prefix a number will actually use', () => {
  it('is read from the same key the admin screen writes', () => {
    // The two ends must agree on the key name, or the screen would save a value
    // that generation never reads and the setting would still do nothing.
    expect(sequence).toMatch(/key: 'wo_number_prefix'/);
    expect(sequence).toMatch(/key: 'notif_number_prefix'/);
    expect(route).toMatch(/key: 'wo_number_prefix'/);
    expect(route).toMatch(/key: 'notif_number_prefix'/);
  });

  it('joins the prefix and the padded sequence with a hyphen', () => {
    expect(sequence).toMatch(/`\$\{prefix\}-\$\{String\(sequence\)\.padStart\(6, '0'\)\}`/);
  });
});

describe('only known settings are writable', () => {
  it('restricts writes to the prefix keys', () => {
    // A generic key/value writer is a footgun: anything stored here is trusted
    // by other code paths, so a caller must not be able to invent keys.
    const r = systemConfigUpdateSchema.safeParse({ key: 'wo_number_prefix', value: 'WO' });
    expect(r.success).toBe(true);
    expect(systemConfigUpdateSchema.safeParse({ key: 'anything_at_all', value: 'x' }).success).toBe(false);
  });

  it('rejects an empty prefix', () => {
    expect(systemConfigUpdateSchema.safeParse({ key: 'wo_number_prefix', value: '' }).success).toBe(false);
    expect(systemConfigUpdateSchema.safeParse({ key: 'wo_number_prefix', value: '   ' }).success).toBe(false);
  });

  it('rejects a prefix containing a separator or a space', () => {
    // A prefix is pasted into every generated number, so anything that makes the
    // number ambiguous to read or to filter on is refused.
    for (const value of ['WO 1', 'WO/1', 'WO,1', 'WO.1', 'WO:1', 'WO#1']) {
      expect(systemConfigUpdateSchema.safeParse({ key: 'wo_number_prefix', value }).success).toBe(false);
    }
  });

  it('accepts the characters a real prefix needs', () => {
    for (const value of ['WO', 'N', 'WO_2026', 'WO-01', 'MRO']) {
      expect(systemConfigUpdateSchema.safeParse({ key: 'wo_number_prefix', value }).success).toBe(true);
    }
  });

  it('caps the length so a number cannot be pushed off a column', () => {
    expect(systemConfigUpdateSchema.safeParse({
      key: 'wo_number_prefix', value: 'A'.repeat(21),
    }).success).toBe(false);
  });
});

describe('the configuration endpoint', () => {
  it('reads and writes, and writes only for an administrator', () => {
    expect(route).toMatch(/router\.get\('\/'/);
    expect(route).toMatch(/router\.put\('\/', authorizeMinRole\('Administrator'\)/);
  });

  it('reports the effective value, not a null, for a setting never written', () => {
    // An admin screen showing an empty box for a setting that is in force is
    // worse than one showing the default.
    expect(route).toMatch(/byKey\.get\(setting\.key\) \?\? setting\.fallback/);
    expect(route).toMatch(/isDefault: !byKey\.has\(setting\.key\)/);
  });

  it('upserts, so saving a prefix that has never been set works', () => {
    expect(route).toMatch(/prisma\.systemConfig\.upsert\(/);
  });

  it('audits the change with the previous value', () => {
    expect(route).toMatch(/oldValue: previous\?\.value \?\? setting\.fallback/);
    expect(route).toMatch(/newValue: value/);
  });

  it('is mounted in the api', () => {
    const index = readFileSync(resolve(here, '../../src/index.ts'), 'utf8');
    expect(index).toMatch(/app\.use\('\/api\/system-config'/);
  });
});

describe('the admin screen edits the real value', () => {
  it('no longer prints a hardcoded prefix', () => {
    // The original defect: two fixed strings that looked like settings.
    expect(page).not.toMatch(/SettingItem label="WO Number Prefix" value="WO-"/);
    expect(page).not.toMatch(/SettingItem label="Notification Prefix" value="NOT-"/);
  });

  it('loads the settings from the api instead of assuming them', () => {
    expect(service).toMatch(/getAll: \(\) => api\.get<SystemSetting\[\]>\('\/system-config'\)/);
    expect(page).toMatch(/systemConfigService\s*\n?\s*\.getAll\(\)/);
  });

  it('saves through the api and reflects the saved value', () => {
    expect(service).toMatch(/update: \(key: string, value: string\)/);
    expect(page).toMatch(/systemConfigService\.update\(key, value\)/);
  });

  it('keeps read-only settings visually distinct from editable ones', () => {
    expect(page).toMatch(/function SettingItem\(/);
    expect(page).toMatch(/function EditableSetting\(/);
  });

  it('surfaces a failed save rather than dropping it', () => {
    expect(page).toMatch(/catch \(err\) \{\s*\n\s*setSettingsError\(\(err as Error\)\.message\)/);
  });

  it('surfaces a failed load rather than showing an empty settings panel', () => {
    expect(page).toMatch(/role="alert"/);
  });
});

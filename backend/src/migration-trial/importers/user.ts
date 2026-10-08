/** User importer: 2 rows. passwordHash fabricated per the README; the rest is
 * the sample's trial-only placeholder data. */
import bcrypt from 'bcryptjs';
import type { TrialCsvRow } from './csv.js';
import type { DatasetResult, DatasetImporter } from './types.js';
import { textCol, boolCol, intCol, enumCol } from './read.js';
import { cell, derived, resolve, RowError, type RowBuilder } from './build.js';
import { ROW_KEY } from './util.js';
import { userRoleSchema } from '../../utils/validation.js';

function parse(rows: TrialCsvRow[]): DatasetResult {
  const result: DatasetResult = {
    name: 'User',
    model: 'User',
    naturalKey: { field: 'username', column: 'username' },
    pkField: 'userId',
    rows: [],
    rejected: [],
  };

  const username = textCol({ required: true });
  const fullName = textCol({ required: true });
  const email = textCol({ required: true });
  const role = enumCol(userRoleSchema, {});
  const workCenterId = textCol({});
  const isActive = boolCol({ blankDefault: true });
  const failedLoginCount = intCol({ blankDefault: 0 });
  const lockedUntil = textCol({});
  const lastLogin = textCol({});

  for (const row of rows) {
    const b: RowBuilder = { target: {}, provenance: {}, refs: [] };
    try {
      cell(b, 'username', username(row.cells['username'] ?? '', 'username'));
      cell(b, 'fullName', fullName(row.cells['fullName'] ?? '', 'fullName'));
      cell(b, 'email', email(row.cells['email'] ?? '', 'email'));
      cell(b, 'role', role(row.cells['role'] ?? '', 'role'));
      const workCenter = workCenterId(row.cells['workCenterId'] ?? '', 'workCenterId');
      cell(b, 'workCenterId', workCenter);
      if (workCenter.kind === 'mapped') resolve(b, 'workCenterId', workCenter.value, 'WorkCenter', 'code');
      cell(b, 'isActive', isActive(row.cells['isActive'] ?? '', 'isActive'));
      cell(b, 'failedLoginCount', failedLoginCount(row.cells['failedLoginCount'] ?? '', 'failedLoginCount'));
      cell(b, 'lockedUntil', lockedUntil(row.cells['lockedUntil'] ?? '', 'lockedUntil'));
      cell(b, 'lastLogin', lastLogin(row.cells['lastLogin'] ?? '', 'lastLogin'));
      derived(b, 'passwordHash', bcrypt.hashSync('migration-import-placeholder', 10), 'placeholder hash fabricated on import (README); real credentials are set afterwards through Administration');
      derived(b, 'isDeleted', false, 'isDeleted=false on import (README convention)');
      result.rows.push({
        row: row.number,
        key: ROW_KEY(b.target.username),
        target: b.target,
        provenance: b.provenance,
        refs: b.refs,
      });
    } catch (err) {
      if (err instanceof RowError) {
        result.rejected.push({ row: row.number, key: ROW_KEY(b.target.username, row.number), reason: err.message });
      } else {
        throw err;
      }
    }
  }
  return result;
}

function verify(created: Record<string, unknown>): string[] {
  const hash = created.passwordHash;
  if (typeof hash !== 'string' || !hash.startsWith('$2')) {
    return ['passwordHash placeholder was not delivered as a bcrypt-format hash'];
  }
  return [];
}

export const userImporter: DatasetImporter = {
  name: 'User',
  model: 'User',
  naturalKey: { field: 'username', column: 'username' },
  pkField: 'userId',
  parse,
  verify,
};
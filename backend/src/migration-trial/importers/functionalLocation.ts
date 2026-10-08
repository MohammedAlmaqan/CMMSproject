/** FunctionalLocation importer: 22 rows, parents before children (file order). */
import type { TrialCsvRow } from './csv.js';
import type { DatasetResult, DatasetImporter } from './types.js';
import { textCol, dateCol, boolCol, enumCol } from './read.js';
import { cell, derived, resolve, RowError, type RowBuilder } from './build.js';
import { ROW_KEY } from './util.js';
import { functionalLocationOperationalStatusValues, locationTypeValues } from './values.js';
import { z } from 'zod';

const locationTypeSchema = z.enum(locationTypeValues);
const flOperationalStatusSchema = z.enum(functionalLocationOperationalStatusValues);

function parse(rows: TrialCsvRow[]): DatasetResult {
  const result: DatasetResult = {
    name: 'FunctionalLocation',
    model: 'FunctionalLocation',
    naturalKey: { field: 'locationCode', column: 'locationCode' },
    pkField: 'functionalLocationId',
    rows: [],
    rejected: [],
  };

  const locationCode = textCol({ required: true });
  const description = textCol({ required: true });
  const parentLocationId = textCol({});
  const locationType = enumCol(locationTypeSchema, {});
  const operationalStatus = enumCol(flOperationalStatusSchema, { blankDefault: 'Active' });
  const installationDate = dateCol();
  const gpsCoordinates = textCol({});
  const safetyCritical = boolCol({ blankDefault: false });

  for (const row of rows) {
    const b: RowBuilder = { target: {}, provenance: {}, refs: [] };
    try {
      cell(b, 'locationCode', locationCode(row.cells['locationCode'] ?? '', 'locationCode'));
      cell(b, 'description', description(row.cells['description'] ?? '', 'description'));
      const parent = parentLocationId(row.cells['parentLocationId'] ?? '', 'parentLocationId');
      if (parent.kind === 'mapped') {
        b.target.parentLocationId = parent.value;
        resolve(b, 'parentLocationId', parent.value, 'FunctionalLocation', 'locationCode');
      } else {
        cell(b, 'parentLocationId', parent);
      }
      cell(b, 'locationType', locationType(row.cells['locationType'] ?? '', 'locationType'));
      cell(b, 'operationalStatus', operationalStatus(row.cells['operationalStatus'] ?? '', 'operationalStatus'));
      cell(b, 'installationDate', installationDate(row.cells['installationDate'] ?? '', 'installationDate'));
      cell(b, 'gpsCoordinates', gpsCoordinates(row.cells['gpsCoordinates'] ?? '', 'gpsCoordinates'));
      cell(b, 'safetyCritical', safetyCritical(row.cells['safetyCritical'] ?? '', 'safetyCritical'));
      derived(b, 'isDeleted', false, 'isDeleted=false on import (README convention)');
      result.rows.push({
        row: row.number,
        key: ROW_KEY(b.target.locationCode),
        target: b.target,
        provenance: b.provenance,
        refs: b.refs,
      });
    } catch (err) {
      if (err instanceof RowError) {
        result.rejected.push({ row: row.number, key: ROW_KEY(b.target.locationCode, row.number), reason: err.message });
      } else {
        throw err;
      }
    }
  }
  return result;
}

export const functionalLocationImporter: DatasetImporter = {
  name: 'FunctionalLocation',
  model: 'FunctionalLocation',
  naturalKey: { field: 'locationCode', column: 'locationCode' },
  pkField: 'functionalLocationId',
  parse,
};
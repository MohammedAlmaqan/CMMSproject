/** Equipment importer: 9 rows. Blank required strings stay "" (as-received, per
 * FILL_REPORT "Trial-only flags" item 6); audit by-fields use "system" when the
 * source handle is not a sample user; source dates are carried where present. */
import type { TrialCsvRow } from './csv.js';
import type { DatasetResult, DatasetImporter } from './types.js';
import { textCol, dateCol, enumCol, jsonCol } from './read.js';
import { cell, derived, resolve, RowError, type RowBuilder } from './build.js';
import { ROW_KEY } from './util.js';
import { criticalityValues, equipmentOperationalStatusValues } from './values.js';
import { z } from 'zod';

const criticalitySchema = z.enum(criticalityValues);
const eqOperationalStatusSchema = z.enum(equipmentOperationalStatusValues);

function parse(rows: TrialCsvRow[]): DatasetResult {
  const result: DatasetResult = {
    name: 'Equipment',
    model: 'Equipment',
    naturalKey: { field: 'equipmentCode', column: 'equipmentCode' },
    pkField: 'equipmentId',
    rows: [],
    rejected: [],
  };

  const equipmentCode = textCol({ required: true });
  const name = textCol({ required: true });
  const description = textCol({ required: true });
  const functionalLocationId = textCol({ required: true });
  // These are required-and-non-null in the schema but the Equip list master has no
  // value for some rows; the empty string is the as-received "no data" form
  // (FILL_REPORT item 6) and is preserved, not invented into a value.
  const requiredOrAsIs = textCol({ required: true, asIs: true });
  const assetTag = textCol({ required: true });
  const criticality = enumCol(criticalitySchema, {});
  const installationDate = dateCol();
  const warrantyExpiryDate = dateCol();
  const operationalStatus = enumCol(eqOperationalStatusSchema, { blankDefault: 'Active' });
  const technicalParameters = jsonCol({ blankDefault: {} });
  const createdBy = textCol({ blankDefault: 'system' });
  const createdDate = dateCol({ required: true });
  const modifiedBy = textCol({ blankDefault: 'system' });
  const modifiedDate = dateCol({ required: true });

  for (const row of rows) {
    const b: RowBuilder = { target: {}, provenance: {}, refs: [] };
    try {
      cell(b, 'equipmentCode', equipmentCode(row.cells['equipmentCode'] ?? '', 'equipmentCode'));
      cell(b, 'name', name(row.cells['name'] ?? '', 'name'));
      cell(b, 'description', description(row.cells['description'] ?? '', 'description'));
      const fl = functionalLocationId(row.cells['functionalLocationId'] ?? '', 'functionalLocationId');
      cell(b, 'functionalLocationId', fl);
      if (fl.kind === 'mapped') resolve(b, 'functionalLocationId', fl.value, 'FunctionalLocation', 'locationCode');
      cell(b, 'manufacturer', requiredOrAsIs(row.cells['manufacturer'] ?? '', 'manufacturer'));
      cell(b, 'model', requiredOrAsIs(row.cells['model'] ?? '', 'model'));
      cell(b, 'serialNumber', requiredOrAsIs(row.cells['serialNumber'] ?? '', 'serialNumber'));
      cell(b, 'assetTag', assetTag(row.cells['assetTag'] ?? '', 'assetTag'));
      cell(b, 'equipmentClass', requiredOrAsIs(row.cells['equipmentClass'] ?? '', 'equipmentClass'));
      cell(b, 'criticality', criticality(row.cells['criticality'] ?? '', 'criticality'));
      cell(b, 'installationDate', installationDate(row.cells['installationDate'] ?? '', 'installationDate'));
      cell(b, 'warrantyExpiryDate', warrantyExpiryDate(row.cells['warrantyExpiryDate'] ?? '', 'warrantyExpiryDate'));
      cell(b, 'operationalStatus', operationalStatus(row.cells['operationalStatus'] ?? '', 'operationalStatus'));
      cell(b, 'technicalParameters', technicalParameters(row.cells['technicalParameters'] ?? '', 'technicalParameters'));
      cell(b, 'createdBy', createdBy(row.cells['createdBy'] ?? '', 'createdBy'));
      cell(b, 'createdDate', createdDate(row.cells['createdDate'] ?? '', 'createdDate'));
      cell(b, 'modifiedBy', modifiedBy(row.cells['modifiedBy'] ?? '', 'modifiedBy'));
      cell(b, 'modifiedDate', modifiedDate(row.cells['modifiedDate'] ?? '', 'modifiedDate'));
      derived(b, 'isDeleted', false, 'isDeleted=false on import (README convention)');
      result.rows.push({
        row: row.number,
        key: ROW_KEY(b.target.equipmentCode),
        target: b.target,
        provenance: b.provenance,
        refs: b.refs,
      });
    } catch (err) {
      if (err instanceof RowError) {
        result.rejected.push({ row: row.number, key: ROW_KEY(b.target.equipmentCode, row.number), reason: err.message });
      } else {
        throw err;
      }
    }
  }
  return result;
}

export const equipmentImporter: DatasetImporter = {
  name: 'Equipment',
  model: 'Equipment',
  naturalKey: { field: 'equipmentCode', column: 'equipmentCode' },
  pkField: 'equipmentId',
  parse,
};
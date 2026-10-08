/** Trial-run dataset registry, in import order (parents before children, per the
 * migration-templates README fill order). */
import type { DatasetImporter, DatasetResult } from './types.js';

import { workCenterImporter } from './workCenter.js';
import { userImporter } from './user.js';
import { functionalLocationImporter } from './functionalLocation.js';
import { equipmentImporter } from './equipment.js';
import { materialImporter } from './material.js';
import { notificationImporter } from './notification.js';
import { workOrderImporter } from './workOrder.js';
import { workOrderNotifLinkImporter } from './workOrderNotifLink.js';
import { commentImporter } from './comment.js';

export { type TrialCsvRow, parseCsv } from './csv.js';
export type {
  ImportedRow,
  ImportedCell,
  RejectedRow,
  DatasetResult,
  DatasetImporter,
} from './types.js';
export { RowError } from './build.js';

export const DATASET_IMPORTERS: DatasetImporter[] = [
  workCenterImporter,
  userImporter,
  functionalLocationImporter,
  equipmentImporter,
  materialImporter,
  notificationImporter,
  workOrderImporter,
  workOrderNotifLinkImporter,
  commentImporter,
];

export function importerByName(name: string): DatasetImporter | undefined {
  return DATASET_IMPORTERS.find((d) => d.name === name);
}

export function parseDataset(name: string, rows: import('./csv.js').TrialCsvRow[]): DatasetResult | undefined {
  const importer = importerByName(name);
  return importer ? importer.parse(rows) : undefined;
}
import { api } from '@/lib/api';

/**
 * The upload result, mirroring `CsvImportOutcome` in backend/src/utils/csvRoutes.ts.
 * One shape for every module, whether the API applied the file strictly (all or
 * nothing) or partially (accepted rows kept, the rest named): `rejected` is
 * always present, and is empty only when every row was accepted.
 */
export interface CsvRejection {
  /** 1-based line in the uploaded file; the header is line 1. */
  row: number;
  reason: string;
}

export interface CsvImportResult {
  created: number;
  updated: number;
  rejected: CsvRejection[];
}

export const csvService = {
  exportCsv: (path: string, fallbackFilename: string) =>
    api.download(path, undefined, fallbackFilename),

  importCsv: (path: string, file: File) => api.upload<CsvImportResult>(path, file),
};

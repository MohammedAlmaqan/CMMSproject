import { describe, it, expect } from 'vitest';
import { uploadExtension, uploadRejectionReason } from '../../src/utils/uploadRules.js';

describe('upload extension parsing (SOW 3.3.8, row 36)', () => {
  it('reads the extension case-insensitively', () => {
    expect(uploadExtension('DRAWING.DWG')).toBe('dwg');
    expect(uploadExtension('a.b.pdf')).toBe('pdf');
  });

  it('treats a name with no usable extension as having none', () => {
    expect(uploadExtension('README')).toBe('');
    expect(uploadExtension('.hidden')).toBe('');
  });
});

describe('the widened document allowlist (SOW 3.3.8 / D-11, row 36)', () => {
  it('accepts documents and engineering drawings by extension', () => {
    const names = [
      'report.docx', 'sheet.xlsx', 'manual.pdf', 'photo.jpeg', 'notes.txt',
      'drawing.dwg', 'site.dxf', 'model.step', 'scan.tiff', 'data.csv',
    ];
    for (const name of names) {
      expect(uploadRejectionReason('application/octet-stream', name)).toBeNull();
    }
  });

  it('blocks executables and scripts by extension whatever MIME is claimed', () => {
    const names = [
      'payload.exe', 'installer.msi', 'deploy.ps1', 'run.bat', 'evil.js',
      'lib.dll', 'macro.vbs', 'page.html', 'vector.svg',
    ];
    for (const name of names) {
      expect(uploadRejectionReason('text/plain', name)).toMatch(/not allowed/);
    }
  });

  it('falls back to the MIME type only when the extension is unknown', () => {
    expect(uploadRejectionReason('application/pdf', 'scan.unknown')).toBeNull();
    expect(uploadRejectionReason('application/octet-stream', 'scan.unknown')).toMatch(/Unsupported/);
  });
});

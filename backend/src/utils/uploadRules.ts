/**
 * SOW 3.3.8 / D-11: the delivered allowlist is widened to the document and
 * drawing types the plant actually attaches, while executables and scripts stay
 * blocked. A multipart MIME type is client-supplied and cannot be trusted on its
 * own, so the filename extension is the primary control and MIME is only the
 * fallback for names with no recognised extension. Archive formats (zip, 7z,
 * rar) are deliberately outside the list: a container can carry an executable
 * past a filename check, which is the exposure D-11 chose to avoid.
 */

export const BLOCKED_UPLOAD_EXTENSIONS = new Set([
  'exe', 'msi', 'msp', 'com', 'scr', 'pif', 'cpl', 'gadget', 'application',
  'bat', 'cmd', 'sh', 'bash', 'zsh', 'ps1', 'psm1', 'psd1', 'vbs', 'vbe',
  'js', 'jse', 'mjs', 'cjs', 'wsf', 'wsh', 'ws', 'hta', 'jar', 'class',
  'dll', 'sys', 'drv', 'ocx', 'lnk', 'reg', 'inf', 'scf', 'msh', 'msh1', 'msh2',
  'apk', 'app', 'dmg', 'deb', 'rpm', 'html', 'htm', 'xhtml', 'svg', 'swf',
]);

export const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tif', 'tiff', 'heic', 'heif', 'ico',
  'pdf', 'txt', 'md', 'rtf', 'log', 'csv', 'tsv', 'xml', 'json', 'yaml', 'yml',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'msg', 'eml',
  'dwg', 'dxf', 'dwf', 'dgn', 'rvt', 'skp', 'step', 'stp', 'iges', 'igs', 'stl',
]);

export const ALLOWED_UPLOAD_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff',
  'application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'text/xml',
  'application/xml', 'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
]);

export function uploadExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export function uploadRejectionReason(mimeType: string, originalName: string): string | null {
  const ext = uploadExtension(originalName);
  if (ext && BLOCKED_UPLOAD_EXTENSIONS.has(ext)) {
    return `Executable and script files are not allowed: .${ext}`;
  }
  if (ext && ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
    return null;
  }
  if (mimeType && ALLOWED_UPLOAD_MIMES.has(mimeType)) {
    return null;
  }
  return `Unsupported file type: ${mimeType || ext || 'unknown'}`;
}

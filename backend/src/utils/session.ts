import { createHash, randomBytes } from 'crypto';
import { Request, Response } from 'express';

/**
 * Opaque refresh-token transport. The browser holds the raw token in an httpOnly
 * cookie; the server stores only its SHA-256 hash, so a database leak exposes no
 * usable credential. The cookie is scoped to the API path so it is sent to /api
 * and /api/v1 but nothing else on the origin.
 */
export const REFRESH_COOKIE_NAME = 'cmms_refresh';

// /api is a strict prefix of the versioned /api/v1 mount, so this one path covers
// both prefixes the API is served under.
export const REFRESH_COOKIE_PATH = '/api';

export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function cookieAttributes() {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    path: REFRESH_COOKIE_PATH,
  };
}

export function readRefreshCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== REFRESH_COOKIE_NAME) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}

export function setRefreshCookie(res: Response, raw: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE_NAME, raw, { ...cookieAttributes(), expires: expiresAt });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, cookieAttributes());
}

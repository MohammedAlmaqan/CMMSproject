import { describe, it, expect } from 'vitest';
import type { Request, Response } from 'express';
import {
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  generateRefreshToken,
  hashRefreshToken,
  readRefreshCookie,
  setRefreshCookie,
  clearRefreshCookie,
} from '../../src/utils/session.js';

// The helpers under test are pure: they touch node:crypto and the shape of an
// Express response, but no database and no secret, so they run under the unit
// config with no setup file.

function captureRes() {
  const calls: { cookie?: unknown[]; clearCookie?: unknown[] } = {};
  const res = {
    cookie: (...args: unknown[]) => {
      calls.cookie = args;
    },
    clearCookie: (...args: unknown[]) => {
      calls.clearCookie = args;
    },
  } as unknown as Response;
  return { res, calls };
}

describe('session token helpers (SOW 4.2, 5.5)', () => {
  it('generates a URL-safe, high-entropy, non-repeating token', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    // base64url: no characters that would need escaping in a cookie value.
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    // 48 bytes -> 64 base64url characters.
    expect(a.length).toBeGreaterThanOrEqual(64);
  });

  it('hashes deterministically to 64 hex chars, never the raw token', () => {
    const raw = generateRefreshToken();
    const hash = hashRefreshToken(raw);
    expect(hashRefreshToken(raw)).toBe(hash);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(raw);
  });

  it('reads the refresh cookie from among others', () => {
    const req = { headers: { cookie: 'theme=dark; cmms_refresh=abc.def-ghi; other=1' } } as unknown as Request;
    expect(readRefreshCookie(req)).toBe('abc.def-ghi');
  });

  it('returns null when the header or the cookie is absent', () => {
    expect(readRefreshCookie({ headers: {} } as unknown as Request)).toBeNull();
    expect(readRefreshCookie({ headers: { cookie: 'a=b; c=d' } } as unknown as Request)).toBeNull();
  });

  it('ignores malformed pairs without a value', () => {
    const req = { headers: { cookie: 'flag; cmms_refresh=x; trailing' } } as unknown as Request;
    expect(readRefreshCookie(req)).toBe('x');
  });

  it('sets the cookie httpOnly, SameSite=Strict and scoped to the API path', () => {
    const { res, calls } = captureRes();
    const expires = new Date(Date.now() + 1000);
    setRefreshCookie(res, 'raw-token', expires);
    const [name, value, options] = calls.cookie as [string, string, Record<string, unknown>];
    expect(name).toBe(REFRESH_COOKIE_NAME);
    expect(value).toBe('raw-token');
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      expires,
    });
    expect(options.secure).toBe(process.env.NODE_ENV === 'production');
  });

  it('clears the cookie with the same attributes it was set with', () => {
    const { res, calls } = captureRes();
    clearRefreshCookie(res);
    const [name, options] = calls.clearCookie as [string, Record<string, unknown>];
    expect(name).toBe(REFRESH_COOKIE_NAME);
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'strict', path: REFRESH_COOKIE_PATH });
  });
});

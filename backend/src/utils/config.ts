const secret = process.env.JWT_SECRET;
if (!secret) {
  throw new Error('JWT_SECRET environment variable is required. Refusing to start with an insecure default. Set JWT_SECRET in backend/.env');
}
const JWT_SECRET: string = secret;

function positiveInt(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// Access-token lifetime in seconds. Deliberately short: a bearer token is only as
// good as the session behind it, and the session is renewed by rotating the refresh
// token rather than by holding a long-lived JWT (SOW 5.5). JWT_EXPIRES_IN is still
// honoured as a legacy alias so existing deployments keep working.
const ACCESS_TOKEN_TTL =
  positiveInt(process.env.ACCESS_TOKEN_TTL) ??
  positiveInt(process.env.JWT_EXPIRES_IN) ??
  15 * 60;

// Absolute session lifetime in seconds, measured from first sign-in. A session
// never outlives this, even across refresh-token rotations.
const REFRESH_TOKEN_TTL = positiveInt(process.env.REFRESH_TOKEN_TTL) ?? 8 * 60 * 60;

// Server-side idle window in milliseconds (SOW 4.2). A session untouched for longer
// than this is revoked the next time it is presented and its access tokens stop
// working, independent of what the browser does.
const SESSION_IDLE_MS = positiveInt(process.env.SESSION_IDLE_MS) ?? 30 * 60 * 1000;

// Minimum spacing between lastUsedAt writes, so an active session does not write to
// the database on every request.
const SESSION_TOUCH_MS = 60 * 1000;

export {
  JWT_SECRET,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
  SESSION_IDLE_MS,
  SESSION_TOUCH_MS,
};

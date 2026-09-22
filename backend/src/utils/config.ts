const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = Number(process.env.JWT_EXPIRES_IN) > 0
  ? Number(process.env.JWT_EXPIRES_IN)
  : 8 * 60 * 60;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required. Refusing to start with an insecure default. Set JWT_SECRET in backend/.env');
}

export { JWT_SECRET, JWT_EXPIRES_IN };
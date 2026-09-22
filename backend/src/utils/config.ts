const secret = process.env.JWT_SECRET;
if (!secret) {
  throw new Error('JWT_SECRET environment variable is required. Refusing to start with an insecure default. Set JWT_SECRET in backend/.env');
}
const JWT_SECRET: string = secret;

const JWT_EXPIRES_IN = Number(process.env.JWT_EXPIRES_IN) > 0
  ? Number(process.env.JWT_EXPIRES_IN)
  : 8 * 60 * 60;

export { JWT_SECRET, JWT_EXPIRES_IN };
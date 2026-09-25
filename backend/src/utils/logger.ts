import pino from 'pino';

const LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

function resolveLevel(): string {
  const configured = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (configured && (LEVELS as readonly string[]).includes(configured)) {
    return configured;
  }
  return 'info';
}

// Credentials must never reach the log stream: pino-http copies the raw request
// headers and pino serialises thrown errors verbatim.
export const logger = pino({
  level: resolveLevel(),
  base: { service: 'cmms-api' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'password',
      'newPassword',
      'currentPassword',
      '*.password',
      '*.newPassword',
      '*.currentPassword',
    ],
    censor: '[redacted]',
  },
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import pinoHttp from 'pino-http';

import authRoutes from './routes/auth.js';
import functionalLocationRoutes from './routes/functionalLocations.js';
import equipmentRoutes from './routes/equipment.js';
import equipmentMeterRoutes from './routes/equipmentMeters.js';
import workCenterRoutes from './routes/workCenters.js';
import materialRoutes from './routes/materials.js';
import failureCodeRoutes from './routes/failureCodes.js';
import taskListRoutes from './routes/taskLists.js';
import notificationRoutes from './routes/notifications.js';
import workOrderRoutes from './routes/workOrders.js';
import workOrderOperationRoutes from './routes/workOrderOperations.js';
import workOrderMaterialRoutes from './routes/workOrderMaterials.js';
import laborRoutes from './routes/labor.js';
import externalServiceRoutes from './routes/externalServiceCosts.js';
import craftRoutes from './routes/crafts.js';
import maintenancePlanRoutes from './routes/maintenancePlans.js';
import safetyChecklistRoutes from './routes/safetyChecklists.js';
import reportRoutes from './routes/reports.js';
import alertRoutes from './routes/alerts.js';
import commentRoutes from './routes/comments.js';
import attachmentRoutes from './routes/attachments.js';
import auditLogRoutes from './routes/auditLog.js';
import userRoutes from './routes/users.js';
import dashboardRoutes from './routes/dashboard.js';
import { acquireStartupLock, runSchedulerOnce, startScheduler } from './services/scheduler.js';
import { prisma } from './utils/prisma.js';
import { logger } from './utils/logger.js';

const app = express();
const PORT = process.env.PORT || 4000;
// `trust proxy = 1` means the API trusts one hop of X-Forwarded-For, so a client
// able to reach port 4000 directly can spoof its source IP and defeat the login
// rate limiter. Binding to loopback removes that route entirely. The default stays
// 0.0.0.0 for direct-access dev; deployments behind a reverse proxy MUST set
// BIND_HOST=127.0.0.1 in backend/.env. See INSTALLATION_GUIDE.md and the Windows
// Firewall rule documented there.
const BIND_HOST = process.env.BIND_HOST ?? '0.0.0.0';

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:3000'];

// A load test signs in once per VU from a single source IP, which the 20/15min
// production limit would reject. The higher ceiling requires BOTH K6_MODE=1 and a
// non-production NODE_ENV, so setting K6_MODE on a production host is inert and
// can never weaken the brute-force protection the account lockout depends on.
const isK6Mode = process.env.K6_MODE === '1' && process.env.NODE_ENV !== 'production';
const LOGIN_LIMIT = isK6Mode ? 200 : 20;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: LOGIN_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Running behind the documented IIS reverse proxy. Without this, express-rate-limit
// and req.ip collapse all traffic into the proxy IP and the login limiter becomes shared.
app.set('trust proxy', 1);

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
}));
app.use(express.json({ limit: '10mb' }));

// Inside a mounted router `req.url` is relative to the mount point, so the raw
// value would log as `/tree` instead of `/api/failure-codes/tree`. `originalUrl`
// keeps the full path. The query string is dropped because it can carry tokens.
function loggedPath(req: express.Request): string {
  return (req.originalUrl || req.url || '').split('?')[0];
}

// Registered before the routes so it wraps the full request lifecycle. `req.user`
// is populated by the per-route `authenticate` middleware, so it is already set
// by the time the response finishes and the access line is emitted.
app.use(pinoHttp({
  logger,
  serializers: {
    req(req) {
      return { method: req.method, path: loggedPath(req) };
    },
    res(res) {
      return { status: res.statusCode };
    },
  },
  customProps(req) {
    return req.user?.userId ? { userId: req.user.userId } : {};
  },
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage(req, res) {
    return `${req.method} ${loggedPath(req)} ${res.statusCode}`;
  },
  customErrorMessage(req, res, err) {
    return `${req.method} ${loggedPath(req)} ${res.statusCode} ${err.message}`;
  },
}));

app.use('/api/auth/login', authLimiter);

// Swagger
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'CommandPulse CMMS API',
      version: '1.0.0',
      description: 'REST API for Computerized Maintenance Management System',
    },
    servers: [{ url: `http://localhost:${PORT}` }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.ts'],
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const STALE_WINDOW_MS = 25 * 60 * 60 * 1000;

async function createSchedulerStaleAlert(): Promise<void> {
  const existing = await prisma.systemAlert.findFirst({
    where: { alertType: 'Scheduler_Stale', createdDate: { gt: new Date(Date.now() - STALE_WINDOW_MS) } },
  });
  if (existing) return;
  const admin = await prisma.user.findFirst({ where: { role: 'Administrator', isActive: true } });
  if (!admin) return;
  await prisma.systemAlert.create({
    data: {
      alertType: 'Scheduler_Stale',
      userId: admin.userId,
      title: 'PM Scheduler Stale',
      message: 'PM scheduler has not reported a successful run within 25 hours.',
    },
  });
  logger.info('[scheduler] stale health detected — SystemAlert created');
}

app.get('/api/health/scheduler', async (_req, res) => {
  try {
    const last = await prisma.schedulerRun.findFirst({
      where: { status: 'success' },
      orderBy: { completedAt: 'desc' },
    });
    const nowMs = Date.now();
    const lastMs = last?.completedAt ? last.completedAt.getTime() : null;
    const minutesSinceSuccess = lastMs !== null ? Math.floor((nowMs - lastMs) / 60000) : null;
    if (lastMs !== null && nowMs - lastMs <= STALE_WINDOW_MS) {
      res.json({
        status: 'ok',
        lastSuccessAt: last!.completedAt!.toISOString(),
        lastRunStatus: 'success',
        minutesSinceSuccess,
      });
      return;
    }
    await createSchedulerStaleAlert();
    res.status(503).json({
      status: 'stale',
      lastSuccessAt: lastMs !== null ? last!.completedAt!.toISOString() : null,
      minutesSinceSuccess,
    });
  } catch (err) {
    logger.error({ err }, 'Error checking scheduler health');
    res.status(503).json({ status: 'stale', lastSuccessAt: null, minutesSinceSuccess: null });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/functional-locations', functionalLocationRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/equipment-meters', equipmentMeterRoutes);
app.use('/api/work-centers', workCenterRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/failure-codes', failureCodeRoutes);
app.use('/api/task-lists', taskListRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/work-orders', workOrderRoutes);
app.use('/api/work-order-operations', workOrderOperationRoutes);
app.use('/api/work-order-materials', workOrderMaterialRoutes);
app.use('/api/labor', laborRoutes);
app.use('/api/external-services', externalServiceRoutes);
app.use('/api/crafts', craftRoutes);
app.use('/api/maintenance-plans', maintenancePlanRoutes);
app.use('/api/safety-checklists', safetyChecklistRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/attachments', attachmentRoutes);
app.use('/api/audit-log', auditLogRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

// The scheduler startup wiring and the HTTP listener are skipped under tests so
// supertest can import `app` without binding :4000 or taking the scheduler lock.
if (process.env.NODE_ENV !== 'test') {
  app.listen(Number(PORT), BIND_HOST, () => {
    logger.info(`CMMS API server running on port ${PORT} (bound to ${BIND_HOST})`);
    logger.info(`API docs: http://localhost:${PORT}/api-docs`);
    setImmediate(async () => {
      try {
        const acquired = await acquireStartupLock();
        if (!acquired) {
          logger.info('[scheduler] startup skipped — lock refused; API serving without scheduler');
          return;
        }
        await runSchedulerOnce().catch((err) => logger.error({ err }, '[scheduler] startup run failed'));
        startScheduler();
      } catch (err) {
        logger.error({ err }, '[scheduler] startup wiring failed');
      }
    });
  });
}

export default app;

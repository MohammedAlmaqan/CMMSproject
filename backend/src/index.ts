import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

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

const app = express();
const PORT = process.env.PORT || 4000;

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:3000'];

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

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
  console.log('[scheduler] stale health detected — SystemAlert created');
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
    console.error('Error checking scheduler health:', err);
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
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`CMMS API server running on port ${PORT}`);
  console.log(`API docs: http://localhost:${PORT}/api-docs`);
  setImmediate(async () => {
    try {
      const acquired = await acquireStartupLock();
      if (!acquired) {
        console.log('[scheduler] startup skipped — lock refused; API serving without scheduler');
        return;
      }
      await runSchedulerOnce().catch((err) => console.error('[scheduler] startup run failed', err));
      startScheduler();
    } catch (err) {
      console.error('[scheduler] startup wiring failed', err);
    }
  });
});

export default app;

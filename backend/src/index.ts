import express from 'express';
import cors from 'cors';
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
import maintenancePlanRoutes from './routes/maintenancePlans.js';
import safetyChecklistRoutes from './routes/safetyChecklists.js';
import reportRoutes from './routes/reports.js';
import alertRoutes from './routes/alerts.js';
import commentRoutes from './routes/comments.js';
import auditLogRoutes from './routes/auditLog.js';
import userRoutes from './routes/users.js';
import dashboardRoutes from './routes/dashboard.js';

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

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
app.use('/api/maintenance-plans', maintenancePlanRoutes);
app.use('/api/safety-checklists', safetyChecklistRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/comments', commentRoutes);
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
});

export default app;

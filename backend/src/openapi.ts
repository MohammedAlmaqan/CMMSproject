import swaggerJsdoc from 'swagger-jsdoc';

/**
 * OpenAPI 3.0 document for the API, generated from the `@openapi` annotations
 * in `src/routes/*.ts`.
 *
 * It lives in its own module so that the three consumers of the document
 * cannot disagree: the spec served at `/api-docs.json`, the exported snapshot
 * in `docs/openapi.json`, and the drift check that fails when the two fall
 * out of step (`scripts/verify/verify_openapi.py`). One definition, one source.
 *
 * The `apis` glob is resolved against the process working directory, so this
 * module is evaluated with `backend/` as the cwd - the same constraint the
 * server itself has always had.
 */
export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'CommandPulse CMMS API',
      version: '1.0.0',
      description: 'REST API for Computerized Maintenance Management System',
    },
    servers: [{ url: `http://localhost:${process.env.PORT || 4000}` }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.ts'],
});

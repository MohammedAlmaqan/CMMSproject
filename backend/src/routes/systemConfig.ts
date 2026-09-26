import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { validate, systemConfigUpdateSchema } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.use(authenticate);

// SOW 3.3.3 and 3.2.2: the work order and notification numbers are generated
// with a configurable prefix. generateWoNumber and generateNotifNumber already
// read SystemConfig, so generation was wired; what did not exist was any way to
// change the value, and the administration screen showed a hardcoded "WO-".
// The feature was therefore configurable in name only.
//
// The writable key set is a fixed allowlist, not an open key/value endpoint.
// An arbitrary SystemConfig writer is a footgun: anything written here is
// trusted configuration read by other code paths, and a generic setter would
// let a caller invent keys that later silently change behaviour. Adding a
// setting means adding it to SETTINGS below deliberately.

interface SettingDefinition {
  key: string;
  label: string;
  description: string;
  fallback: string;
  maxLength: number;
}

const SETTINGS: SettingDefinition[] = [
  {
    key: 'wo_number_prefix',
    label: 'Work order number prefix',
    description: 'Prefix for auto-generated work order numbers, for example WO',
    fallback: 'WO',
    maxLength: 20,
  },
  {
    key: 'notif_number_prefix',
    label: 'Notification number prefix',
    description: 'Prefix for auto-generated notification numbers, for example N',
    fallback: 'N',
    maxLength: 20,
  },
];

/**
 * @openapi
 * /api/system-config:
 *   get:
 *     summary: List the configurable system settings
 *     description: >
 *       Returns each known setting with its current effective value. A setting
 *       that has never been written reports the code default, so the response
 *       always shows what is actually in force rather than a null.
 *     tags: [SystemConfig]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Current settings
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const stored = await prisma.systemConfig.findMany({
      where: { key: { in: SETTINGS.map((s) => s.key) } },
    });
    const byKey = new Map(stored.map((row) => [row.key, row.value]));

    res.json(
      SETTINGS.map((setting) => ({
        key: setting.key,
        label: setting.label,
        description: setting.description,
        value: byKey.get(setting.key) ?? setting.fallback,
        isDefault: !byKey.has(setting.key),
        maxLength: setting.maxLength,
      }))
    );
  } catch (error) {
    logger.error({ err: error }, 'Error fetching system config');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/system-config:
 *   put:
 *     summary: Change a configurable system setting
 *     description: >
 *       Sets one known setting. Only the keys in the allowlist may be written.
 *       The change affects numbers generated AFTER it is saved; numbers already
 *       issued keep the prefix they were generated with, because the prefix is
 *       baked into the stored number rather than looked up on display. Audit
 *       records the previous value.
 *     tags: [SystemConfig]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [key, value]
 *             properties:
 *               key:
 *                 type: string
 *                 enum: [wo_number_prefix, notif_number_prefix]
 *               value:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 20
 *                 pattern: '^[A-Za-z0-9_-]+$'
 *     responses:
 *       '200':
 *         description: Setting saved
 *       '400':
 *         description: Validation failed, or the key is not configurable
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Administrator
 *       '500':
 *         description: Internal server error
 */
router.put('/', authorizeMinRole('Administrator'), validate(systemConfigUpdateSchema), async (req: Request, res: Response) => {
  try {
    const { key, value } = req.body;
    const setting = SETTINGS.find((s) => s.key === key);
    if (!setting) {
      return res.status(400).json({ error: 'That setting is not configurable' });
    }

    const previous = await prisma.systemConfig.findUnique({ where: { key } });
    const saved = await prisma.systemConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });

    await logAudit(
      {
        tableName: 'SystemConfig',
        recordId: key,
        action: 'Update',
        fieldName: key,
        oldValue: previous?.value ?? setting.fallback,
        newValue: value,
      },
      req.user!.userId,
      req.ip
    );

    res.json({ key: saved.key, value: saved.value });
  } catch (error) {
    logger.error({ err: error }, 'Error saving system config');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

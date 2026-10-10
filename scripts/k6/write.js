/**
 * k6 write-path test — SOW §4.1 transactional-save limb.
 *
 * The 200-VU capacity run (`capacity.js`) drives the read path only, so §4.1's
 * "transactional save < 1 s" limb has no percentile of its own. This script is
 * the write-path counterpart: every iteration performs one transactional save
 * against an existing work order and records the save latency in a dedicated
 * `save_latency` trend, separately from the read percentile.
 *
 * The save is a `PUT /api/work-orders/:id` that sets a single long-text field
 * (`completionRemarks`) to a fixed probe string. Updating is deliberate: it
 * exercises the full save transaction — validation, the update, the cost
 * recompute and the read-back — without creating rows, so the target database
 * does not grow. The probe is a constant, so after the first save of a given
 * work order the field no longer changes and no further audit row is written;
 * audit growth stays bounded by the number of work orders the run touches.
 *
 * Usage (PATH is never modified; the portable binary lives in this folder):
 *   scripts\k6\k6.exe run scripts\k6\write.js
 *   set MAX_VUS=200 to change the pool size (default 200).
 *
 * The backend must be started with K6_MODE=1 and a non-production NODE_ENV so
 * the login rate limiter allows 200 sign-ins per 15 minutes. That ceiling is a
 * deliberate policy control and must not be raised to make this script pass.
 * Run it against a disposable/demo database, never the production `cmms` data:
 * it edits work orders (the probe value is left behind in `completionRemarks`
 * on every work order it touches).
 *
 * One ramping-vus scenario on purpose, exactly as `capacity.js`: k6 gives every
 * VU its own JS runtime, so a multi-scenario layout signs in more times than the
 * pool size; a single pool of MAX_VUS VUs signs in exactly MAX_VUS times.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const USERNAME = __ENV.CMMS_USER || 'admin';
const PASSWORD = __ENV.CMMS_PASS || 'password';
const THINK_TIME_SECONDS = Number(__ENV.THINK_TIME || 1);
const MAX_VUS = Number(__ENV.MAX_VUS || 200);
const WRITE_PROBE = __ENV.WRITE_PROBE || 'k6 write-path load probe';

const loginFailures = new Counter('login_failures');
const saveFailures = new Counter('workorder_save_failures');
const noTarget = new Counter('workorder_save_skipped_no_target');

// Dedicated trend so the transactional-save percentile is reported on its own,
// not mixed with the one-time login and target-discovery reads each VU makes.
const saveLatency = new Trend('save_latency', true);

export const options = {
  scenarios: {
    write: {
      executor: 'ramping-vus',
      exec: 'writePath',
      startVUs: 0,
      stages: [
        { duration: '2m', target: MAX_VUS },
        { duration: '5m', target: MAX_VUS },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '0s',
    },
  },
  thresholds: {
    // The SOW §4.1 budget for a transactional save.
    save_latency: ['p(95)<1000'],
    http_req_failed: ['rate<0.01'],
  },
};

// Per-VU state: each VU authenticates once, resolves its target work orders
// once, then saves in a loop. Signing in every iteration would trip the login
// limiter; re-listing every iteration would add read load to a write test.
let authToken = null;
let targetIds = null;

function login() {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ username: USERNAME, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'POST /api/auth/login' } }
  );

  const ok = check(res, {
    'login status is 200': (r) => r.status === 200,
  });

  if (!ok) {
    loginFailures.add(1);
    return null;
  }

  try {
    return res.json('token') || null;
  } catch (err) {
    loginFailures.add(1);
    return null;
  }
}

function authHeaders() {
  return { Authorization: `Bearer ${authToken}` };
}

function loadTargets() {
  const res = http.get(`${BASE_URL}/api/work-orders?take=${MAX_VUS}`, {
    headers: authHeaders(),
    tags: { name: 'GET /api/work-orders' },
  });
  if (res.status !== 200) {
    return [];
  }
  try {
    const body = res.json();
    if (!body || !Array.isArray(body.data)) {
      return [];
    }
    return body.data.map((wo) => wo.workOrderId).filter((id) => !!id);
  } catch (err) {
    return [];
  }
}

export function writePath() {
  if (authToken === null) {
    authToken = login();
    if (authToken === null) {
      sleep(THINK_TIME_SECONDS);
      return;
    }
  }

  if (targetIds === null) {
    targetIds = loadTargets();
  }

  if (targetIds.length === 0) {
    noTarget.add(1);
    sleep(THINK_TIME_SECONDS);
    return;
  }

  // Spread VUs across the discovered work orders so saves are not all queued on
  // one row's lock; each VU keeps a stable target across its iterations.
  const targetId = targetIds[(__VU - 1) % targetIds.length];

  const res = http.put(
    `${BASE_URL}/api/work-orders/${targetId}`,
    JSON.stringify({ completionRemarks: WRITE_PROBE }),
    {
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      tags: { name: 'PUT /api/work-orders/:id' },
    }
  );

  saveLatency.add(res.timings.duration);

  const ok = check(res, {
    'save status is 200': (r) => r.status === 200,
  });
  if (!ok) {
    saveFailures.add(1);
  }

  sleep(THINK_TIME_SECONDS);
}

export function teardown() {
  // Access tokens are stateless JWTs; there is no logout endpoint.
  authToken = null;
}

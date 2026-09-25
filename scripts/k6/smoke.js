/**
 * k6 smoke test — SOW Phase 6.5.
 *
 * Sanity check only. This is NOT the SOW §4.1 capacity proof: that clause calls
 * for 200 concurrent users, which is deferred to post-go-live. This run proves
 * the login -> work-order list -> work-order detail path stays healthy and fast
 * at 50 VUs against a local backend.
 *
 * Usage (PATH is never modified; the portable binary lives in this folder):
 *   scripts\k6\k6.exe run scripts\k6\smoke.js
 *
 * The backend must be started with K6_MODE=1 so the login rate limiter allows
 * 200 sign-ins per 15 minutes. See INSTALLATION_GUIDE.md.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const USERNAME = __ENV.CMMS_USER || 'admin';
const PASSWORD = __ENV.CMMS_PASS || 'password';
const THINK_TIME_SECONDS = Number(__ENV.THINK_TIME || 1);

const loginFailures = new Counter('login_failures');
const emptyList = new Counter('workorder_list_empty');
const detailSkipped = new Counter('workorder_detail_skipped');

export const options = {
  scenarios: {
    // 50 VUs brought up over 2 minutes.
    ramp: {
      executor: 'ramping-vus',
      exec: 'smoke',
      startVUs: 0,
      stages: [{ duration: '2m', target: 50 }],
      gracefulRampDown: '0s',
      tags: { phase: 'ramp' },
    },
    // 50 VUs held flat for 5 minutes — the only scenario the p95 threshold covers.
    // `constant-vus` sizes the fleet with `vus`; only `ramping-vus` uses `startVUs`.
    steady: {
      executor: 'constant-vus',
      exec: 'smoke',
      vus: 50,
      duration: '5m',
      startTime: '2m',
      tags: { phase: 'steady' },
    },
    // 50 VUs wound back to 0 over 1 minute.
    rampdown: {
      executor: 'ramping-vus',
      exec: 'smoke',
      startVUs: 50,
      stages: [{ duration: '1m', target: 0 }],
      startTime: '7m',
      gracefulRampDown: '0s',
      tags: { phase: 'rampdown' },
    },
  },
  thresholds: {
    'http_req_duration{scenario:steady}': ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
  },
};

// Each VU owns its own JS runtime, so these module-scope variables are
// effectively per-VU state. Signing in on every iteration would mean ~50
// logins/second and trip the login limiter long before the run finished, so each
// VU authenticates once and then exercises the read path.
let authToken = null;
let knownWorkOrderId = null;

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

export function smoke() {
  if (authToken === null) {
    authToken = login();
    if (authToken === null) {
      sleep(THINK_TIME_SECONDS);
      return;
    }
  }

  const list = http.get(`${BASE_URL}/api/work-orders?take=10`, {
    headers: authHeaders(),
    tags: { name: 'GET /api/work-orders' },
  });

  check(list, { 'work-order list status is 200': (r) => r.status === 200 });

  let ids = [];
  if (list.status === 200) {
    const body = list.json();
    if (body && Array.isArray(body.data)) {
      ids = body.data.map((wo) => wo.workOrderId).filter((id) => !!id);
      if (ids.length > 0) {
        knownWorkOrderId = ids[0];
      }
    }
  }

  if (knownWorkOrderId === null) {
    emptyList.add(1);
    detailSkipped.add(1);
    sleep(THINK_TIME_SECONDS);
    return;
  }

  const targetId = ids.length > 0 ? ids[0] : knownWorkOrderId;

  const detail = http.get(`${BASE_URL}/api/work-orders/${targetId}`, {
    headers: authHeaders(),
    tags: { name: 'GET /api/work-orders/:id' },
  });

  check(detail, { 'work-order detail status is 200': (r) => r.status === 200 });

  sleep(THINK_TIME_SECONDS);
}

export function teardown() {
  // The API has no logout endpoint: access tokens are stateless JWTs, so ending
  // the session is a client-side token discard. Nothing is sent over the wire.
  authToken = null;
}

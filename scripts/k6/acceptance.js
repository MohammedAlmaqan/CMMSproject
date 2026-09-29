/**
 * k6 acceptance test — SOW §6.4.3 / §6.4.
 *
 * 100 concurrent users on the login -> work-order list -> work-order detail
 * path. This is the SOW §6.4 acceptance criterion ("simulated load of 100
 * concurrent users"); it is NOT the SOW §4.1 200-user capacity proof, which
 * remains deferred to post-go-live (recorded P2028 decision).
 *
 * Usage (PATH is never modified; the portable binary lives in this folder):
 *   scripts\k6\k6.exe run scripts\k6\acceptance.js
 *
 * The backend must be started with K6_MODE=1 (and a non-production NODE_ENV) so
 * the login rate limiter allows 200 sign-ins per 15 minutes. That ceiling is a
 * deliberate policy control and must not be raised to make this script pass.
 * See INSTALLATION_GUIDE.md.
 *
 * One scenario only, on purpose. k6 gives every VU its own JS runtime, so a
 * "ramp / steady / rampdown" multi-scenario layout created three fresh pools of
 * 100 VUs and therefore ~300 first-time logins per run — over the documented
 * 200 sign-ins / 15 minutes even with no retries, so the run was tripping the
 * limiter it was supposed to respect. A single ramping-vus scenario reuses one
 * pool of 100 VUs: 100 first-time logins, comfortably inside the ceiling, while
 * still exercising a ramp, a 5-minute flat hold, and a ramp-down.
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
    // One pool of 100 VUs: ramp 0->100 over 2 minutes, hold 5 minutes, ramp
    // back to 0 over 1 minute. The p95 threshold covers the whole run.
    load: {
      executor: 'ramping-vus',
      exec: 'acceptance',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },
        { duration: '5m', target: 100 },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '0s',
    },
  },
  thresholds: {
    'http_req_duration{scenario:load}': ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
  },
};

// Each VU owns its own JS runtime, so these module-scope variables are
// effectively per-VU state. Signing in on every iteration would mean ~100
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

export function acceptance() {
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
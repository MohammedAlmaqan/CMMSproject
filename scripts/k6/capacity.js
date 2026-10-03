/**
 * k6 capacity test - SOW 4.1 (200 concurrent users).
 *
 * Same login -> work-order list -> work-order detail path as acceptance.js,
 * but sized for the SOW 4.1 capacity clause. One ramping-vus scenario on
 * purpose: k6 gives every VU its own JS runtime, so a multi-scenario layout
 * creates separate fresh pools of VUs and signs in more times than the pool
 * size. A single pool of MAX_VUS VUs signs in exactly MAX_VUS times, which
 * stays inside the documented 200 sign-ins / 15 minutes K6_MODE ceiling when
 * MAX_VUS is 200. Do not add a second scenario.
 *
 * Usage (PATH is never modified; the portable binary lives in this folder):
 *   scripts\k6\k6.exe run scripts\k6\capacity.js
 *   set MAX_VUS=200 to change the pool size (default 200).
 *
 * The backend must be started with K6_MODE=1 and a non-production NODE_ENV so
 * the login rate limiter allows 200 sign-ins per 15 minutes. That ceiling is a
 * deliberate policy control and must not be raised to make this script pass.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const USERNAME = __ENV.CMMS_USER || 'admin';
const PASSWORD = __ENV.CMMS_PASS || 'password';
const THINK_TIME_SECONDS = Number(__ENV.THINK_TIME || 1);
const MAX_VUS = Number(__ENV.MAX_VUS || 200);

const loginFailures = new Counter('login_failures');
const emptyList = new Counter('workorder_list_empty');
const detailSkipped = new Counter('workorder_detail_skipped');

export const options = {
  scenarios: {
    load: {
      executor: 'ramping-vus',
      exec: 'capacity',
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
    'http_req_duration{scenario:load}': ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
  },
};

// Per-VU state: each VU authenticates once, then exercises the read path.
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

export function capacity() {
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
  // Access tokens are stateless JWTs; there is no logout endpoint.
  authToken = null;
}

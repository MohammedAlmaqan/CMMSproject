import request from 'supertest';
import app from '../src/index.js';

export function api() {
  return request(app);
}

export function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export interface TestContext {
  adminToken: string;
  operatorToken: string;
  viewOnlyToken: string;
  adminId: string;
  operatorId: string;
}

export const ctx: TestContext = {
  adminToken: '',
  operatorToken: '',
  viewOnlyToken: '',
  adminId: '',
  operatorId: '',
};
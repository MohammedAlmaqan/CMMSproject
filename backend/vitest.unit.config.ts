import { defineConfig } from 'vitest/config';

// Unit tests only. No setupFiles, because tests/setup.ts loads .env, signs real
// JWTs and requires seeded users in a live PostgreSQL. The suites under
// tests/unit are pure and must stay runnable with no database, no secret and no
// network, so that authorisation and workflow policy can be verified on a
// machine that has none of those.
//
// The route-level integration suite is unchanged and still runs with `npm test`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    testTimeout: 15000,
    fileParallelism: false,
    pool: 'forks',
  },
});

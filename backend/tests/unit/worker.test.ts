import { describe, it, expect, vi } from 'vitest';
import { bootstrapWorker } from '../../src/worker.js';

// C11 / SOW 5.1: the PM, overdue and audit-retention cron jobs run in a separate
// worker process, not inside the API. The startup decision is pinned here with
// fakes so it needs no database and no real cron: a worker that cannot take the
// lock must start nothing, and a failed catch-up sweep must not stop the crons
// from being scheduled.

function makeHooks(overrides: Partial<Parameters<typeof bootstrapWorker>[0]> = {}) {
  let stopped = 0;
  const hooks = {
    acquireLock: vi.fn(async () => true),
    runStartupSweep: vi.fn(async () => ({})),
    startCrons: vi.fn(() => ({
      stop: () => {
        stopped += 1;
      },
    })),
    ...overrides,
  };
  return { hooks, stopped: () => stopped };
}

describe('background worker bootstrap', () => {
  it('takes the lock, runs the catch-up sweep, then starts the crons', async () => {
    const { hooks } = makeHooks();

    const crons = await bootstrapWorker(hooks);

    expect(crons).not.toBeNull();
    expect(hooks.acquireLock).toHaveBeenCalledTimes(1);
    expect(hooks.runStartupSweep).toHaveBeenCalledTimes(1);
    expect(hooks.startCrons).toHaveBeenCalledTimes(1);
  });

  it('returns a handle that stops the crons', async () => {
    const { hooks, stopped } = makeHooks();

    const crons = await bootstrapWorker(hooks);
    crons?.stop();

    expect(stopped()).toBe(1);
  });

  it('starts nothing when another worker already holds the lock', async () => {
    const { hooks } = makeHooks({ acquireLock: vi.fn(async () => false) });

    const crons = await bootstrapWorker(hooks);

    expect(crons).toBeNull();
    expect(hooks.runStartupSweep).not.toHaveBeenCalled();
    expect(hooks.startCrons).not.toHaveBeenCalled();
  });

  it('still schedules the crons when the catch-up sweep fails', async () => {
    const { hooks } = makeHooks({
      runStartupSweep: vi.fn(async () => {
        throw new Error('sweep failed');
      }),
    });

    const crons = await bootstrapWorker(hooks);

    expect(crons).not.toBeNull();
    expect(hooks.startCrons).toHaveBeenCalledTimes(1);
  });
});

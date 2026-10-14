module.exports = {
  apps: [
    {
      name: 'cmms-api',
      script: 'dist/index.js',
      // The background schedulers run in the separate `cmms-worker` process below,
      // so the API tier is stateless and no longer forces a single instance. Kept at
      // 1 for this deployment; scaling it would require a shared login-rate-limit
      // store (the limiter is in-process), not a scheduler change.
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      watch: false,
      max_memory_restart: '512M',
      // `merge_logs` keeps stdout (info/warn) and stderr (error) in one stream for
      // pm2-logrotate; pino still tags each line with its own level.
      merge_logs: true,
      out_file: 'logs/api-out.log',
      error_file: 'logs/api-err.log',
      // No `log_date_format`: PM2 would prefix every line with plain text and break
      // JSON-lines parsing. pino already stamps an ISO `time` on each record.
      windows: true,
    },
    {
      name: 'cmms-worker',
      script: 'dist/worker.js',
      // Exactly one worker: it takes the SchedulerRun advisory lock at boot and would
      // otherwise run a duplicate job set. A second worker starts idle and exits.
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      watch: false,
      max_memory_restart: '512M',
      merge_logs: true,
      out_file: 'logs/worker-out.log',
      error_file: 'logs/worker-err.log',
      windows: true,
    },
  ],
};

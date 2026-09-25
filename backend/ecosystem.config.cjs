module.exports = {
  apps: [{
    name: 'cmms-api',
    script: 'dist/index.js',
    // MUST be 1 + fork — the in-process PM scheduler would run N times under cluster mode
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
  }]
};

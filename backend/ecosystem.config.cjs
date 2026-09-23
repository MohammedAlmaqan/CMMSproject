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
    error_file: 'logs/error.log',
    out_file: 'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    windows: true,
  }]
};

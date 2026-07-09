module.exports = {
  apps: [{
    name: 'cmms-api',
    script: 'dist/index.js',
    node_args: '--import ./dist/register.js',
    env: {
      NODE_ENV: 'production',
      PORT: 4000,
    },
    env_file: '.env',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '512M',
    error_file: 'logs/error.log',
    out_file: 'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    windows: true,
  }]
};

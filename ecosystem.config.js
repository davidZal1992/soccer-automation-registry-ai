module.exports = {
  apps: [
    {
      name: 'soccer-bot',
      script: './src/index.ts',
      interpreter: 'tsx',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '500M',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};

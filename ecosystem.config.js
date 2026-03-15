module.exports = {
  apps: [
    {
      name: 'luxe-backend',
      script: 'backend/src/server.js',
      cwd: './backend',
      node_args: '--experimental-modules',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    }
  ]
};
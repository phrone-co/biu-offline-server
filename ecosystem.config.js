module.exports = {
  apps: [
    {
      name: "biu-proxy-server",
      script: "app.js",
      instances: "max",
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "biu-redis-worker",
      script: "app.js",
      instances: 1,
      env: {
        NODE_ENV: "production",
        RUN_REDIS_WORKER: "true",
      },
    },
  ],
};

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
  ],
};

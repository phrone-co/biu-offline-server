#!/bin/bash

# start_all.sh

# Start app.js in fork mode (default)
# Assign a name for easier management/logging
pm2 start app.js --name "my-app" --raw --output "/var/log/pm2/my-app-out.log" --error "/var/log/pm2/my-app-err.log"

# Start background-jobs.js
# Ensure it runs as a single instance and in fork mode
pm2 start background-jobs.js --name "background-worker" --raw --output "/var/log/pm2/background-worker-out.log" --error "/var/log/pm2/background-worker-err.log" --time

# Start load-questions.js
# This might be a one-off script, so consider these options:
# --no-autorestart: Prevents PM2 from restarting it if it exits successfully.
# --oneshot: Starts the script, waits for it to exit, then removes it from PM2's process list.
# For initial load, --oneshot is generally good if it's truly a one-time task.
pm2 start load-questions.js --name "question-loader" --raw --output "/var/log/pm2/question-loader-out.log" --error "/var/log/pm2/question-loader-err.log" --time --no-autorestart

# Keep PM2 daemon alive, ensuring it manages the processes.
# This is crucial when pm2-runtime is used as the CMD
pm2 list
pm2 logs --raw

# The pm2-runtime command will keep the container alive as long as PM2 is running
# and managing processes.
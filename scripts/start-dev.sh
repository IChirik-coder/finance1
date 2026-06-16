#!/bin/bash
cd /home/z/my-project
while true; do
  echo "=== Starting Next.js dev server ===" >> /tmp/next-respawn.log
  npx next dev --turbopack -p 3000 -H 0.0.0.0 >> /tmp/next-respawn.log 2>&1
  EXIT_CODE=$?
  echo "=== Server exited with code $EXIT_CODE, restarting in 2s ===" >> /tmp/next-respawn.log
  sleep 2
done

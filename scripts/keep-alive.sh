#!/bin/bash
# Keep-alive script that restarts Next.js whenever it dies
LOG=/tmp/next-keepalive.log
cd /home/z/my-project

echo "$(date): Keep-alive script started" >> $LOG

while true; do
  echo "$(date): Starting Next.js production server" >> $LOG
  node node_modules/.bin/next start -p 3000 -H 0.0.0.0 >> $LOG 2>&1
  EXIT=$?
  echo "$(date): Next.js exited with code $EXIT, restarting in 2s" >> $LOG
  sleep 2
done

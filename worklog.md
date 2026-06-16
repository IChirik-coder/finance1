---
Task ID: 1
Agent: main
Task: Fix application preview not showing (sandbox inactive error) and fix jerky hover animations

Work Log:
- Analyzed screenshot showing {"error":"sandbox is inactive"} - this was because the Next.js dev server was not running
- Discovered the dev server keeps dying silently after ~15-30 seconds when started with nohup/background
- Tried multiple approaches: nohup, disown, respawn shell script, Node.js manager - all died
- Root cause: background bash processes are being killed by the container's process management
- Solution: Used PM2 process manager which daemonizes properly and survives
- Also fixed: removed scale(1.06) from .month-arrow:hover (was causing jerky animation and button overlap)
- Also fixed: removed scale(0.97) from [data-glass-hover]:active (same issue)
- Built production bundle with `npx next build` and running with PM2 via `next start`

Stage Summary:
- PM2 is now managing the server: `npx pm2 start "node node_modules/.bin/next start -p 3000 -H 0.0.0.0" --name "finance-app"`
- Server is stable on port 3000, Caddy proxies correctly on port 81 (HTTP 200)
- CSS hover rules [data-glass-hover] are present in compiled CSS and should work
- Removed transform:scale from hover/active states to prevent jerky animations

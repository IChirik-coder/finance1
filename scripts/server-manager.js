const { spawn } = require('child_process');
const fs = require('fs');
const LOG = '/tmp/server-manager.log';

function log(msg) {
  const line = `${new Date().toISOString()}: ${msg}\n`;
  fs.appendFileSync(LOG, line);
  console.log(line.trim());
}

function startServer() {
  log('Starting Next.js production server...');
  const child = spawn('node', ['node_modules/.bin/next', 'start', '-p', '3000', '-H', '0.0.0.0'], {
    cwd: '/home/z/my-project',
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  child.stdout.on('data', (data) => {
    fs.appendFileSync(LOG, data.toString());
  });
  
  child.stderr.on('data', (data) => {
    fs.appendFileSync(LOG, data.toString());
  });
  
  child.on('exit', (code, signal) => {
    log(`Server exited with code=${code} signal=${signal}. Restarting in 3s...`);
    setTimeout(startServer, 3000);
  });
  
  child.unref();
  log(`Server PID: ${child.pid}`);
}

startServer();

// Start server and tunnel
const { spawn } = require('child_process');
const localtunnel = require('localtunnel');
const path = require('path');

const PORT = 3456;

async function main() {
  // Start server
  console.log('Starting Agent Mail server...');
  const server = spawn('node', [path.join(__dirname, 'src/server.js')], {
    stdio: 'inherit'
  });
  
  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Start tunnel
  console.log('Starting tunnel...');
  const tunnel = await localtunnel({ 
    port: PORT,
    subdomain: 'agentmail'
  });
  
  console.log('');
  console.log('========================================');
  console.log('🚀 Agent Mail is LIVE!');
  console.log('========================================');
  console.log('');
  console.log('Public URL:', tunnel.url);
  console.log('Local URL:  http://localhost:' + PORT);
  console.log('');
  console.log('Endpoints:');
  console.log('  POST /api/mailbox/create');
  console.log('  GET  /api/mailbox');
  console.log('  GET  /api/mailbox/emails');
  console.log('');
  
  tunnel.on('error', (err) => {
    console.error('Tunnel error:', err);
  });
  
  process.on('SIGINT', () => {
    console.log('\\nShutting down...');
    tunnel.close();
    server.kill();
    process.exit();
  });
}

main().catch(err => {
  console.error('Startup error:', err);
  process.exit(1);
});

const localtunnel = require('localtunnel');

async function startTunnel() {
  console.log('Starting localtunnel...');
  
  const tunnel = await localtunnel({ 
    port: 3456,
    subdomain: 'agentmail'  // Try to get consistent subdomain
  });
  
  console.log('');
  console.log('🚀 Agent Mail is PUBLIC!');
  console.log('');
  console.log('URL:', tunnel.url);
  console.log('');
  
  tunnel.on('close', () => {
    console.log('Tunnel closed');
  });
  
  tunnel.on('error', (err) => {
    console.error('Tunnel error:', err);
  });
  
  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('Stopping tunnel...');
    tunnel.close();
    process.exit();
  });
}

startTunnel().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

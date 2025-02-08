const { execSync } = require('child_process');

console.log('Checking deployment status...');
try {
  const output = execSync('vercel list mediaplan-app', { encoding: 'utf-8' });
  console.log('Deployment status:', output);
} catch (error) {
  console.error('Error checking deployment status:', error.message);
}


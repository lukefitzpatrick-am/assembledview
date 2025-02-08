const { execSync } = require('child_process');

console.log('Logging in to Vercel...');
try {
  execSync('vercel login', { stdio: 'inherit' });
  console.log('Successfully logged in to Vercel!');
} catch (error) {
  console.error('Error logging in to Vercel:', error.message);
}


const { execSync } = require('child_process');

console.log('Installing Vercel CLI...');
try {
  execSync('npm install -g vercel', { stdio: 'inherit' });
  console.log('Vercel CLI has been successfully installed!');
} catch (error) {
  console.error('Error installing Vercel CLI:', error.message);
}


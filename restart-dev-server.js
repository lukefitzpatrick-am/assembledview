const { execSync } = require('child_process');

console.log('Stopping the development server...');
try {
  // This command might vary depending on your OS and how you typically stop the process
  execSync('pkill -f "node.*next"', { stdio: 'inherit' });
} catch (error) {
  console.log('No running Next.js server found or unable to stop it.');
}

console.log('Starting the development server...');
try {
  execSync('npm run dev', { stdio: 'inherit' });
} catch (error) {
  console.error('Error starting the development server:', error.message);
}


const { execSync } = require('child_process');

console.log('Attempting to redeploy the project...');
try {
  // Make sure you're logged in to Vercel CLI
  execSync('vercel login', { stdio: 'inherit' });
  
  // Redeploy the project
  execSync('vercel --prod', { stdio: 'inherit' });
  
  console.log('Redeployment attempt completed. Check the output for any error messages.');
} catch (error) {
  console.error('Error during redeployment:', error.message);
}


const { execSync } = require('child_process');

try {
  console.log('Installing axios...');
  execSync('npm install axios', { stdio: 'inherit' });
  console.log('axios has been successfully installed!');
} catch (error) {
  console.error('Error installing axios:', error.message);
}


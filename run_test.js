const { execSync } = require('child_process');
try {
  const output = execSync('npx jest --json', { encoding: 'utf-8' });
  console.log('Passed', JSON.parse(output).numFailedTests);
} catch (e) {
  const result = JSON.parse(e.stdout);
  console.log('Failed tests:', result.testResults.filter(r => r.status === 'failed').map(r => r.name));
  const failedSuites = result.testResults.filter(r => r.status === 'failed');
  failedSuites.forEach(s => {
    s.assertionResults.filter(a => a.status === 'failed').forEach(a => {
      console.log('  ->', a.title, ':', a.failureMessages[0]);
    });
  });
}

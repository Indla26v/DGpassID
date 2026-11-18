// Test Next.js APIs against running Next.js server
const BASE_URL = process.env.TEST_URL || 'http://127.0.0.1:3088';

async function runTests() {
  console.log(`Testing Next.js APIs on ${BASE_URL}...`);

  // 1. Health check
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  if (!healthRes.ok) throw new Error(`Health check failed: ${healthRes.status}`);
  const health = await healthRes.json();
  console.log('PASS: Health check:', health);

  // 2. Unauthenticated access
  const unauthRes = await fetch(`${BASE_URL}/api/passes`);
  if (unauthRes.status !== 401) throw new Error(`Expected 401 for anonymous access, got: ${unauthRes.status}`);
  console.log('PASS: Unauthenticated access rejected with 401');

  // 3. Login with invalid password
  const badLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': BASE_URL },
    body: JSON.stringify({ email: 'admin', password: 'wrong-password' }),
  });
  if (badLoginRes.status !== 401) throw new Error(`Expected 401 for bad login, got: ${badLoginRes.status}`);
  console.log('PASS: Invalid password rejected with 401');

  // 4. CSRF rejection for cross-origin mutation
  const csrfRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'https://malicious.example' },
    body: JSON.stringify({ email: 'admin', password: 'somepassword' }),
  });
  if (csrfRes.status !== 403) throw new Error(`Expected 403 for cross-origin login, got: ${csrfRes.status}`);
  console.log('PASS: CSRF forbidden with 403');

  // 5. Check duplicate check endpoint (anonymous should fail)
  const dupAnonRes = await fetch(`${BASE_URL}/api/passes/check-duplicate?full_name=Test&mobile_number=9999999999&govt_id_number=123456789012`);
  if (dupAnonRes.status !== 401) throw new Error(`Expected 401 for anonymous duplicate check, got: ${dupAnonRes.status}`);
  console.log('PASS: Protected duplicate check rejected anonymous access with 401');

  // 6. Departments anonymous access rejected
  const deptAnonRes = await fetch(`${BASE_URL}/api/departments`);
  if (deptAnonRes.status !== 401) throw new Error(`Expected 401 for anonymous departments, got: ${deptAnonRes.status}`);
  console.log('PASS: Protected departments rejected anonymous access with 401');

  console.log('\nAll API security and endpoint verification tests PASSED successfully!');
}

runTests().catch((err) => {
  console.error('Test FAILED:', err);
  process.exit(1);
});

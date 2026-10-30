// Read-only check: no login, database write, or Classroom action is performed.
const target = new URL(process.argv[2] || 'https://hexconnections.com');
if (!['https:','http:'].includes(target.protocol)) throw new Error('Use an HTTP or HTTPS site URL.');
const origin = target.origin;
let failed = false;
try {
  const page = await fetch(origin + '/', { signal: AbortSignal.timeout(20000), cache:'no-store' });
  const html = await page.text();
  if (!page.ok || !html.includes('hx-auth-config') || !html.includes('function connectClassroom')) {
    failed = true;
    console.error('FAIL: The homepage is missing this project’s Google account/Classroom frontend. Deploy public/ to the Worker serving this domain.');
  } else console.log('PASS: Google account and Classroom frontend is present.');
} catch {
  failed = true;
  console.error('FAIL: The homepage could not be reached. Check the domain, DNS and Worker route.');
}
try {
  const response = await fetch(origin + '/api/me', { signal: AbortSignal.timeout(20000), cache:'no-store' });
  const result = await response.json().catch(() => null);
  if (response.status === 401 && result?.code === 'sign-in') console.log('PASS: The authenticated backend is routed at /api/me.');
  else {
    failed = true;
    console.error('FAIL: /api/me returned HTTP ' + response.status + '. ' + (result?.code === 'backend-setup' ? 'Configure the DB binding and Firebase runtime values.' : 'Deploy the complete Worker and route /api/* to it.'));
  }
} catch {
  failed = true;
  console.error('FAIL: The backend could not be reached. Check the custom-domain route.');
}
console.log('This checks deployment routing only; test real Google sign-in and Classroom permissions separately.');
process.exitCode = failed ? 1 : 0;

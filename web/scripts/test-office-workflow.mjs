import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const [webUrl, desktopUrl] = process.argv.slice(2).map(value => new URL(value));
const adminEmail = process.env.TEST_OFFICE_ADMIN_EMAIL;
const adminPassword = process.env.TEST_OFFICE_ADMIN_PASSWORD;
if (!webUrl || !desktopUrl || ![webUrl, desktopUrl].every(url => url.hostname === '127.0.0.1') || !adminEmail || !adminPassword) {
  throw new Error('Supply both local app URLs and test administrator credentials. Use a disposable database.');
}

const fixtures = ['chandragiri', 'renigunta', 'tirupati', 'district'];
const suffix = randomUUID().slice(0, 8);
const password = `test-only-${randomUUID()}`;
const signature = office => `data:image/png;base64,${Buffer.from(office).toString('base64')}`;

function client(origin) {
  let cookie;
  return async (path, status = 200, method = 'GET', body) => {
    const response = await fetch(new URL(`/api${path}`, origin), {
      method,
      headers: { origin: origin.origin, 'content-type': 'application/json', ...(cookie && { cookie }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';', 1)[0];
    const result = await response.json();
    assert.equal(response.status, status, `${origin.origin} ${method} ${path}: ${result.error ?? ''}`);
    return result;
  };
}

const emails = Object.fromEntries([...fixtures, 'print'].map(office => [office, `${office}-${suffix}@example.test`]));
for (const [index, origin] of [webUrl, desktopUrl].entries()) {
  const admin = client(origin);
  await admin('/auth/login', 200, 'POST', { email: adminEmail, password: adminPassword });
  if (index === 0) {
    for (const [office, email] of Object.entries(emails)) {
      await admin('/users', 201, 'POST', {
        name: office, email, password, role: office === 'print' ? 'PRINT_TEAM' : 'ADMIN',
        officeId: office === 'print' ? null : office,
      });
    }
  }

  const logins = {};
  for (const [office, email] of Object.entries(emails)) {
    const request = client(origin);
    const { user } = await request('/auth/login', 200, 'POST', { email, password });
    assert.equal(user.officeId, office === 'print' ? null : office);
    assert.equal(user.role, office === 'print' ? 'PRINT_TEAM' : 'ADMIN');
    const { user: sessionUser } = await request('/auth/session');
    assert.equal(sessionUser.officeId, user.officeId);
    logins[office] = request;
  }
  const { chandragiri, renigunta, tirupati, district: sp, print } = logins;
  await chandragiri('/users', 403);
  await chandragiri('/departments', 403, 'POST', { name: 'DSP cannot add a shared department' });
  assert.ok((await sp('/users')).users.some(user => user.email === emails.tirupati));

  const cardholder = office => ({
    full_name: `Office test ${suffix} ${index} ${office}`, father_or_spouse_name: 'Test Parent',
    department: 'Police department', institution: 'IISER', category: 'Other', mobile_number: '9999999999',
    govt_id_type: 'PAN Card', govt_id_number: 'ABCDE1234F',
  });
  const tirupatiDraft = await tirupati('/passes', 201, 'POST', {
    ...cardholder('tirupati'), office_id: 'district', status: 'PENDING_APPROVAL',
  });
  assert.equal(tirupatiDraft.office_id, 'tirupati');
  assert.equal(tirupatiDraft.authority_signature_url, null);
  const draft = `/passes/${tirupatiDraft.id}`;
  // The second backend reads the same config. Check the missing-signature path on the first run.
  if (index === 0) {
    const blocked = await sp(`${draft}/status`, 400, 'PATCH', { status: 'READY_TO_PRINT' });
    assert.match(blocked.error, /authority signature for the assigned office/);
  }
  for (const office of fixtures) {
    await logins[office]('/config/authority-signature', 200, 'POST', {
      signatureUrl: signature(`${office}-${index}`), officeId: 'ignored', applyToAll: true,
    });
  }

  const released = await sp(`${draft}/status`, 200, 'PATCH', { status: 'READY_TO_PRINT' });
  assert.equal(released.authority_signature_url, signature(`tirupati-${index}`));
  assert.equal(released.approved_by, emails.district);
  const own = await sp('/passes', 201, 'POST', cardholder('district'));
  assert.equal(own.office_id, 'district');
  assert.equal(own.authority_signature_url, signature(`district-${index}`));
  const chandragiriPass = await chandragiri('/passes', 201, 'POST', cardholder('chandragiri'));
  const reniguntaPass = await renigunta('/passes', 201, 'POST', cardholder('renigunta'));
  assert.equal(chandragiriPass.authority_signature_url, signature(`chandragiri-${index}`));
  assert.equal(reniguntaPass.authority_signature_url, signature(`renigunta-${index}`));
  await chandragiri(draft, 404);
  await renigunta(draft, 404, 'PUT', { department: 'Another office' });
  await renigunta(`${draft}/status`, 404, 'PATCH', { status: 'REVOKED' });
  await renigunta(`${draft}/send-to-print`, 404, 'POST');
  await renigunta(`${draft}/reprint`, 404, 'POST', { reason: 'Test rejected scope' });
  await print(draft, 404);
  await print('/print-queue', 404, 'POST', { id: tirupatiDraft.id });
  const restrictedQueue = await print('/print-queue?status=ALL');
  assert.ok(restrictedQueue.passes.every(pass => pass.office_id === null));
  assert.equal((await renigunta(`/audit-logs?passId=${tirupatiDraft.id}`)).length, 0);
  assert.equal((await renigunta('/verify', 200, 'POST', { token: tirupatiDraft.verification_token })).status, 'NOT_FOUND');
  const duplicate = await renigunta(`/passes/check-duplicate?${new URLSearchParams(cardholder('tirupati'))}`);
  assert.deepEqual(Object.keys(duplicate).sort(), ['isDuplicate', 'message']);
  assert.equal(duplicate.isDuplicate, true);
  await renigunta('/passes', 409, 'POST', cardholder('tirupati'));

  const mixedBatch = { ids: [reniguntaPass.id, tirupatiDraft.id] };
  await renigunta('/print-queue', 404, 'POST', { ...mixedBatch, preview: true });
  await renigunta('/print-queue', 404, 'POST', mixedBatch);
  assert.equal((await renigunta(`/passes/${reniguntaPass.id}`)).printed_count, 0);
  await sp('/print-queue', 200, 'POST', { ...mixedBatch, preview: true });
  assert.equal((await tirupati(draft)).printed_count, 0);
  await sp('/print-queue', 200, 'POST', mixedBatch);
  await tirupati('/config/authority-signature', 200, 'POST', { signatureUrl: signature('replacement'), applyToAll: true });
  const reprint = await tirupati(`${draft}/reprint`, 200, 'POST', { reason: 'Test badge replacement' });
  assert.equal(reprint.printed_count, 2);
  assert.equal(reprint.authority_signature_url, signature(`tirupati-${index}`));

  await print('/config/authority-signature', 403, 'DELETE');
  await tirupati('/config/authority-signature', 200, 'DELETE');
  assert.equal((await tirupati('/config/authority-signature')).signatureUrl, null);
  assert.equal((await tirupati(draft)).authority_signature_url, signature(`tirupati-${index}`));
  const afterRemoval = await tirupati(`${draft}/reprint`, 200, 'POST', { reason: 'Test after signature removal' });
  assert.equal(afterRemoval.authority_signature_url, signature(`tirupati-${index}`));
  await tirupati('/passes', 400, 'POST', cardholder('signature removed'));
  assert.equal((await renigunta('/config/authority-signature')).signatureUrl, signature(`renigunta-${index}`));
  await tirupati('/config/authority-signature', 200, 'DELETE');

  const legacy = await print('/passes', 201, 'POST', { ...cardholder('legacy'), office_id: 'district' });
  assert.equal(legacy.office_id, null);
  const assigned = await sp(`/passes/${legacy.id}`, 200, 'PUT', { office_id: 'tirupati' });
  assert.equal(assigned.office_id, 'tirupati');
  assert.equal(assigned.authority_signature_url, null);
  await print(`/passes/${legacy.id}`, 404);
  assert.ok((await tirupati(`/audit-logs?passId=${legacy.id}`)).some(row => row.action === 'PASS_OFFICE_ASSIGNED'));
  const localStats = await tirupati('/stats');
  const districtStats = await sp('/stats');
  assert.deepEqual(localStats.offices.map(office => office.id), ['tirupati']);
  assert.equal(districtStats.offices.length, 5);
  assert.equal(districtStats.total, districtStats.offices.reduce((total, row) => total + row.total, 0));
  assert.deepEqual(localStats.offices[0], districtStats.offices.find(office => office.id === 'tirupati'));
  console.log(`PASS ${origin.origin}: four office accounts, scoped approvals and print operations, signature snapshots, legacy assignment and office totals`);
}

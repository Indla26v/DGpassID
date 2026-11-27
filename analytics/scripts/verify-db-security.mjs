import assert from 'node:assert/strict';
import pg from 'pg';
if (!process.env.DATABASE_URL) process.loadEnvFile(new URL('../.env.local', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const { rows: [role] } = await client.query('SELECT current_user,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls FROM pg_roles WHERE rolname=current_user');
  assert.equal(role.current_user, 'dgp_analytics_reader');
  for (const key of ['rolsuper','rolcreaterole','rolcreatedb','rolbypassrls']) assert.equal(role[key], false);
  const grants = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND (has_table_privilege(current_user,format('%I.%I',schemaname,tablename),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(current_user,format('%I.%I',schemaname,tablename),'SELECT,INSERT,UPDATE,REFERENCES'))");
  assert.equal(grants.rowCount, 0, 'Reporting login must not have any public table/column privileges');
  const memberships = await client.query('SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)');
  assert.equal(memberships.rowCount, 0);
  await client.query('SET default_transaction_read_only=off');
  const blockedQueries = [
    'SELECT full_name,mobile_number,govt_id_number FROM public.passes LIMIT 1',
    'SELECT institution FROM public.passes LIMIT 1',
    'SELECT office_id FROM public.passes LIMIT 1',
    'SELECT signature_url FROM public.pass_offices LIMIT 1',
    'SELECT * FROM public.app_users LIMIT 1',
    'SELECT * FROM public.audit_logs LIMIT 1',
    "UPDATE public.passes SET status='REVOKED' WHERE false",
    'DELETE FROM public.passes WHERE false',
    'CREATE TABLE public.analytics_security_probe(id int)',
    'CREATE TABLE pass_analytics.analytics_security_probe(id int)',
    'SET ROLE dgp_analytics_executor',
    "CREATE ROLE analytics_security_probe NOLOGIN"
  ];
  for (const sql of blockedQueries) {
    await client.query('BEGIN');
    let code;
    try { await client.query(sql); } catch (error) { code = error.code; }
    finally { await client.query('ROLLBACK'); }
    assert.equal(code, '42501', `Expected permission denied for ${sql}`);
  }
  for (const days of [0,7,30,90]) for (const institution of ['ALL','IISER','IIT','ICI','ICU','OTHER']) {
    const { rows: [{ data }] } = await client.query('SELECT pass_analytics.snapshot($1,$2) AS data', [days,institution]);
    assert.equal(data.summary.total, data.institutions.reduce((sum,r)=>sum+r.total,0));
    assert.equal(data.summary.total, data.trend.reduce((sum,r)=>sum+r.total,0));
    assert.equal(data.summary.total, data.statuses.reduce((sum,r)=>sum+r.total,0));
    assert.equal(data.police.summary.total, data.police.zones.reduce((sum,r)=>sum+r.total,0));
    assert.equal(data.police.summary.total, data.police.ranks.reduce((sum,r)=>sum+r.total,0));
    assert.equal(data.police.summary.total, data.police.districts.reduce((sum,r)=>sum+r.total,0));
    assert.deepEqual(data.offices.map(r => r.id), ['chandragiri', 'renigunta', 'tirupati', 'district', 'unassigned']);
    for (const key of ['total', 'pending', 'ready', 'printed', 'issued', 'revoked']) {
      assert.equal(data.summary[key], data.offices.reduce((sum, row) => sum + row[key], 0));
    }
    assert(!/full_name|mobile_number|govt_id_number|police_id_number|verification_token|photo_url|password_hash|postgresql:/.test(JSON.stringify(data)));
  }
  await assert.rejects(client.query('SELECT pass_analytics.snapshot($1,$2)', [0,"IISER' OR 1=1--"]), { code: '22023' });
  console.log('PASS: aggregate-only access for all 20 filter combinations; private tables, writes, DDL and privilege escalation denied even with read-only mode disabled.');
} finally { await client.end(); }

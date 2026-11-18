import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';
// Administrative setup only; the admin credential is never copied into the web app.
const config = JSON.parse(fs.readFileSync(new URL('../../dotnet-app/artifacts/win-x64/connection.default.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
const adminUrl = new URL(config.DatabaseUrl);
adminUrl.searchParams.set('sslmode', 'verify-full');
const client = new pg.Client({ connectionString: adminUrl.toString() });
const password = crypto.randomBytes(48).toString('base64url');
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL password_encryption = 'scram-sha-256'");
  await client.query('CREATE ROLE dgp_analytics_executor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION');
  await client.query(`CREATE ROLE dgp_analytics_reader LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION CONNECTION LIMIT 8`);
  const owner = (await client.query('SELECT current_user AS name')).rows[0].name;
  await client.query(`GRANT dgp_analytics_executor TO "${owner.replaceAll('"','""')}"`);
  await client.query("ALTER ROLE dgp_analytics_reader SET default_transaction_read_only = on");
  await client.query("ALTER ROLE dgp_analytics_reader SET statement_timeout = '5s'");
  await client.query("ALTER ROLE dgp_analytics_reader SET lock_timeout = '1s'");
  await client.query("ALTER ROLE dgp_analytics_reader SET idle_in_transaction_session_timeout = '5s'");
  await client.query("ALTER ROLE dgp_analytics_reader SET search_path = pg_catalog");
  await client.query(fs.readFileSync(new URL('../db/analytics-security.sql', import.meta.url), 'utf8'));
  await client.query('COMMIT');
  const readerUrl = new URL(adminUrl);
  readerUrl.username = 'dgp_analytics_reader';
  readerUrl.password = password;
  fs.writeFileSync(new URL('../.env.local', import.meta.url), `DATABASE_URL=${readerUrl.toString()}\n`);
  console.log('Provisioned isolated aggregate-only database login and updated local secret.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`Provisioning failed: ${error.code || 'unknown error'}`);
  process.exitCode = 1;
} finally { await client.end(); }

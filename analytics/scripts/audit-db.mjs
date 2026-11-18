import fs from 'node:fs';
import pg from 'pg';
const config = JSON.parse(fs.readFileSync(new URL('../../dotnet-app/artifacts/win-x64/connection.default.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
const url = new URL(config.DatabaseUrl);
url.searchParams.set('sslmode', 'verify-full');
const client = new pg.Client({ connectionString: url.toString() });
try {
  await client.connect();
  const queries = {
    role: 'SELECT current_user,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls FROM pg_roles WHERE rolname=current_user',
    memberships: 'SELECT r.rolname AS member,g.rolname AS parent FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member JOIN pg_roles g ON g.oid=m.roleid WHERE r.rolname=current_user',
    publicTables: "SELECT grantee,table_name,privilege_type FROM information_schema.role_table_grants WHERE grantee='PUBLIC' AND table_schema='public'",
    publicFunctions: "SELECT n.nspname,p.proname,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef",
    publicSchema: "SELECT nspname,nspacl::text FROM pg_namespace WHERE nspname='public'",
    databasePrivileges: "SELECT datname,datacl::text FROM pg_database WHERE datname=current_database()",
    existingAnalyticsRole: "SELECT rolname FROM pg_roles WHERE rolname LIKE 'dgp_analytics%'"
  };
  for (const [name, sql] of Object.entries(queries)) console.log(name, JSON.stringify((await client.query(sql)).rows));
} finally { await client.end(); }

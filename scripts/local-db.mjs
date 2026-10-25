// Starts a throwaway local PostgreSQL (no Docker needed) for trying Sanchay without Supabase.
// Data lives in .local-pg/ (git-ignored). Stop with Ctrl+C. Connection string:
//   postgresql://postgres:postgres@localhost:54329/sanchay
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = resolve(root, '.local-pg');
const fresh = !existsSync(resolve(dataDir, 'PG_VERSION'));

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: 54329,
  persistent: true
});

if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase('sanchay');
console.log('Local Postgres ready on port 54329 (database: sanchay). Press Ctrl+C to stop.');

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);

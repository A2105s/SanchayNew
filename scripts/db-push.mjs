// `npm run db:push` -> sync the Prisma schema, then apply DB-level guarantees Prisma cannot express
// (overlap exclusion constraint, append-only audit trigger, CHECK constraints) from prisma/post-push.sql.
// Pass --reset to drop and recreate everything (destroys data; local throwaway databases only).
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const prismaBin = resolve(root, 'node_modules/prisma/build/index.js');
const reset = process.argv.includes('--reset');
const acceptLoss = process.argv.includes('--accept-data-loss') || reset;

function run(args) {
  const result = spawnSync(process.execPath, [prismaBin, ...args], { cwd: root, stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(['db', 'push', '--skip-generate', ...(reset ? ['--force-reset'] : []), ...(acceptLoss && !reset ? ['--accept-data-loss'] : [])]);
run(['db', 'execute', '--file', 'prisma/post-push.sql', '--schema', 'prisma/schema.prisma']);
console.log('Schema synced and database constraints applied.');

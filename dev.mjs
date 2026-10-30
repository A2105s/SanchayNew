// One-command local development for Sanchay (`npm run dev`).
//
// - Loads .env and .env.local.
// - When DATABASE_URL points at localhost, boots embedded Postgres (localhost:54329)
//   if it is not already running, clears any stale postmaster.pid, creates the database
//   when missing, applies the Prisma schema + post-push guarantees, and seeds only an empty database.
// - When DATABASE_URL points anywhere else (e.g. Supabase), leaves the database
//   alone and just starts Next.js.
// - Runs `next dev` and forwards any extra CLI flags to it.
import EmbeddedPostgres from 'embedded-postgres';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(root, '.env');
const envLocalFile = resolve(root, '.env.local');

// Load .env first, then .env.local (so local overrides general)
if (existsSync(envFile)) {
  try { process.loadEnvFile(envFile); } catch { /* noop */ }
}
if (existsSync(envLocalFile)) {
  try { process.loadEnvFile(envLocalFile); } catch { /* noop */ }
}

const LOCAL_DB_PORT = 54329;
const LOCAL_DB_DIR = resolve(root, '.local-pg');

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `postgresql://postgres:postgres@localhost:${LOCAL_DB_PORT}/sanchay`;
  process.env.DIRECT_URL ||= process.env.DATABASE_URL;
  console.log('[dev] DATABASE_URL is not set; using the embedded Postgres default (port 54329)');
}

function parseDatabaseUrl(value) {
  try {
    const url = new URL(value);
    return {
      host: url.hostname.replace(/^\[(.*)\]$/, '$1'),
      port: Number(url.port || 5432),
      database: decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres',
      user: decodeURIComponent(url.username) || 'postgres',
      password: decodeURIComponent(url.password) || 'postgres'
    };
  } catch {
    return null;
  }
}

function isLoopback(host) {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0';
}

function isPortOpen(host, port) {
  return new Promise((resolvePort) => {
    const socket = connect({ host, port });
    const done = (open) => {
      socket.destroy();
      resolvePort(open);
    };
    socket.setTimeout(600);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function connectWithRetry(client, label, attempts = 40) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await client.connect();
      return;
    } catch (error) {
      if (attempt >= attempts) throw new Error(`${label} is not accepting connections: ${error.message}`);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
  }
}

function runNodeScript(label, args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', env: process.env });
  if (result.status !== 0) {
    console.error(`[dev] ${label} failed with exit code ${result.status ?? 'unknown'}`);
    process.exit(result.status ?? 1);
  }
}

let database = parseDatabaseUrl(process.env.DATABASE_URL);
if (!database) {
  console.error('[dev] DATABASE_URL is not a valid PostgreSQL connection string.');
  process.exit(1);
}

const isLocalDatabase = isLoopback(database.host);

// If developer configured localhost:5432, but port 5432 is not running and port 54329 or embedded is target
let effectivePort = database.port;
if (isLocalDatabase && database.port === 5432 && !(await isPortOpen('localhost', 5432))) {
  console.log(`[dev] localhost:5432 is not listening; redirecting to embedded Postgres on port ${LOCAL_DB_PORT}`);
  effectivePort = LOCAL_DB_PORT;
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(':5432/', `:${LOCAL_DB_PORT}/`);
  if (process.env.DIRECT_URL) {
    process.env.DIRECT_URL = process.env.DIRECT_URL.replace(':5432/', `:${LOCAL_DB_PORT}/`);
  }
  database = parseDatabaseUrl(process.env.DATABASE_URL);
}

const useEmbedded = isLocalDatabase && effectivePort === LOCAL_DB_PORT;
let embeddedPostgres = null;

if (useEmbedded) {
  embeddedPostgres = new EmbeddedPostgres({
    databaseDir: LOCAL_DB_DIR,
    user: database.user,
    password: database.password,
    port: LOCAL_DB_PORT,
    persistent: true,
    onLog: (line) => {
      if (/(ERROR|FATAL|PANIC)/.test(line)) console.error('[db]', line.trim());
    }
  });

  if (await isPortOpen('localhost', LOCAL_DB_PORT)) {
    console.log(`[dev] reusing the local Postgres already listening on port ${LOCAL_DB_PORT}`);
  } else {
    // Clean up stale lock files from any previous crash / unclean termination
    const pidFile = resolve(LOCAL_DB_DIR, 'postmaster.pid');
    if (existsSync(pidFile)) {
      try {
        unlinkSync(pidFile);
        console.log('[dev] cleaned up stale postmaster.pid');
      } catch {
        /* noop */
      }
    }

    if (!existsSync(resolve(LOCAL_DB_DIR, 'PG_VERSION'))) {
      console.log('[dev] initialising the embedded Postgres data directory (.local-pg)');
      await embeddedPostgres.initialise();
    }
    console.log(`[dev] starting the embedded Postgres on port ${LOCAL_DB_PORT}`);
    try {
      await embeddedPostgres.start();
    } catch (startErr) {
      // Retry once after ensuring postmaster.pid is removed
      if (existsSync(pidFile)) {
        try { unlinkSync(pidFile); } catch { /* noop */ }
        await embeddedPostgres.start();
      } else {
        throw startErr;
      }
    }
  }

  const admin = embeddedPostgres.getPgClient('postgres', database.host);
  await connectWithRetry(admin, 'Postgres');
  try {
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database.database]);
    if (existing.rowCount === 0) {
      console.log(`[dev] creating database "${database.database}"`);
      await admin.query(`CREATE DATABASE "${database.database.replaceAll('"', '""')}"`);
    }
  } finally {
    await admin.end();
  }

  console.log('[dev] applying the Prisma schema & DB guarantees');
  runNodeScript('prisma db push', [resolve(root, 'scripts/db-push.mjs')]);

  const probe = embeddedPostgres.getPgClient(database.database, database.host);
  await connectWithRetry(probe, 'Postgres');
  let vehicleCount = 0;
  try {
    const result = await probe.query('SELECT COUNT(*)::int AS count FROM "Vehicle"');
    vehicleCount = result.rows[0].count;
  } catch {
    vehicleCount = 0;
  } finally {
    await probe.end();
  }

  if (vehicleCount === 0 && process.env.SANCHAY_SKIP_SEED !== '1') {
    console.log('[dev] seeding the empty database with Gwalior demo dataset');
    runNodeScript('database seed', [
      resolve(root, 'node_modules/tsx/dist/cli.mjs'),
      ...(existsSync(envLocalFile) ? ['--env-file=.env.local'] : existsSync(envFile) ? ['--env-file=.env'] : []),
      '--conditions=react-server',
      'prisma/seed.ts'
    ]);
  } else if (vehicleCount > 0) {
    console.log(`[dev] database ready (${vehicleCount} vehicles verified)`);
  }
} else if (isLocalDatabase) {
  console.log(`[dev] using external local database at ${database.host}:${database.port}`);
} else {
  console.log(`[dev] using remote database at ${database.host}:${database.port}`);
}

const nextBin = resolve(root, 'node_modules/next/dist/bin/next');
console.log('[dev] starting Next.js dev server');
const next = spawn(process.execPath, [nextBin, 'dev', ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  env: process.env
});

let shuttingDown = false;
async function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await embeddedPostgres?.stop();
  } catch {
    // The embedded server may already be stopped.
  }
  process.exit(code);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    try {
      next.kill();
    } catch {
      // Next.js may have already exited.
    }
    void shutdown(0);
  });
}

next.on('error', (error) => {
  console.error('[dev] could not start Next.js:', error);
  void shutdown(1);
});
next.on('exit', (code, signal) => {
  void shutdown(code ?? (signal ? 1 : 0));
});

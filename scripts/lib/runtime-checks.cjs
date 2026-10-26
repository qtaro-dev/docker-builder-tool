// GitHub runnerのループバックだけを確認する。アプリ本体からは呼ばない。
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
function hostCommand(command, args, log, extraEnv = {}) {
  const env = { ...extraEnv };
  for (const key of ['PATH', 'Path', 'HOME', 'SystemRoot', 'TEMP', 'TMP', 'TMPDIR']) if (process.env[key]) env[key] = process.env[key];
  const result = spawnSync(command, args, { env, encoding: 'utf8', timeout: 7000, maxBuffer: 1024 * 1024, shell: false, windowsHide: true });
  const output = `${result.stdout || ''}\n${result.stderr || ''}\n${result.error?.message || ''}`;
  fs.appendFileSync(log, `$ ${command} ${JSON.stringify(args)}\n${output}\n`);
  return { ok: result.status === 0 && !result.error, output, stdout: result.stdout || '' };
}
function parsePS(stdout) {
  const text = stdout.trim();
  if (!text) return [];
  if (text.startsWith('[')) return JSON.parse(text);
  return text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}
function probeCase({ generated, composeArgs, execute, directory, log }) {
  const status = execute([...composeArgs, 'ps', '--all', '--format', 'json'], directory, log, 15000);
  if (!status.ok) return { ok: false, reason: 'Compose ps failed' };
  let containers;
  try { containers = parsePS(status.stdout); } catch { return { ok: false, reason: 'Invalid Compose ps JSON' }; }
  for (const service of generated.model.services) {
    const container = containers.find(c => c.Service === service.name);
    if (!container || container.State !== 'running') return { ok: false, reason: `${service.name} is not running` };
  }
  const responses = [];
  for (const endpoint of generated.definition.http || []) {
    const result = hostCommand(process.execPath, [path.join(__dirname, 'http-probe.cjs'), `http://127.0.0.1:${endpoint.port}/`, endpoint.expected], log);
    if (!result.ok) return { ok: false, reason: `${endpoint.module} HTTP failed: ${result.output.slice(0, 500)}` };
    responses.push(`${endpoint.module}: ${result.stdout.trim()}`);
  }
  if (generated.definition.db) {
    const db = generated.definition.db;
    const sql = "BEGIN; CREATE TEMP TABLE ci_validation(value integer); INSERT INTO ci_validation VALUES (19),(23); SELECT 'docker-builder-ci-db-' || SUM(value) FROM ci_validation; ROLLBACK;";
    const result = hostCommand('psql', ['-h', '127.0.0.1', '-p', String(db.port), '-U', db.user, '-d', db.database, '-w', '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql], log,
      { PGPASSWORD: db.password, PGCONNECT_TIMEOUT: '4' });
    if (!result.ok || result.stdout.trim() !== 'docker-builder-ci-db-42') return { ok: false, reason: `PostgreSQL TCP/SQL failed: ${result.output.slice(0, 500)}` };
    responses.push('PostgreSQL: authenticated host TCP connection and SQL sum=42');
  }
  return { ok: true, reason: responses.join('; ') };
}
module.exports = { parsePS, probeCase };

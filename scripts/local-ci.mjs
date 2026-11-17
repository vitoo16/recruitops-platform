#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'ci/local-pipeline.json'), 'utf8'));
const args = process.argv.slice(2);
const index = args.indexOf('--profile');
const profile = index >= 0 ? args[index + 1] : 'full';
if (!Object.hasOwn(config.profiles, profile)) {
  console.error('Unknown profile. Available: ' + Object.keys(config.profiles).join(', '));
  process.exit(2);
}
const stages = config.profiles[profile].map((id) => {
  const stage = config.stages.find((item) => item.id === id);
  if (!stage) throw new Error('Undefined stage: ' + id);
  return stage;
});
if (args.includes('--list')) {
  console.log(profile + ': ' + stages.map((item) => item.id).join(' -> '));
  process.exit(0);
}
if (Number(process.versions.node.split('.')[0]) !== config.nodeMajor) {
  console.error('Requires Node ' + config.nodeMajor + '.x, found ' + process.version);
  process.exit(2);
}
const directory = join(root, '.local-ci');
const lock = join(directory, 'running.lock');
mkdirSync(directory, { recursive: true });
try { mkdirSync(lock); } catch {
  console.error('Another run may be active; inspect .local-ci/running.lock.');
  process.exit(2);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = join(directory, 'runs', stamp + '-' + profile);
mkdirSync(runDir, { recursive: true });
const report = {
  repository: config.repository, profile, startedAt: new Date().toISOString(),
  finishedAt: null, success: false, node: process.version,
  stages: stages.map((stage) => ({ id: stage.id, status: 'not-run' })),
};
const save = () => writeFileSync(join(runDir, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
function runStage(stage, number) {
  return new Promise((done) => {
    const logfile = String(number + 1).padStart(2, '0') + '-' + stage.id + '.log';
    const file = createWriteStream(join(runDir, logfile));
    const env = { ...process.env, CI: '1', ...(config.env ?? {}), ...(stage.env ?? {}) };
    console.log('\n>>> ' + stage.id + ': ' + stage.command);
    const child = spawn(stage.command, {
      cwd: resolve(root, stage.cwd ?? '.'), env, shell: true, windowsHide: true,
    });
    let settled = false;
    const finish = (code, error) => {
      if (settled) return;
      settled = true;
      if (error) file.write(String(error) + '\n');
      file.end(() => done({ code, error: error ? String(error) : null, logfile }));
    };
    child.stdout?.on('data', (buffer) => { process.stdout.write(buffer); file.write(buffer); });
    child.stderr?.on('data', (buffer) => { process.stderr.write(buffer); file.write(buffer); });
    child.on('error', (error) => finish(1, error));
    child.on('close', (code) => finish(code ?? 1, null));
  });
}
async function main() {
  let failed = false;
  try {
    for (let i = 0; i < stages.length; i++) {
      const startedAt = new Date().toISOString();
      report.stages[i] = { id: stages[i].id, status: 'running', startedAt };
      save();
      const result = await runStage(stages[i], i);
      report.stages[i] = {
        id: stages[i].id, status: result.code === 0 ? 'passed' : 'failed',
        startedAt, finishedAt: new Date().toISOString(),
        exitCode: result.code, logfile: result.logfile, error: result.error,
      };
      save();
      if (result.code !== 0) { failed = true; break; }
    }
  } catch (error) {
    failed = true;
    report.error = String(error);
  } finally {
    for (const command of config.cleanup ?? []) {
      console.log('\n>>> cleanup: ' + command);
      const result = await runStage({ id: 'cleanup', command }, stages.length);
      if (result.code !== 0) { failed = true; report.cleanupError = command; }
    }
    report.finishedAt = new Date().toISOString();
    report.success = !failed && report.stages.every((stage) => stage.status === 'passed');
    save();
    rmSync(lock, { recursive: true, force: true });
    console.log('\nLocal CI ' + (report.success ? 'PASSED' : 'FAILED') + '. Evidence: ' + join(runDir, 'summary.json'));
    if (!report.success) process.exitCode = 1;
  }
}
await main();

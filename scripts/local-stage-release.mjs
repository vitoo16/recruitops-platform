#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'ci/local-pipeline.json'), 'utf8'));
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
if (git(['status', '--porcelain'])) throw new Error('Refusing release staging from a dirty worktree.');
const sha = git(['rev-parse', 'HEAD']);
const destination = join(root, '.local-ci', 'releases', sha.slice(0, 12) + '-' + Date.now());
mkdirSync(destination, { recursive: true });
for (const path of config.releaseOutputs) {
  const source = resolve(root, path);
  if (!existsSync(source)) throw new Error('Missing build output: ' + path);
  if (readdirSync(source).length === 0) throw new Error('Empty build output: ' + path);
  const target = join(destination, path);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
}
writeFileSync(join(destination, 'manifest.json'), JSON.stringify({
  repository: config.repository, sha, createdAt: new Date().toISOString(),
  files: config.releaseOutputs, kind: 'LOCAL_RELEASE_CANDIDATE_ONLY',
  verifiedProductionDeployment: false,
}, null, 2) + '\n');
console.log('Staged local release candidate: ' + destination);

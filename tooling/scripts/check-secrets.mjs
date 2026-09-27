import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const trackedFiles = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const findings = [];

const secretPatterns = [
  { name: 'Supabase secret key', regex: /sb_secret_[A-Za-z0-9_-]{20,}/g },
  { name: 'GitHub personal access token', regex: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/g },
  { name: 'GitHub fine-grained token', regex: /github_pat_[A-Za-z0-9_]{40,}/g },
  { name: 'Private key material', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'AWS access key ID', regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'Slack token', regex: /xox[baprs]-[A-Za-z0-9-]{20,}/g },
];

const forbiddenPublicEnv = /NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|PASSWORD|SERVICE_ROLE|PRIVATE_KEY|ACCESS_TOKEN|REFRESH_TOKEN)[A-Z0-9_]*/g;

function isAllowedEnvTemplate(path) {
  return path.endsWith('.env.example') || path.endsWith('.env.sample');
}

for (const path of trackedFiles) {
  const name = basename(path);

  if (name.startsWith('.env') && !isAllowedEnvTemplate(path)) {
    findings.push(`${path}: tracked environment file is forbidden; commit an .env.example template instead`);
  }

  let content;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    continue;
  }

  for (const { name: patternName, regex } of secretPatterns) {
    regex.lastIndex = 0;
    if (regex.test(content)) {
      findings.push(`${path}: possible ${patternName}`);
    }
  }

  forbiddenPublicEnv.lastIndex = 0;
  for (const match of content.matchAll(forbiddenPublicEnv)) {
    findings.push(`${path}: sensitive-looking variable must not be exposed to the browser (${match[0]})`);
  }
}

if (findings.length > 0) {
  console.error('Secret-management guardrail failed:\n');
  for (const finding of findings) console.error(`- ${finding}`);
  console.error('\nRemove the credential, rotate it if it was real, and store it in the deployment provider credential/secret store.');
  process.exit(1);
}

console.log(`Secret-management guardrail passed for ${trackedFiles.length} tracked files.`);

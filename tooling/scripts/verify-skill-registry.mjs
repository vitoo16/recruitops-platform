import { readFileSync } from 'node:fs';

const registry = readFileSync('.agents/SKILL_REGISTRY.md', 'utf8');
const required = JSON.parse(readFileSync('.agents/autoskills-required.json', 'utf8'));
const dryRunPath = process.argv[2];

const registryNames = new Set(
  [...registry.matchAll(/^- \*\*([^*]+)\*\*: https:\/\/www\.skills\.sh\//gm)].map((match) => match[1]),
);

const missingFromRegistry = required.requiredSkills.filter((skill) => {
  const registryName = required.aliases?.[skill] ?? skill;
  return !registryNames.has(registryName);
});

if (missingFromRegistry.length > 0) {
  console.error(`Missing required AutoSkills coverage in SKILL_REGISTRY.md: ${missingFromRegistry.join(', ')}`);
  process.exit(1);
}

if (dryRunPath) {
  const dryRun = readFileSync(dryRunPath, 'utf8');
  const detected = new Set();

  for (const rawLine of dryRun.split(/\r?\n/)) {
    const line = rawLine.replace(/\u001b\[[0-9;]*m/g, '').trim();
    if (!/^\d+\./.test(line) || !line.includes('›')) continue;

    const right = line.split('›', 2)[1]?.trim();
    const skill = right?.split(/\s+/)[0];
    if (skill) detected.add(skill);
  }

  const unknownDetected = [...detected].filter((skill) => !required.requiredSkills.includes(skill));
  const noLongerDetected = required.requiredSkills.filter((skill) => !detected.has(skill));

  if (unknownDetected.length > 0 || noLongerDetected.length > 0) {
    console.error('AutoSkills detection drifted from .agents/autoskills-required.json.');
    if (unknownDetected.length > 0) console.error(`New skills: ${unknownDetected.join(', ')}`);
    if (noLongerDetected.length > 0) console.error(`No longer detected: ${noLongerDetected.join(', ')}`);
    process.exit(1);
  }
}

console.log(`Skill registry covers ${required.requiredSkills.length} AutoSkills stack recommendations.`);

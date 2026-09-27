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
  const detected = new Set(
    [...dryRun.matchAll(/^\s*\d+\.\s+[^›\n]+›\s+([^\s]+)\s+/gm)].map((match) => match[1]),
  );

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

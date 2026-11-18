import { execFileSync } from 'node:child_process';

export function findCaseCollisions(paths) {
  const seen = new Map();
  const collisions = [];

  for (const filePath of paths) {
    const normalized = filePath.normalize('NFC').toLocaleLowerCase('en-US');
    const previous = seen.get(normalized);
    if (previous && previous !== filePath) {
      collisions.push([previous, filePath].sort());
    } else {
      seen.set(normalized, filePath);
    }
  }

  return collisions
    .map(([first, second]) => [first, second])
    .sort(([a1, b1], [a2, b2]) => a1.localeCompare(a2) || b1.localeCompare(b2));
}

export function auditTrackedPaths(paths) {
  const invalidSeparators = paths.filter((filePath) => filePath.includes('\\'));
  const caseCollisions = findCaseCollisions(paths);

  return { invalidSeparators, caseCollisions };
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
  const { invalidSeparators, caseCollisions } = auditTrackedPaths(tracked);

  if (invalidSeparators.length || caseCollisions.length) {
    for (const filePath of invalidSeparators) {
      console.error(`Tracked path contains a Windows separator: ${filePath}`);
    }
    for (const [first, second] of caseCollisions) {
      console.error(`Case-insensitive path collision: ${first} <-> ${second}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`Linux path portability check passed for ${tracked.length} tracked paths.`);
  }
}

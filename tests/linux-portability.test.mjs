import test from 'node:test';
import assert from 'node:assert/strict';
import { auditTrackedPaths, findCaseCollisions } from '../scripts/ci/check-linux-portability.mjs';

test('detects paths that collide on case-insensitive filesystems', () => {
  assert.deepEqual(findCaseCollisions(['src/Chart.tsx', 'src/chart.tsx']), [
    ['src/Chart.tsx', 'src/chart.tsx'],
  ]);
});

test('does not flag distinct paths with different directories', () => {
  assert.deepEqual(findCaseCollisions(['src/Chart.tsx', 'tests/chart.tsx']), []);
});

test('normalizes Unicode before checking case collisions', () => {
  assert.deepEqual(findCaseCollisions(['café/file.ts', 'cafe\u0301/file.ts']), [
    ['cafe\u0301/file.ts', 'café/file.ts'],
  ]);
});

test('flags backslash separators in tracked paths', () => {
  const result = auditTrackedPaths(['src/index.ts', 'scripts\\build.ps1']);
  assert.deepEqual(result.invalidSeparators, ['scripts\\build.ps1']);
});

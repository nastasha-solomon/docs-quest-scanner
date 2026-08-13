import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const SCRIPT = resolve(import.meta.dirname, '..', 'scripts', 'merge-enrichments.mjs');

test('merges the enrichment dismissal reason into the queue assessment', () => {
  const root = mkdtempSync(join(tmpdir(), 'dqs-merge-'));
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'data'));
  copyFileSync(SCRIPT, join(root, 'scripts', 'merge-enrichments.mjs'));

  writeFileSync(
    join(root, 'data', 'queue.json'),
    JSON.stringify({
      scannedAt: '2026-08-13T00:00:00Z',
      items: [
        {
          id: 'same-pr-docs',
          suggestedBody: 'stale',
          assessment: { needsDocs: 'check', confidence: 0.5 },
        },
        {
          id: 'coverage-regressed',
          suggestedBody: 'stale',
          assessment: {
            needsDocs: 'no',
            confidence: 0.95,
            dismissReason: 'owned by dev',
          },
        },
      ],
    })
  );
  writeFileSync(
    join(root, 'data', 'enrichments.json'),
    JSON.stringify({
      'same-pr-docs': {
        needsDocs: 'no',
        confidence: 0.95,
        dismissReason: 'owned by dev',
      },
      'coverage-regressed': {
        needsDocs: 'no',
        confidence: 0.99,
      },
    })
  );

  execFileSync('node', [join(root, 'scripts', 'merge-enrichments.mjs')]);

  const queue = JSON.parse(readFileSync(join(root, 'data', 'queue.json'), 'utf8'));
  assert.equal(queue.items[0].assessment.dismissReason, 'owned by dev');
  assert.equal(queue.items[0].suggestedBody, '');
  assert.equal(queue.items[1].assessment.dismissReason, undefined);
});

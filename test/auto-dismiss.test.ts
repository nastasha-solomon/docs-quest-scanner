import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const SCRIPT = resolve(import.meta.dirname, '..', 'scripts', 'auto-dismiss.mjs');

function item(id: string, needsDocs: string, confidence: number, extra: object = {}) {
  return {
    id,
    repoId: 'elastic/kibana',
    category: 'Test',
    version: 'v9.6.0',
    prs: [{ number: Number(id.replace(/\D/g, '') || 1), title: `PR ${id}`, url: '', author: 'dev', mergedAt: '', body: '', labels: [] }],
    assessment: { needsDocs, confidence, summary: '', reasoning: '' },
    suggestedTitle: `Item ${id}`,
    suggestedBody: '',
    ...extra,
  };
}

function setup(items: object[]) {
  const dir = mkdtempSync(join(tmpdir(), 'dqs-autodismiss-'));
  writeFileSync(join(dir, 'queue.json'), JSON.stringify({ scannedAt: '2026-07-28T00:00:00Z', items }));
  writeFileSync(join(dir, 'history.json'), JSON.stringify({ entries: [] }));
  writeFileSync(join(dir, 'config.json'), JSON.stringify({}));
  return dir;
}

function run(dir: string, ...args: string[]) {
  return execFileSync('node', [SCRIPT, ...args], {
    env: { ...process.env, DQS_DATA_DIR: dir },
    encoding: 'utf-8',
  });
}

test('dismisses only "no" items at or above the threshold', () => {
  const dir = setup([
    item('no-high', 'no', 0.9),
    item('no-exact', 'no', 0.8),
    item('no-low', 'no', 0.75),
    item('check-high', 'check', 0.95),
    item('yes-high', 'yes', 0.95),
  ]);
  const out = run(dir);
  assert.match(out, /Auto-dismissed 2 items/);
  const queue = JSON.parse(readFileSync(join(dir, 'queue.json'), 'utf-8'));
  assert.deepEqual(queue.items.map((i: { id: string }) => i.id).sort(), ['check-high', 'no-low', 'yes-high']);
  const history = JSON.parse(readFileSync(join(dir, 'history.json'), 'utf-8'));
  assert.equal(history.entries.length, 2);
  assert.equal(history.entries[0].decision, 'dismissed');
  assert.match(history.entries[0].reason, /^no docs needed \(auto, /);
  assert.equal(history.entries[0].session, '2026-07-28');
});

test('never dismisses items with user edits', () => {
  const dir = setup([item('edited', 'no', 0.95, { userEdits: { title: 'Custom' } })]);
  const out = run(dir);
  assert.match(out, /No "no docs" items/);
});

test('respects --threshold override and --dry-run', () => {
  const dir = setup([item('no-mid', 'no', 0.85)]);
  const dry = run(dir, '--threshold=0.9', '--dry-run');
  assert.match(dry, /No "no docs" items at confidence >= 0.9/);
  const dry2 = run(dir, '--threshold=0.8', '--dry-run');
  assert.match(dry2, /Dry run: 1 items would be auto-dismissed/);
  // dry-run must not write
  const queue = JSON.parse(readFileSync(join(dir, 'queue.json'), 'utf-8'));
  assert.equal(queue.items.length, 1);
});

test('disabled when autoDismissConfidence is 0', () => {
  const dir = setup([item('no-high', 'no', 0.95)]);
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ autoDismissConfidence: 0 }));
  const out = run(dir);
  assert.match(out, /Auto-dismiss disabled/);
});

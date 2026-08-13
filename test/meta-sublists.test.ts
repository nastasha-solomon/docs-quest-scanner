import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveMetaBucket } from '../src/config.js';
import { insertIntoMetaBody } from '../src/github.js';
import type { RepoGroup } from '../src/types.js';

const FIXED = new Date('2026-07-31T12:00:00Z');

function groupWithSubLists(enabled = true): RepoGroup {
  return {
    id: 'elastic/kibana',
    source: { owner: 'elastic', repo: 'kibana' },
    target: { owner: 'elastic', repo: 'docs-content' },
    categories: [],
    metaSubLists: {
      enabled,
      buckets: [
        {
          heading: 'Notable changes',
          labels: [
            'release_note:feature',
            'release_note:enhancement',
            'release_note:breaking',
            'release_note:deprecation',
          ],
        },
        { heading: 'Fixes and clarifications', labels: ['release_note:fix', 'release_note:skip'] },
      ],
    },
  };
}

// ── resolveMetaBucket ───────────────────────────────────────────

test('resolveMetaBucket routes a feature PR to the first bucket', () => {
  assert.equal(
    resolveMetaBucket(groupWithSubLists(), ['Team:SKI', 'release_note:feature']),
    'Notable changes'
  );
});

test('resolveMetaBucket routes a fix PR to the fixes bucket', () => {
  assert.equal(resolveMetaBucket(groupWithSubLists(), ['release_note:fix']), 'Fixes and clarifications');
});

test('resolveMetaBucket routes release_note:skip to the fixes bucket', () => {
  assert.equal(resolveMetaBucket(groupWithSubLists(), ['release_note:skip']), 'Fixes and clarifications');
});

test('resolveMetaBucket is case-insensitive on labels', () => {
  assert.equal(
    resolveMetaBucket(groupWithSubLists(), ['Release_Note:Feature']),
    'Notable changes'
  );
});

test('resolveMetaBucket first match wins when both an important and a fix label are present', () => {
  assert.equal(
    resolveMetaBucket(groupWithSubLists(), ['release_note:fix', 'release_note:enhancement']),
    'Notable changes'
  );
});

test('resolveMetaBucket falls back to the last bucket when no label matches', () => {
  assert.equal(resolveMetaBucket(groupWithSubLists(), ['Team:SKI']), 'Fixes and clarifications');
});

test('resolveMetaBucket returns undefined when sub-lists are disabled', () => {
  assert.equal(resolveMetaBucket(groupWithSubLists(false), ['release_note:feature']), undefined);
});

test('resolveMetaBucket returns undefined when no sub-lists config is present', () => {
  const g = groupWithSubLists();
  delete g.metaSubLists;
  assert.equal(resolveMetaBucket(g, ['release_note:feature']), undefined);
});

// ── insertIntoMetaBody: flat (backward-compatible) ──────────────

test('insertIntoMetaBody appends to a flat category list when no sub-heading is given', () => {
  const body = ['## Discover', '_[Last check: Jul 1]_', '- [ ] https://x/1', ''].join('\n');
  const out = insertIntoMetaBody(body, 'Discover', 'https://x/2', undefined, FIXED);
  assert.match(out, /- \[ \] https:\/\/x\/1\n- \[ \] https:\/\/x\/2/);
  // Last check line is refreshed to today.
  assert.match(out, /_\[Last check: Jul 31\]_/);
});

test('insertIntoMetaBody creates the category section when missing', () => {
  const out = insertIntoMetaBody('# Meta\n', 'Discover', 'https://x/1', undefined, FIXED);
  assert.match(out, /## Discover\n_\[Last check: Jul 31\]_\n- \[ \] https:\/\/x\/1/);
});

// ── insertIntoMetaBody: sub-lists ───────────────────────────────

test('insertIntoMetaBody inserts under an existing sub-heading', () => {
  const body = [
    '## Discover',
    '_[Last check: Jul 1]_',
    '### Notable changes',
    '- [ ] https://x/1',
    '### Fixes and clarifications',
    '- [ ] https://x/9',
    '',
  ].join('\n');
  const out = insertIntoMetaBody(body, 'Discover', 'https://x/2', 'Notable changes', FIXED);
  assert.match(out, /### Notable changes\n- \[ \] https:\/\/x\/1\n- \[ \] https:\/\/x\/2/);
  // The fixes list is untouched.
  assert.match(out, /### Fixes and clarifications\n- \[ \] https:\/\/x\/9/);
});

test('insertIntoMetaBody creates a sub-heading at the end of an existing section', () => {
  const body = ['## Discover', '_[Last check: Jul 1]_', '### Notable changes', '- [ ] https://x/1', ''].join('\n');
  const out = insertIntoMetaBody(body, 'Discover', 'https://x/5', 'Fixes and clarifications', FIXED);
  assert.match(out, /### Notable changes\n- \[ \] https:\/\/x\/1/);
  assert.match(out, /### Fixes and clarifications\n- \[ \] https:\/\/x\/5/);
});

test('insertIntoMetaBody creates section + sub-heading when the category is missing', () => {
  const out = insertIntoMetaBody('# Meta\n', 'Discover', 'https://x/1', 'Notable changes', FIXED);
  assert.match(
    out,
    /## Discover\n_\[Last check: Jul 31\]_\n### Notable changes\n- \[ \] https:\/\/x\/1/
  );
});

test('insertIntoMetaBody does not disturb a sibling category section', () => {
  const body = [
    '## Discover',
    '_[Last check: Jul 1]_',
    '- [ ] https://x/1',
    '',
    '## Machine learning',
    '_[Last check: Jul 1]_',
    '- [ ] https://x/2',
    '',
  ].join('\n');
  const out = insertIntoMetaBody(body, 'Discover', 'https://x/3', 'Notable changes', FIXED);
  // Machine learning section is preserved verbatim.
  assert.match(out, /## Machine learning\n_\[Last check: Jul 1\]_\n- \[ \] https:\/\/x\/2/);
  assert.match(out, /## Discover[\s\S]*### Notable changes\n- \[ \] https:\/\/x\/3/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { prefilterVerdict } from '../src/prefilter.js';
import type { PullRequest } from '../src/types.js';

function pr(overrides: Partial<PullRequest>): PullRequest {
  return {
    number: 1,
    title: 'Some change',
    url: 'https://github.com/elastic/kibana/pull/1',
    author: 'tester',
    mergedAt: '2026-07-17T00:00:00Z',
    body: '',
    labels: ['release_note:fix'],
    changedFiles: ['src/platform/plugins/shared/dashboard/public/app.tsx'],
    ...overrides,
  };
}

test('no changed-file data → null (never guess without evidence)', () => {
  assert.equal(prefilterVerdict([pr({ changedFiles: [] })]), null);
  assert.equal(prefilterVerdict([pr({ changedFiles: undefined })]), null);
});

test('renovate and kibanamachine PRs are dropped as bot-author', () => {
  const verdict = prefilterVerdict([
    pr({ author: 'elastic-renovate-prod[bot]', changedFiles: ['package.json', 'yarn.lock'] }),
  ]);
  assert.equal(verdict?.rule, 'bot-author');
});

test('human PR is not dropped as bot-author even for deps-shaped files', () => {
  // deps-only human PRs still fall through to infra-only, but a mixed diff must survive
  const verdict = prefilterVerdict([
    pr({ author: 'somedev', changedFiles: ['package.json', 'src/platform/plugins/shared/lens/public/app.tsx'] }),
  ]);
  assert.equal(verdict, null);
});

test('backport-titled PRs are dropped', () => {
  const verdict = prefilterVerdict([pr({ title: '[9.5] Fix a thing (#123456)' })]);
  assert.equal(verdict?.rule, 'backport');
});

test('mixed group with one non-backport PR is kept', () => {
  const verdict = prefilterVerdict([
    pr({ number: 1, title: '[9.5] Fix a thing (#123456)' }),
    pr({ number: 2, title: 'Fix a thing' }),
  ]);
  assert.equal(verdict, null);
});

test('test/CI/tooling-only changes are dropped as infra-only', () => {
  const verdict = prefilterVerdict([
    pr({
      changedFiles: [
        'src/platform/plugins/shared/lens/public/app.test.tsx',
        '.buildkite/pipelines/pull_request.yml',
        'src/platform/packages/shared/kbn-scout/index.ts',
        'x-pack/performance/journeys/dashboard.ts',
        'src/platform/plugins/shared/console/server/spec_definitions/json/generated/foo.json',
        'dev_docs/app_menu.mdx',
      ],
    }),
  ]);
  assert.equal(verdict?.rule, 'infra-only');
});

test('server-only fix/skip with no config schema is dropped', () => {
  const verdict = prefilterVerdict([
    pr({
      labels: ['release_note:skip'],
      changedFiles: [
        'src/platform/plugins/shared/dashboard/server/routes/list.ts',
        'src/platform/plugins/shared/dashboard/common/types.ts',
      ],
    }),
  ]);
  assert.equal(verdict?.rule, 'server-only');
});

test('server-only change touching a config schema is kept', () => {
  const verdict = prefilterVerdict([
    pr({
      labels: ['release_note:enhancement'],
      changedFiles: ['x-pack/platform/plugins/shared/security/server/config.ts'],
    }),
  ]);
  assert.equal(verdict, null);
});

test('server-only breaking change is kept for enrichment', () => {
  const verdict = prefilterVerdict([
    pr({
      labels: ['release_note:breaking'],
      changedFiles: ['src/platform/plugins/shared/dashboard/server/routes/list.ts'],
    }),
  ]);
  assert.equal(verdict, null);
});

test('public UI change is never dropped', () => {
  const verdict = prefilterVerdict([
    pr({
      labels: ['release_note:skip'],
      changedFiles: ['src/platform/plugins/shared/dashboard/public/panel.tsx'],
    }),
  ]);
  assert.equal(verdict, null);
});

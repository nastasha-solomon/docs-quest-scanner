import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldExcludePullRequest } from '../src/exclude-pr.js';
import type { PullRequest, RepoGroup } from '../src/types.js';

const group: RepoGroup = {
  id: 'elastic/kibana',
  source: { owner: 'elastic', repo: 'kibana' },
  target: { owner: 'elastic', repo: 'docs-content' },
  categories: [],
  excludeLabels: ['Synthetics', 'Feature:Synthetics'],
  excludeTitlePatterns: ['^\\[Synthetics\\]'],
};

function pr(partial: Partial<PullRequest> & { number: number; title: string }): PullRequest {
  return {
    url: `https://github.com/elastic/kibana/pull/${partial.number}`,
    author: 'u',
    mergedAt: '2026-01-01T00:00:00Z',
    body: '',
    ...partial,
  };
}

test('excludeLabels drops labeled PRs', () => {
  assert.equal(
    shouldExcludePullRequest(pr({ number: 1, title: 'Alerting tweak', labels: ['Feature:Synthetics'] }), group),
    true
  );
});

test('excludeTitlePatterns drops titled PRs without Synthetics label', () => {
  assert.equal(
    shouldExcludePullRequest(
      pr({ number: 2, title: '[Synthetics] Bulk enable', labels: ['author:actionable-obs'] }),
      group
    ),
    true
  );
});

test('unrelated PRs are kept', () => {
  assert.equal(
    shouldExcludePullRequest(
      pr({ number: 3, title: '[Alerting] Rule API', labels: ['Feature:AlertingV2'] }),
      group
    ),
    false
  );
});
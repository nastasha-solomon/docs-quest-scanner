import assert from 'node:assert/strict';
import test from 'node:test';
import type { PullRequest } from '../src/types.js';

test('release_note:skip is explicitly classified for manual review', async () => {
  const scanner = await import('../src/scanner.js');
  const basicAssessment = (scanner as typeof scanner & {
    basicAssessment?: (prs: PullRequest[], productIssuePattern?: string) => {
      needsDocs: string;
      confidence: number;
      reasoning: string;
    };
  }).basicAssessment;

  assert.equal(typeof basicAssessment, 'function');
  if (!basicAssessment) return;

  const pr: PullRequest = {
    number: 1,
    title: 'User-facing change with skipped release note',
    url: 'https://github.com/elastic/kibana/pull/1',
    author: 'tester',
    mergedAt: '2026-07-17T00:00:00Z',
    body: '',
    labels: ['release_note:skip'],
  };

  const assessment = basicAssessment([pr]);
  assert.equal(assessment.needsDocs, 'check');
  assert.equal(assessment.confidence, 0.3);
  assert.match(assessment.reasoning, /skipped release note/i);
});

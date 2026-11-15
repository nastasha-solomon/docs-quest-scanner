import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveDocSurface } from '../src/doc-surface.js';
import type { Assessment, PullRequest } from '../src/types.js';

function pr(partial: Partial<PullRequest>): PullRequest {
  return {
    number: 1,
    title: 'T',
    url: 'u',
    author: 'a',
    mergedAt: '',
    body: '',
    labels: [],
    ...partial,
  };
}

test('api-only when docsGap targets OpenAPI pages only', () => {
  const assessment: Assessment = {
    needsDocs: 'yes',
    confidence: 0.9,
    summary: '',
    reasoning: '',
    docsGap: [
      {
        pageUrl: 'https://www.elastic.co/docs/api/doc/kibana/operation/operation-post-alerting-v2-rules-bulk-create',
        pageTitle: 'Bulk create rules',
        gap: 'Document new operation in API reference.',
        actionType: 'update-existing',
      },
    ],
  };
  const r = deriveDocSurface(assessment, [pr({})]);
  assert.equal(r.surface, 'api-only');
  assert.equal(r.source, 'enriched');
});

test('mixed when api and guide gaps', () => {
  const assessment: Assessment = {
    needsDocs: 'yes',
    confidence: 0.9,
    summary: '',
    reasoning: '',
    docsGap: [
      {
        pageUrl: 'https://www.elastic.co/docs/api/doc/kibana/operation/foo',
        pageTitle: 'API',
        gap: 'API change',
      },
      {
        pageUrl: 'https://www.elastic.co/docs/explore-analyze/alerting/rules',
        pageTitle: 'Guide',
        gap: 'UI change',
      },
    ],
  };
  assert.equal(deriveDocSurface(assessment, [pr({})]).surface, 'mixed');
});

test('heuristic api-only for server route PR without public UI', () => {
  const assessment: Assessment = {
    needsDocs: 'check',
    confidence: 0.5,
    summary: '',
    reasoning: '',
  };
  const r = deriveDocSurface(assessment, [
    pr({
      title: 'Add bulk create rules API',
      body: 'POST /api/alerting/v2/rules/_bulk_create',
      changedFiles: ['x-pack/foo/server/routes/bulk.ts'],
    }),
  ]);
  assert.equal(r.surface, 'api-only');
  assert.equal(r.source, 'heuristic');
});
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

test('internal API PR does not get heuristic api-only', () => {
  const assessment: Assessment = {
    needsDocs: 'yes',
    confidence: 0.9,
    summary: '',
    reasoning: '',
  };
  const r = deriveDocSurface(assessment, [
    pr({
      title: 'Unified attachments write',
      body: "Routes are `access: 'internal'`. Not public yet.\nPOST /api/cases/foo/attachments",
      changedFiles: ['x-pack/foo/server/routes/post_attachment.ts'],
    }),
  ]);
  assert.equal(r.surface, 'unknown');
  assert.equal(r.source, 'none');
});

test('review-only internal gaps do not surface as api-only', () => {
  const assessment: Assessment = {
    needsDocs: 'no',
    confidence: 0.9,
    summary: '',
    reasoning: '',
    docsGap: [
      {
        pageUrl: 'https://www.elastic.co/docs/api/doc/kibana/operation/operation-addcasecommentdefaultspace',
        pageTitle: 'Add comment',
        gap: 'No action now: routes are internal and absent from the public API reference.',
        actionType: 'review-only',
      },
    ],
  };
  assert.equal(deriveDocSurface(assessment, [pr({})]).surface, 'unknown');
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
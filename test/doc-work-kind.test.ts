import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveDocWorkKind } from '../src/doc-work-kind.js';
import type { Assessment } from '../src/types.js';

function assess(partial: Partial<Assessment>): Assessment {
  return {
    needsDocs: 'yes',
    confidence: 0.8,
    summary: '',
    reasoning: '',
    ...partial,
  };
}

test('effortTag new-content maps to new', () => {
  assert.deepEqual(deriveDocWorkKind(assess({ effortTag: 'new-content' })), {
    kind: 'new',
    source: 'enriched',
  });
});

test('docsGap create-how-to maps to new', () => {
  const r = deriveDocWorkKind(
    assess({
      docsGap: [{ pageUrl: 'https://x', pageTitle: 'T', gap: 'g', actionType: 'create-how-to' }],
    })
  );
  assert.equal(r.kind, 'new');
  assert.equal(r.source, 'enriched');
});

test('release_note:feature heuristic before enrichment', () => {
  const r = deriveDocWorkKind(assess({}), ['release_note:feature']);
  assert.equal(r.kind, 'new');
  assert.equal(r.source, 'heuristic');
});

test('release_note:enhancement heuristic', () => {
  const r = deriveDocWorkKind(assess({}), ['release_note:enhancement']);
  assert.equal(r.kind, 'update');
  assert.equal(r.source, 'heuristic');
});
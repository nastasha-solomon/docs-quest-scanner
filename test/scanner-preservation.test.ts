import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldPreserveAssessment } from '../src/scanner.js';

test('preserves verified same-PR docs assessments even with an empty gap list', () => {
  assert.equal(
    shouldPreserveAssessment({
      needsDocs: 'no',
      confidence: 0.95,
      summary: 'The product PR includes complete user documentation.',
      reasoning: 'The same-PR docs match the implementation.',
      docsGap: [],
      dismissReason: 'owned by dev',
    }),
    true
  );
});

test('does not preserve a basic unenriched assessment with an empty gap list', () => {
  assert.equal(
    shouldPreserveAssessment({
      needsDocs: 'check',
      confidence: 0.5,
      summary: 'Needs enrichment.',
      reasoning: 'Basic scan assessment.',
      docsGap: [],
    }),
    false
  );
});

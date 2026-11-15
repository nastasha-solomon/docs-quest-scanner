import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stackMinorFromVersionLabel,
  collectItemStackMinors,
  itemMatchesStackMinor,
} from '../src/release-version.js';
import type { QueueItem } from '../src/types.js';

test('stackMinorFromVersionLabel', () => {
  assert.equal(stackMinorFromVersionLabel('v9.6.0'), '9.6');
  assert.equal(stackMinorFromVersionLabel('v9.6.1'), '9.6');
});

test('itemMatchesStackMinor uses PR labels', () => {
  const item: QueueItem = {
    id: 'x',
    repoId: 'elastic/kibana',
    category: 'Test',
    version: 'unknown',
    suggestedTitle: '',
    suggestedBody: '',
    prs: [
      {
        number: 1,
        title: 'T',
        url: 'u',
        author: 'a',
        mergedAt: '',
        body: '',
        labels: ['v9.6.0', 'release_note:feature'],
      },
    ],
    assessment: { needsDocs: 'check', confidence: 0.5, summary: '', reasoning: '' },
  };
  assert.deepEqual(collectItemStackMinors(item), ['9.6']);
  assert.equal(itemMatchesStackMinor(item, '9.6'), true);
  assert.equal(itemMatchesStackMinor(item, '9.5'), false);
});
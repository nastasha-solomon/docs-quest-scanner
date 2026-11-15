import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  countItemsForMergePreset,
  endOfLocalDayMs,
  itemLatestMergedAtMs,
  itemMatchesMergeFilter,
  mergeFilterWindow,
  startOfLocalDayMs,
} from '../src/public/queue-merge-filter.js';
import type { QueueItem } from '../src/types.js';

function item(mergedAts: string[]): QueueItem {
  return {
    id: '1',
    repoId: 'elastic/kibana',
    category: 'Test',
    version: 'v9.6.0',
    prs: mergedAts.map((mergedAt, i) => ({
      number: i + 1,
      title: 't',
      url: '',
      author: '',
      mergedAt,
      body: '',
      labels: [],
    })),
    assessment: { needsDocs: 'check', confidence: 0, summary: '', reasoning: '' },
    suggestedTitle: 't',
    suggestedBody: '',
  };
}

test('itemLatestMergedAtMs uses the latest PR merge', () => {
  assert.equal(
    itemLatestMergedAtMs(item(['2026-01-01T00:00:00Z', '2026-02-15T00:00:00Z'])),
    Date.parse('2026-02-15T00:00:00Z')
  );
});

test('mergeFilterWindow 30d is relative to now', () => {
  const now = Date.parse('2026-03-15T12:00:00Z');
  const w = mergeFilterWindow('30d', { now });
  assert.ok(w);
  assert.equal(w!.endMs, now);
  assert.equal(w!.startMs, now - 30 * 86_400_000);
});

test('since-scan uses scan timestamp as start', () => {
  const w = mergeFilterWindow('since-scan', {
    sinceScanAt: '2026-03-01T08:00:00Z',
    now: Date.parse('2026-03-10T00:00:00Z'),
  });
  assert.equal(w!.startMs, Date.parse('2026-03-01T08:00:00Z'));
});

test('custom range is inclusive on local calendar days', () => {
  const noon = new Date(2026, 2, 10, 12).getTime();
  const it = item([new Date(2026, 2, 10, 23).toISOString()]);
  assert.ok(
    itemMatchesMergeFilter(it, 'custom', { customFrom: '2026-03-10', customTo: '2026-03-10', now: noon })
  );
  assert.ok(!itemMatchesMergeFilter(it, 'custom', { customFrom: '2026-03-11', now: noon }));
});

test('items without mergedAt fail active merge filters', () => {
  const it = item([]);
  assert.equal(itemMatchesMergeFilter(it, '7d', { now: Date.now() }), false);
});

test('startOfLocalDayMs and endOfLocalDayMs', () => {
  const start = startOfLocalDayMs('2026-03-01');
  const end = endOfLocalDayMs('2026-03-01');
  assert.ok(end > start);
  assert.ok(end - start < 86_400_000);
});

test('countItemsForMergePreset', () => {
  const items = [
    item(['2026-03-14T00:00:00Z']),
    item(['2026-01-01T00:00:00Z']),
  ];
  const now = Date.parse('2026-03-15T00:00:00Z');
  assert.equal(countItemsForMergePreset(items, '7d', { now }), 1);
  assert.equal(countItemsForMergePreset(items, 'all', { now }), 2);
});
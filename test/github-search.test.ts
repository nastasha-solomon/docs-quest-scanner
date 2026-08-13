import assert from 'node:assert/strict';
import test from 'node:test';
import { searchMergedPRs } from '../src/github.js';

const makeSearchItem = (number: number) => ({
  number,
  title: `PR ${number}`,
  html_url: `https://github.com/elastic/kibana/pull/${number}`,
  user: { login: 'developer' },
  pull_request: { merged_at: '2026-04-02T12:00:00Z' },
  closed_at: '2026-04-02T12:00:00Z',
  body: '',
  labels: [
    { name: 'Team:Presentation' },
    { name: 'release_note:skip' },
    { name: 'v9.5.0' },
  ],
});

test('partitions a capped search instead of requesting results beyond GitHub’s limit', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ query: string; page: number }> = [];
  process.env.GITHUB_TOKEN = 'test-token';

  globalThis.fetch = async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    const url = new URL(request.url);
    const query = url.searchParams.get('q') ?? '';
    const page = Number(url.searchParams.get('page') ?? '1');
    requests.push({ query, page });

    if (query.includes('updated:>=2026-04-01')) {
      return Response.json({ total_count: 0, incomplete_results: false, items: [] });
    }

    if (query.includes('merged:>=2026-04-01')) {
      if (page > 1) {
        return Response.json(
          { message: 'Only the first 1000 search results are available' },
          { status: 422 }
        );
      }
      return Response.json({
        total_count: 1001,
        incomplete_results: false,
        items: Array.from({ length: 100 }, (_, index) => makeSearchItem(1000 + index)),
      });
    }

    if (/merged:\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}/.test(query)) {
      return Response.json({
        total_count: 3,
        incomplete_results: false,
        items: [makeSearchItem(1), makeSearchItem(2), makeSearchItem(3)],
      });
    }

    return Response.json({ total_count: 0, incomplete_results: false, items: [] });
  };

  try {
    const results = await searchMergedPRs(
      { owner: 'elastic', repo: 'kibana' },
      ['Team:Presentation'],
      '2026-04-01'
    );

    assert.deepEqual(
      results.map(({ number }) => number).sort((a, b) => a - b),
      [1, 2, 3]
    );
    assert.equal(
      requests.some(({ query }) =>
        /merged:\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}/.test(query)
      ),
      true
    );
    assert.equal(
      requests.some(
        ({ query, page }) => query.includes('merged:>=2026-04-01') && page > 1
      ),
      false
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

/** A PR merged before the scan date, surfaced only by the late-label `updated:` query. */
const makeLateLabelItem = (number: number, mergedAt: string) => ({
  number,
  title: `PR ${number}`,
  html_url: `https://github.com/elastic/kibana/pull/${number}`,
  user: { login: 'developer' },
  pull_request: { merged_at: mergedAt },
  closed_at: mergedAt,
  body: '',
  labels: [{ name: 'Feature:Actions/ConnectorTypes' }, { name: 'release_note:feature' }],
});

/**
 * Stub a scan where nothing merged since the scan date, but an older PR shows up
 * through the late-label query (as happens the first time a new label is configured).
 */
const runLateLabelScan = async (maxMergeAgeMonths?: number) => {
  const originalFetch = globalThis.fetch;
  process.env.GITHUB_TOKEN = 'test-token';

  globalThis.fetch = async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    const query = new URL(request.url).searchParams.get('q') ?? '';
    if (query.includes('updated:>=2026-07-31')) {
      return Response.json({
        total_count: 1,
        incomplete_results: false,
        // Merged in April, three months before the scan date.
        items: [makeLateLabelItem(500, '2026-04-02T12:00:00Z')],
      });
    }
    return Response.json({ total_count: 0, incomplete_results: false, items: [] });
  };

  try {
    return await searchMergedPRs(
      { owner: 'elastic', repo: 'kibana' },
      ['Feature:Actions/ConnectorTypes'],
      '2026-07-31',
      maxMergeAgeMonths
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
};

test('the default reach-back keeps a late-labeled PR merged within the window', async () => {
  const results = await runLateLabelScan();
  assert.deepEqual(results.map(({ number }) => number), [500]);
});

test('maxMergeAgeMonths 0 limits a category to PRs merged since the last scan', async () => {
  const results = await runLateLabelScan(0);
  assert.deepEqual(results.map(({ number }) => number), []);
});

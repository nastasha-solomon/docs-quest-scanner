import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as github from '../src/github.js';

type PartitionIssueLabels = (
  requested: string[],
  available: string[]
) => { existing: string[]; missing: string[] };

const moduleExports = github as unknown as Record<string, unknown>;

test('partitionIssueLabels omits unavailable labels and matches existing labels case-insensitively', () => {
  const partitionIssueLabels = moduleExports.partitionIssueLabels as PartitionIssueLabels | undefined;
  assert.equal(typeof partitionIssueLabels, 'function');

  assert.deepEqual(
    partitionIssueLabels!(
      ['Team:SKI', 'Feature: Dashboards', 'good first issue'],
      ['team:ski', 'Good First Issue']
    ),
    {
      existing: ['Team:SKI', 'good first issue'],
      missing: ['Feature: Dashboards'],
    }
  );
});

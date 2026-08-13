import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as config from '../src/config.js';
import type { Category } from '../src/types.js';

type ResolveArea = (
  category: Category | undefined,
  prLabels: string[],
  defaultArea?: string
) => string | undefined;
type ResolveFeatureLabel = (
  category: Category | undefined,
  prLabels: string[]
) => string | undefined;
type ResolveIssueLabels = (
  baseLabels: string[],
  category: Category | undefined,
  prLabels: string[],
  goodFirstIssue?: boolean
) => string[];

const moduleExports = config as unknown as Record<string, unknown>;

function category(overrides: Partial<Category>): Category {
  return { name: 'Dashboards and Visualizations', labels: ['Team:Presentation'], ...overrides };
}

test('resolveArea uses a matching PR-label override before the category area', () => {
  const resolveArea = moduleExports.resolveArea as ResolveArea | undefined;
  assert.equal(typeof resolveArea, 'function');

  assert.equal(
    resolveArea!(
      category({
        area: 'Kib: Core Analytics',
        areaByLabel: { 'Team:Visualizations': 'Kib: UX' },
      }),
      ['Team:Visualizations'],
      '[Deprecated] Kibana core'
    ),
    'Kib: UX'
  );
});

test('resolveArea falls back from the category area to the project default', () => {
  const resolveArea = moduleExports.resolveArea as ResolveArea | undefined;
  assert.equal(typeof resolveArea, 'function');

  assert.equal(
    resolveArea!(category({ area: 'Kib: Core Analytics' }), [], '[Deprecated] Kibana core'),
    'Kib: Core Analytics'
  );
  assert.equal(resolveArea!(category({}), [], 'Cross-area'), 'Cross-area');
});

test('resolveFeatureLabel uses a matching PR-label override before the category label', () => {
  const resolveFeatureLabel = moduleExports.resolveFeatureLabel as ResolveFeatureLabel | undefined;
  assert.equal(typeof resolveFeatureLabel, 'function');

  assert.equal(
    resolveFeatureLabel!(
      category({
        featureLabel: 'Feature: Dashboards',
        featureLabelByLabel: { 'Team:Visualizations': 'Feature: Visualizations' },
      }),
      ['Team:Visualizations']
    ),
    'Feature: Visualizations'
  );
});

test('resolveIssueLabels adds the category feature label without duplicating labels', () => {
  const resolveIssueLabels = moduleExports.resolveIssueLabels as ResolveIssueLabels | undefined;
  assert.equal(typeof resolveIssueLabels, 'function');

  assert.deepEqual(
    resolveIssueLabels!(
      ['Team:SKI', 'Feature: Dashboards'],
      category({ featureLabel: 'feature: dashboards' }),
      [],
      true
    ),
    ['Team:SKI', 'Feature: Dashboards', 'good first issue']
  );
});

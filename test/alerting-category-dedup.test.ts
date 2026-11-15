import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickPreferredCategoryItem } from '../src/scanner.js';
import type { QueueItem } from '../src/types.js';

function item(category: string, labels: string[]): QueueItem {
  return {
    id: 'x',
    repoId: 'elastic/kibana',
    category,
    version: 'v9.6.0',
    prs: [{ number: 1, title: 't', url: '', author: '', mergedAt: '', body: '', labels }],
    assessment: { needsDocs: 'check', confidence: 0, summary: '', reasoning: '' },
    suggestedTitle: 't',
    suggestedBody: '',
  };
}

test('prefers v2 when Feature:AlertingV2 is present', () => {
  const v1 = item('Kibana - Alerting v1', ['author:actionable-obs', 'release_note:feature']);
  const v2 = item('Kibana - Alerting v2', ['Feature:AlertingV2', 'author:actionable-obs']);
  assert.equal(pickPreferredCategoryItem(v1, v2).category, 'Kibana - Alerting v2');
  assert.equal(pickPreferredCategoryItem(v2, v1).category, 'Kibana - Alerting v2');
});

test('prefers v1 when only Feature:Alerting is present', () => {
  const v1 = item('Kibana - Alerting v1', ['Feature:Alerting']);
  const v2 = item('Kibana - Alerting v2', ['Team:ResponseOps']);
  assert.equal(pickPreferredCategoryItem(v1, v2).category, 'Kibana - Alerting v1');
});

test('routes rna-project to v2 when not tagged v1', () => {
  const v1 = item('Kibana - Alerting v1', ['Team:ResponseOps']);
  const v2 = item('Kibana - Alerting v2', ['Team:rna-project']);
  assert.equal(pickPreferredCategoryItem(v1, v2).category, 'Kibana - Alerting v2');
});
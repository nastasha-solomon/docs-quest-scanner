import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fixSecurityCasesQueueItem,
  pickPreferredCategoryItem,
  resolveSecurityCasesCategoryFromLabels,
} from '../src/scanner.js';
import type { QueueItem } from '../src/types.js';

function item(category: string, title: string, labels: string[]): QueueItem {
  return {
    id: 'x',
    repoId: 'elastic/kibana',
    category,
    version: 'v9.6.0',
    prs: [{ number: 1, title, url: '', author: '', mergedAt: '', body: '', labels }],
    assessment: { needsDocs: 'check', confidence: 0, summary: '', reasoning: '' },
    suggestedTitle: title,
    suggestedBody: '',
  };
}

const userCasesPrs: Array<{ number: number; title: string; labels: string[] }> = [
  {
    number: 287043,
    title: '[Cases] Add cases.extendedFieldsUpdated workflow trigger',
    labels: ['release_note:enhancement', 'Team:One Workflow', 'Team:Security Investigations', 'v9.6.0'],
  },
  {
    number: 287992,
    title: '[Cases][Workflows] Record workflow executions in case activity',
    labels: ['release_note:feature', 'Team:Cases', 'Team:One Workflow', 'v9.6.0'],
  },
  {
    number: 292144,
    title: '[Security Solution] Send document ids instead of embedded sources',
    labels: ['release_note:breaking', 'Team:One Workflow', 'Team:Security Investigations', 'v9.6.0'],
  },
  {
    number: 295254,
    title: '[Cases][Workflows] Add cases.attachmentsDeleted workflow trigger',
    labels: ['release_note:enhancement', 'Team:Cases', 'Team:One Workflow', 'Team:Security Investigations', 'v9.6.0'],
  },
  {
    number: 298188,
    title: '[Security Investigations] Add cases.deleteAttachments workflow step and Agent Builder delete mode',
    labels: ['release_note:enhancement', 'Team:One Workflow', 'Team:Security Investigations', 'v9.6.0'],
  },
  {
    number: 296878,
    title: '[Security Solution] Let Alert Analysis classify alerts with ai.prompt instead of ai.agent',
    labels: ['release_note:enhancement', 'Team:One Workflow', 'Team:Security Investigations', 'v9.6.0'],
  },
  {
    number: 292581,
    title: '[AlertZero][Alert Triage Worker] Floor Alert Triage Worker full pipeline',
    labels: ['release_note:feature', 'Team:One Workflow', 'Team:Security Investigations', 'v9.6.0'],
  },
];

test('resolveSecurityCasesCategoryFromLabels for Cases / workflow PRs', () => {
  for (const pr of userCasesPrs) {
    assert.equal(
      resolveSecurityCasesCategoryFromLabels(pr.labels, pr.title),
      'Security - Cases',
      `PR ${pr.number}`
    );
  }
});

test('pickPreferredCategoryItem prefers Security - Cases over One Workflow', () => {
  const workflow = item('Security - One Workflow', userCasesPrs[0].title, userCasesPrs[0].labels);
  const cases = item('Security - Cases', userCasesPrs[0].title, userCasesPrs[0].labels);
  assert.equal(pickPreferredCategoryItem(workflow, cases).category, 'Security - Cases');
  assert.equal(pickPreferredCategoryItem(cases, workflow).category, 'Security - Cases');
});

test('fixSecurityCasesQueueItem moves One Workflow items into Security - Cases', () => {
  for (const pr of userCasesPrs) {
    const fixed = fixSecurityCasesQueueItem(
      item('Security - One Workflow', pr.title, pr.labels)
    );
    assert.equal(fixed.category, 'Security - Cases', `PR ${pr.number}`);
    assert.ok(fixed.alsoAppliesTo?.includes('Security - One Workflow'));
  }
});

test('pure One Workflow PRs without Cases signals stay unclassified', () => {
  assert.equal(
    resolveSecurityCasesCategoryFromLabels(
      ['Team:One Workflow', 'release_note:feature'],
      '[Workflows] New connector step'
    ),
    null
  );
});
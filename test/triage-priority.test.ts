import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveTriagePriority, parsePriorityLevel } from '../src/triage-priority.js';
import type { Assessment } from '../src/types.js';

function assess(partial: Partial<Assessment>): Assessment {
  return {
    needsDocs: 'check',
    confidence: 0.8,
    summary: '',
    reasoning: '',
    ...partial,
  };
}

test('parsePriorityLevel', () => {
  assert.equal(parsePriorityLevel('P1: High'), 'P1');
  assert.equal(parsePriorityLevel('P2 (Important)'), 'P2');
  assert.equal(parsePriorityLevel('p0: Critical'), 'P0');
  assert.equal(parsePriorityLevel('unknown'), null);
});

test('enriched triagePriority wins', () => {
  const r = deriveTriagePriority(assess({ triagePriority: 'P1: High' }), []);
  assert.equal(r.level, 'P1');
  assert.equal(r.source, 'enriched');
  assert.equal(r.label, 'P1: High');
});

test('breaking + yes → P0 heuristic', () => {
  const r = deriveTriagePriority(assess({ needsDocs: 'yes' }), ['release_note:breaking']);
  assert.equal(r.level, 'P0');
  assert.equal(r.source, 'heuristic');
});

test('needsDocs no without gaps → none', () => {
  const r = deriveTriagePriority(assess({ needsDocs: 'no' }), ['release_note:feature']);
  assert.equal(r.level, null);
  assert.equal(r.source, 'none');
});

test('feature + yes + new-content → P1', () => {
  const r = deriveTriagePriority(
    assess({ needsDocs: 'yes', effortTag: 'new-content' }),
    ['release_note:feature']
  );
  assert.equal(r.level, 'P1');
});
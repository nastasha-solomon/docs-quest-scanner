import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

async function loadMatcher() {
  const module = await import('../src/release-note-labels.js').catch(() => null);
  assert.ok(module, 'release-note label matcher module should exist');
  return module.hasMatchingConfiguredLabel;
}

test('release_note:* matches current and future release-note labels', async () => {
  const hasMatchingConfiguredLabel = await loadMatcher();
  for (const label of [
    'release_note:breaking',
    'release_note:deprecation',
    'release_note:feature',
    'release_note:enhancement',
    'release_note:fix',
    'release_note:skip',
    'release_note:future-category',
  ]) {
    assert.equal(hasMatchingConfiguredLabel([label], ['release_note:*']), true, label);
  }
});

test('release_note:* excludes unrelated labels', async () => {
  const hasMatchingConfiguredLabel = await loadMatcher();
  assert.equal(hasMatchingConfiguredLabel(['Team:Presentation'], ['release_note:*']), false);
  assert.equal(hasMatchingConfiguredLabel(['release-notes:feature'], ['release_note:*']), false);
});

test('exact configurations remain exact and case-insensitive', async () => {
  const hasMatchingConfiguredLabel = await loadMatcher();
  assert.equal(
    hasMatchingConfiguredLabel(['RELEASE_NOTE:FEATURE'], ['release_note:feature']),
    true
  );
  assert.equal(hasMatchingConfiguredLabel(['release_note:fix'], ['release_note:feature']), false);
});

test('the tracked and built-in defaults remain the original four labels', () => {
  const defaults = JSON.parse(readFileSync('data/config.defaults.json', 'utf8'));
  const expected = [
    'release_note:breaking',
    'release_note:deprecation',
    'release_note:feature',
    'release_note:enhancement',
  ];
  assert.deepEqual(defaults.releaseNoteLabels, expected);

  const configSource = readFileSync('src/config.ts', 'utf8');
  for (const label of expected) assert.match(configSource, new RegExp(`'${label}'`));
  assert.doesNotMatch(configSource, /DEFAULT_RELEASE_NOTE_LABELS[\s\S]*release_note:\*/);
});

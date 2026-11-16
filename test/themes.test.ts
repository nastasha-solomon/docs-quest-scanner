import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_THEME_ID, THEMES, getTheme } from '../src/public/themes.js';

const name = '<strong>Ada</strong>';

test('theme ids are unique and the default theme exists', () => {
  const ids = THEMES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes(DEFAULT_THEME_ID));
});

test('unknown or missing theme ids fall back to the default theme', () => {
  assert.equal(getTheme('no-such-theme').id, DEFAULT_THEME_ID);
  assert.equal(getTheme(null).id, DEFAULT_THEME_ID);
});

for (const def of THEMES) {
  const theme = getTheme(def.id);

  test(`${def.id}: has every field the UI reads`, () => {
    assert.ok(theme.name && theme.description);
    assert.ok(['light', 'dark'].includes(theme.colorMode));
    assert.ok(theme.fallbackName);
    assert.equal(theme.noun.length, 2);
    for (const key of ['active', 'done', 'turnIn'] as const) assert.ok(theme.marks[key], key);
    assert.ok(theme.greetings.length > 0);
    assert.ok(theme.mascots.length > 0);
    for (const mascot of theme.mascots) {
      assert.ok(mascot.svg || mascot.glyph);
      assert.ok(mascot.tooltips.length > 0);
    }
    for (const [key, value] of Object.entries(theme.text)) assert.ok(value, key);
    assert.match(theme.text.acceptLabel, /\bcreate\b.*\bissue\b/i);
    assert.match(theme.text.toastAccepted(42), /#42/);
    assert.match(theme.text.toastSkipped('No docs needed'), /No docs needed/);
  });

  test(`${def.id}: quest lines include the count with matching singular or plural`, () => {
    for (const count of [1, 3]) {
      const singular = count === 1;
      const lines = theme.questLines({
        mark: '! ',
        greeting: theme.greetings[0],
        name,
        count,
        quests: singular ? theme.noun[0] : theme.noun[1],
        singular,
      });
      assert.ok(lines.length > 0);
      for (const line of lines) {
        assert.ok(line.includes(name), line);
        assert.ok(line.includes(String(count)), line);
        if (singular) assert.doesNotMatch(line, /\b1 (?:\w+ )?(?:quests|pages|PRs|drafts|notes|features)\b/, line);
      }
    }
  });

  test(`${def.id}: rest lines include the name`, () => {
    const lines = theme.restLines({ mark: '? ', name });
    assert.ok(lines.length > 0);
    for (const line of lines) assert.ok(line.includes(name), line);
  });

  test(`${def.id}: escaped angle brackets in greetings are balanced`, () => {
    const lines = [
      ...theme.questLines({ mark: '', greeting: theme.greetings[0], name, count: 3, quests: theme.noun[1], singular: false }),
      ...theme.restLines({ mark: '', name }),
    ];
    for (const line of lines) {
      const opens = line.split('&lt;').length - 1;
      const closes = line.split('&gt;').length - 1;
      assert.equal(opens, closes, line);
    }
  });

  test(`${def.id}: rewards have base items and a bonus pool`, () => {
    assert.ok(theme.rewards.header && theme.rewards.accept && theme.rewards.dismiss);
    assert.ok(theme.rewards.base().length > 0);
    assert.ok(theme.rewards.bonus.length > 0);
  });
}

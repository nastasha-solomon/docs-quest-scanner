import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('bumps the deployed skill version without changing configurable defaults', async () => {
  const template = await readFile(
    new URL('../templates/skill.md.template', import.meta.url),
    'utf8'
  );

  assert.match(template, /^version: 3\.8\.1$/m);
  assert.match(
    template,
    /The default configuration includes `release_note:breaking`, `release_note:deprecation`, `release_note:feature`, and `release_note:enhancement`\./
  );
  assert.match(template, /configure `release_note:\*`/);
});

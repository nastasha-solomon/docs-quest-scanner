import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('bumps the deployed skill version without changing configurable defaults', async () => {
  const template = await readFile(
    new URL('../templates/skill.md.template', import.meta.url),
    'utf8'
  );

  assert.match(template, /^version: 3\.14\.0$/m);
  assert.match(
    template,
    /The default configuration includes `release_note:breaking`, `release_note:deprecation`, `release_note:feature`, and `release_note:enhancement`\./
  );
  assert.match(template, /configure `release_note:\*`/);
  // Stage-1 pre-filter: documented in the scan step, the enrichment guard, and config.
  assert.match(template, /Pre-filters provably non-docs items/);
  assert.match(template, /`assessment\.prefiltered`/);
  assert.match(template, /`prefilter`: deterministic stage-1 pre-filter \(default `true`\)/);
  // Auto-dismiss: documented as step 2i, in config, and in the confidence calibration note.
  assert.match(template, /auto-dismiss\.mjs/);
  assert.match(template, /`autoDismissConfidence`/);
  assert.match(template, /auto-dismissed\*\* after enrichment/);
  assert.match(template, /path alone never proves sufficient coverage/);
  assert.match(template, /dismissReason: "owned by dev"/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { DEFAULT_THEME_ID, getTheme } from '../src/public/themes.js';

function renderCard(): string {
  const appSource = readFileSync(resolve(import.meta.dirname, '..', 'src', 'public', 'app.js'), 'utf8');
  const context = {
    clearTimeout,
    console,
    document: {
      addEventListener() {},
      createElement() {
        return {
          innerHTML: '',
          set textContent(value: string) {
            this.innerHTML = value
              .replaceAll('&', '&amp;')
              .replaceAll('<', '&lt;')
              .replaceAll('>', '&gt;')
              .replaceAll('"', '&quot;');
          },
        };
      },
    },
    fetch,
    requestAnimationFrame() {},
    setTimeout,
    __theme: getTheme(DEFAULT_THEME_ID),
  } as Record<string, unknown>;

  vm.runInNewContext(
    `${appSource}\nactiveTheme = globalThis.__theme;\nglobalThis.__renderCard = renderCard;`,
    context
  );

  const render = context.__renderCard as (item: unknown) => string;
  return render({
    id: 'test-item',
    repoId: 'elastic/kibana',
    category: 'Discover',
    version: 'v9.6.0',
    prs: [
      {
        number: 123,
        title: 'Add a user-facing feature',
        author: 'developer',
        url: 'https://github.com/elastic/kibana/pull/123',
        labels: ['release_note:feature'],
      },
    ],
    suggestedTitle: 'Document the user-facing feature',
    suggestedBody: 'Issue body',
    assessment: {
      needsDocs: 'yes',
      confidence: 0.9,
      summary: 'Summary',
      reasoning: 'Reasoning',
      screenshots: [],
      existingDocs: [],
      docsGap: [],
      serverlessApplies: 'yes',
    },
  });
}

test('offers every supported skip reason on each triage card', () => {
  const html = renderCard();
  const options = [...html.matchAll(
    /<button[^>]*data-action="dismiss"[^>]*data-reason="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/button>/g
  )].map((match) => ({ reason: match[1], label: match[2].trim() }));

  assert.deepEqual(options, [
    { reason: 'no docs needed', label: 'Skip – no docs' },
    { reason: 'already tracked', label: 'Skip – already tracked' },
    { reason: 'owned by dev', label: 'Skip – owned by dev' },
    { reason: 'release notes only', label: 'Skip – release notes only' },
    { reason: 'not my area', label: 'Skip – not my area' },
  ]);
});

# Release-Note Wildcard Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in trailing-wildcard matching for release-note labels, keep the existing global defaults, and configure only the current installed scanner to use `release_note:*`.

**Architecture:** Put exact and prefix-wildcard matching in a pure TypeScript helper, then call that helper from the existing scanner filter. Keep configuration normalization and tracked defaults unchanged; the installed runtime opts in through its existing configuration API after deployment.

**Tech Stack:** TypeScript, Node.js built-in test runner through `tsx`, Express configuration API, Bash deployment script, rsync, Git.

## Global Constraints

- The built-in and tracked default release-note list remains `release_note:breaking`, `release_note:deprecation`, `release_note:feature`, and `release_note:enhancement`.
- Exact configured labels remain case-insensitive exact matches.
- Only a trailing `*` has wildcard meaning; it performs a case-insensitive prefix match.
- Runtime `data/config.json` is not copied or overwritten by deployment.
- Only this machine's current runtime config changes to `releaseNoteLabels: ["release_note:*"]`.
- Preserve the pre-existing uncommitted `yarn.lock` change and exclude it from every commit.
- Maintain one canonical real installation at `~/.agents/skills/docs-quest-scanner` and one symlink at `~/.claude/skills/docs-quest-scanner`.

---

### Task 1: Add the wildcard matcher with RED-GREEN tests

**Files:**
- Create: `src/release-note-labels.ts`
- Create: `test/release-note-labels.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `hasMatchingConfiguredLabel(labels: readonly string[], configuredLabels: readonly string[]): boolean`
- Consumes: PR label names and the normalized `releaseNoteLabels` array.

- [ ] **Step 1: Add the test command and failing matcher tests**

Add this package script without changing dependencies:

```json
"test": "tsx --test test/*.test.ts"
```

Create `test/release-note-labels.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

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
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
yarn test
```

Expected: FAIL with the assertion `release-note label matcher module should exist`; the default-preservation test may already pass.

- [ ] **Step 3: Add the minimal matcher implementation**

Create `src/release-note-labels.ts`:

```ts
export function hasMatchingConfiguredLabel(
  labels: readonly string[],
  configuredLabels: readonly string[]
): boolean {
  const normalizedLabels = labels.map((label) => label.toLowerCase());

  return configuredLabels.some((configuredLabel) => {
    const normalized = configuredLabel.toLowerCase();
    if (normalized.endsWith('*')) {
      const prefix = normalized.slice(0, -1);
      return normalizedLabels.some((label) => label.startsWith(prefix));
    }
    return normalizedLabels.includes(normalized);
  });
}
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run `yarn test`.

Expected: four tests pass with zero failures.

- [ ] **Step 5: Commit the matcher**

```bash
git add package.json src/release-note-labels.ts test/release-note-labels.test.ts
git commit -m "feat: support wildcard release note labels"
```

Confirm `yarn.lock` is not staged.

---

### Task 2: Integrate wildcard filtering and classify skip labels

**Files:**
- Modify: `src/scanner.ts`
- Create: `test/scanner-assessment.test.ts`

**Interfaces:**
- Consumes: `hasMatchingConfiguredLabel` from Task 1.
- Produces: scanner queue inclusion for exact or wildcard-configured labels and an explicit manual-review assessment for `release_note:skip`.

- [ ] **Step 1: Write the failing skip-assessment test**

Create `test/scanner-assessment.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import type { PullRequest } from '../src/types.js';

test('release_note:skip is explicitly classified for manual review', async () => {
  const scanner = await import('../src/scanner.js');
  const basicAssessment = (scanner as typeof scanner & {
    basicAssessment?: (prs: PullRequest[], productIssuePattern?: string) => {
      needsDocs: string;
      confidence: number;
      reasoning: string;
    };
  }).basicAssessment;

  assert.equal(typeof basicAssessment, 'function');
  if (!basicAssessment) return;

  const pr: PullRequest = {
    number: 1,
    title: 'User-facing change with skipped release note',
    url: 'https://github.com/elastic/kibana/pull/1',
    author: 'tester',
    mergedAt: '2026-07-17T00:00:00Z',
    body: '',
    labels: ['release_note:skip'],
  };

  const assessment = basicAssessment([pr]);
  assert.equal(assessment.needsDocs, 'check');
  assert.equal(assessment.confidence, 0.3);
  assert.match(assessment.reasoning, /skipped release note/i);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run `yarn test`.

Expected: the skip-assessment test fails because `basicAssessment` is not exported.

- [ ] **Step 3: Integrate the matcher and add skip classification**

In `src/scanner.ts`:

1. Import `hasMatchingConfiguredLabel` from `./release-note-labels.js`.
2. Keep `group.releaseNoteLabels` as an array instead of converting it to a `Set`.
3. Replace the exact-membership filter with:

```ts
prs = prs.filter((pr) => hasMatchingConfiguredLabel(pr.labels, releaseNoteLabels));
```

4. Export `basicAssessment` as a pure assessment function.
5. Detect `release_note:skip` alongside the existing release-note categories.
6. Add this branch after the fix branch:

```ts
} else if (hasSkip) {
  needsDocs = 'check';
  confidence = 0.3;
  reasoning = 'Skipped release note — review for documentation impact despite release-note omission.';
```

7. Update the nearby release-note hierarchy comment to include `release_note:skip` and unknown wildcard-matched categories.

- [ ] **Step 4: Run tests and TypeScript build**

Run:

```bash
yarn test
yarn build
```

Expected: all tests pass and `tsc` exits zero.

- [ ] **Step 5: Commit scanner integration**

```bash
git add src/scanner.ts test/scanner-assessment.test.ts
git commit -m "feat: scan wildcard release note categories"
```

Confirm `yarn.lock` is not staged.

---

### Task 3: Document wildcard configuration and bump the skill version

**Files:**
- Modify: `templates/skill.md.template`
- Modify: `README.md`
- Modify: `src/public/index.html`
- Modify: `src/public/app.js`

**Interfaces:**
- Produces: discoverable configuration guidance for exact labels and `release_note:*`.
- Preserves: `data/config.defaults.json` and `DEFAULT_RELEASE_NOTE_LABELS` unchanged.

- [ ] **Step 1: Update the runtime skill template**

Make these focused changes in `templates/skill.md.template`:

- Increment frontmatter `version` from `3.7.0` to `3.8.0`.
- Keep the Step 1 default list of breaking, deprecation, feature, and enhancement.
- Immediately after that default, state: `releaseNoteLabels` accepts exact label names and trailing-prefix wildcards; configure `release_note:*` to include fix, skip, and future release-note categories.
- Add `release_note:fix` and `release_note:skip` as manual-review cases in assessment heuristics.
- Update the Configuration section to describe exact entries and trailing `*` prefix matching.

- [ ] **Step 2: Update repository and UI guidance**

In `README.md`, change the `releaseNoteLabels` configuration row to show the unchanged default and add a sentence that `release_note:*` opts into every release-note category while exact arrays remain restrictive.

In `src/public/index.html` and the multi-repo input in `src/public/app.js`, change release-note placeholders to include `release_note:*` as the first example.

- [ ] **Step 3: Verify defaults stayed unchanged**

Run:

```bash
yarn test
git diff -- data/config.defaults.json src/config.ts
```

Expected: tests pass and the defaults diff is empty.

- [ ] **Step 4: Build and inspect generated runtime skill content**

Run `yarn build`, then render a temporary skill file:

```bash
sed "s|__TOOL_DIR__|$HOME/.agents/skills/docs-quest-scanner|g" templates/skill.md.template > /tmp/docs-quest-scanner-SKILL.md
```

Verify the temporary file contains version `3.8.0`, `release_note:*`, and no `__TOOL_DIR__` placeholder.

- [ ] **Step 5: Commit documentation and UI guidance**

```bash
git add README.md templates/skill.md.template src/public/index.html src/public/app.js
git commit -m "docs: explain release note wildcard configuration"
```

Confirm `yarn.lock` is not staged.

---

### Task 4: Verify, push, deploy, and opt in this runtime

**Files:**
- Runtime-preserved update through API: `~/.agents/skills/docs-quest-scanner/data/config.json`
- No tracked source file changes.

**Interfaces:**
- Consumes: repository tests/build and `scripts/deploy.sh`.
- Produces: pushed repository commits, one canonical installed skill at version `3.8.0`, and this runtime configured with `release_note:*`.

- [ ] **Step 1: Run the complete repository verification**

Run:

```bash
yarn test
yarn build
git diff --check
git status --short
```

Expected: tests and build pass; only the pre-existing `yarn.lock` modification remains outside committed work.

- [ ] **Step 2: Commit the implementation plan if it is still uncommitted**

```bash
git add docs/superpowers/plans/2026-07-17-release-note-wildcard.md
git commit -m "docs: plan release note wildcard implementation"
```

- [ ] **Step 3: Push the repository**

Run `git push origin main`.

Expected: the design, plan, implementation, tests, and documentation commits reach `origin/main`; `yarn.lock` remains local and uncommitted.

- [ ] **Step 4: Stop the running installed review server and deploy from the clone**

Stop the existing `yarn dev` process for the installed copy, then run from the development clone:

```bash
yarn deploy
```

Expected: deployment reports the canonical `~/.agents` destination and recreates the `~/.claude` symlink without copying runtime data.

- [ ] **Step 5: Restart the installed review server**

From `~/.agents/skills/docs-quest-scanner`, run:

```bash
GITHUB_TOKEN=$(gh auth token) yarn dev
```

Expected: `PR Docs Triage running at http://localhost:3847`.

- [ ] **Step 6: Update only the current runtime config through the API**

Fetch `GET http://localhost:3847/api/config`. Confirm its top-level `releaseNoteLabels` still equals the old four-label default and no repository-level override is present. Send the same JSON back with only this change:

```json
"releaseNoteLabels": ["release_note:*"]
```

Use `PUT http://localhost:3847/api/config`; abort instead of overwriting if the precondition does not match.

- [ ] **Step 7: Verify the live runtime and non-duplicate installation**

Verify:

```bash
test -d "$HOME/.agents/skills/docs-quest-scanner"
test ! -L "$HOME/.agents/skills/docs-quest-scanner"
test -L "$HOME/.claude/skills/docs-quest-scanner"
readlink "$HOME/.claude/skills/docs-quest-scanner"
curl -fsS http://localhost:3847/api/config
```

Expected:

- The canonical path is a real directory.
- The Claude path points to `../../.agents/skills/docs-quest-scanner`.
- Installed `SKILL.md` reports version `3.8.0` and documents `release_note:*`.
- The live config contains `releaseNoteLabels: ["release_note:*"]`.
- Installed runtime data and the seven-item review queue are preserved.
- Importing the installed matcher returns `true` for both `release_note:fix` and `release_note:skip`, and `false` for an unrelated team label.

- [ ] **Step 8: Confirm repository cleanliness within scope**

Run `git status --short --branch` in the development clone.

Expected: the branch matches `origin/main`; the only remaining worktree modification is the user's pre-existing `yarn.lock` change.

# Enhancement request: Queue filters, bulk actions, and triage UI

**Author:** Nastasha Solomon  
**Fork:** [nastasha-solomon/docs-quest-scanner](https://github.com/nastasha-solomon/docs-quest-scanner) (`main`)  
**Upstream:** [florent-leborgne/docs-quest-scanner](https://github.com/florent-leborgne/docs-quest-scanner)

## Summary

After a scan, the Security, Alerting, and Observability queue is too large to work through card by card. Writers need to narrow it to one release, team, or time window, and then act on many items at once. The **API reference only** view also needs to leave out internal server routes that aren't in the public API yet.

| Change | What it does | Details |
|--------|--------------|---------|
| Queue filters | Filter by assessment, stack release, merge date, doc work, category, and priority | [Section 1](#1-queue-filters) |
| Config options | Set focus releases and categories, and starting filter values | [Section 2](#2-config-options) |
| Queue classification | Work out doc work type, API surface, and priority for each item when the queue loads | [Section 3](#3-queue-classification) |
| Enrichment updates | Skill guidance so AI enrichment keeps that classification accurate | [Section 4](#4-enrichment-and-skill-updates) |
| Card badges | Show doc work type and priority on each card | [Section 5](#5-card-badges) |
| Scan scope and scan buttons | Show what the queue covers, and start a scan or enrichment from the page | [Section 6](#6-scan-scope-and-scan-buttons) |
| Skip reasons | Add **release notes only** and **not my area** | [Section 7](#7-skip-reasons) |
| Bulk actions | Accept or skip all selected items at once, with a progress bar | [Section 8](#8-bulk-actions) |
| Help text | Tooltips on controls and badges, and a description under each list heading | [Section 9](#9-help-text) |

## Example: weekly triage pass

Filters combine in any order. A typical Security and Alerting pass:

1. **Stack release:** Focus (for example, 9.7 and 9.6)
2. **Category:** Focus (for example, Alerting v2 and Detection Engine)
3. **Assessment:** Needs docs + Check
4. **Merged:** Last 30 days, or **Since last scan** when catching up
5. **Doc work:** API reference only, when doing an API pass
6. **Priority:** P0 + P1

Then **Select all** and apply a bulk action to the results. The config for this pass is in [Section 2](#2-config-options).

---

## Proposed changes

### 1. Queue filters

All filters combine. Each filter's value is kept in `sessionStorage` for the browser tab.

| Filter | Options |
|--------|---------|
| **Assessment** | All, Needs docs, Check, No docs needed, Needs docs + Check |
| **Stack release** | All versions, **Focus** ([Section 2](#2-config-options)), or one minor. Patch labels map to their minor (`v9.6.1` → `9.6`). |
| **Merged** | All dates, Last 7 / 30 / 90 days, **Since last scan**, Custom range |
| **Doc work** | All, New content, Update existing, **API reference only**, Not classified yet |
| **Category** | All categories, **Focus** ([Section 2](#2-config-options)), or one category. Matches the item's `category` or `alsoAppliesTo`. |
| **Priority** | All, P0 + P1, P0, P1, P2, P3, Unrated |

- The **Triage queue** heading shows the item count, or **Showing X of Y items** when any filter is active.
- **Reset**, at the end of the filter row, sets every filter to All. It ignores `defaultQueueFilters`.
- A **★** in a dropdown marks focus releases and focus categories.
- Within each category group, cards sort by priority (P0 first), then by confidence.

#### Merged filter

Filters by when PRs merged, independent of the version labels that **Stack release** uses. It only filters the loaded queue. It doesn't change what a scan fetches (unlike `maxMergeAgeMonths`).

- **Date used:** For items that group several PRs, the latest `mergedAt` (the same rule as serverless week estimates).
- **Presets:** 7, 30, and 90 days count back from now. **Since last scan** uses `filterMeta.lastScanAt` from `GET /queue`.
- **Custom range:** Choosing **Custom range…** shows **From** and **To** date fields. Both are inclusive local days. Set only one for an open-ended range. **Clear range** resets them.
- **Counts:** Each option shows how many items in the full queue match, ignoring other filters.
- **No merge date:** Items without `mergedAt` are hidden when any option other than **All dates** is selected.
- **Storage:** `sessionStorage` keys `queue-merge-filter`, `queue-merge-from`, and `queue-merge-to`.
- **Code:** `src/public/queue-merge-filter.js`, tested in `test/queue-merge-filter.test.ts`. `applyQueueFilters()` runs it after the assessment and stack release filters.

#### Layout

The controls above the queue sit in one bordered panel with three labeled rows: **Scan scope**, **Filters**, and **Bulk actions**. Each row has a short title and hint on the left, and its controls on the right. Under 720px wide, the label stacks above the controls. The **Triage queue** heading below the panel is larger than the category headings, so the page reads top to bottom: controls, then the queue, then categories.

Each filter is a label and dropdown inside one bordered pill (`.queue-filter-field`). The filter row stays on one line and scrolls horizontally on narrow screens. Dropdowns size to their content (`field-sizing: content` where supported), and `.app-container` uses tighter side padding so more of the queue fits.

### 2. Config options

All four keys are optional. They only affect the review UI, not scanning or category assignment.

| Key | What it does |
|-----|--------------|
| `focusStackReleases` | Minors for the **Stack release → Focus** option, for example `["9.6", "9.7"]` |
| `autoFocusStackReleases` | When `true`, Focus uses the newest one or two minors found in the queue's PR version labels, and `focusStackReleases` is ignored. The UI shows **Focus: 9.7, 9.6 (auto)**. There's no release-calendar lookup. |
| `focusCategories` | Categories for the **Category → Focus** option |
| `defaultQueueFilters` | Starting filter values for a new browser session. Applies only to filters the user hasn't set yet in that session. Keys: `assessment`, `version`, `mergeRange`, `mergeFrom`, `mergeTo`, `docWork`, `category`, `priority`. |

Config for the weekly pass above:

```json
"autoFocusStackReleases": true,
"focusCategories": ["Kibana - Alerting v2", "Security - Detection Engine"],
"defaultQueueFilters": {
  "assessment": "yes,check",
  "version": "focus",
  "category": "focus",
  "priority": "p0,p1"
}
```

### 3. Queue classification

`GET /queue` adds these fields to each item on every request. They aren't saved to `queue.json`.

| Field | How it's set |
|-------|--------------|
| `stackMinors` | From the PR version labels |
| `docWorkKind`, `docWorkKindSource` | From `effortTag`, `docsGap.actionType`, or release-note labels (`src/doc-work-kind.ts`) |
| `docSurface`, `docSurfaceSource` | Whether the work is API reference only, guides, or both (`src/doc-surface.ts`) |
| `triagePriorityLevel`, `triagePriorityLabel`, `triagePrioritySource` | From `assessment.triagePriority`, or estimated by `deriveTriagePriority` (`src/triage-priority.ts`) |

The response also includes `filterMeta`:

- `focusStackReleases` and `focusAuto`: the current stack focus and whether it's automatic
- `focusCategories`: from config
- `lastScanAt`: `queue.scannedAt`, or `lastRun.lastRunDate` if that's unset. Used by **Since last scan**.

The **API reference only** filter matches items where `docSurface` is `api-only` and doc work is update or not classified. Net-new guides don't match.

#### Keeping internal routes out of API reference only

Some PRs change HTTP routes that aren't in the public OpenAPI spec yet. These shouldn't match **API reference only** or get the dashed **API ref (estimate)** badge. `deriveDocSurface` handles this in two ways:

- **Before enrichment:** It doesn't return `api-only` when the PR text says the route is internal, for example `access: 'internal'`, "not public yet", "routes are internal", or "internal for now". This applies even when the PR body mentions `POST /api/...` and only `server/` files changed.
- **After enrichment:** When every `docsGap` entry is `review-only` and the gap text says the route is internal, not public, needs no action now, or isn't in the public API reference, it returns `unknown`. Older operation URLs in those gaps are treated as context only.

Example: [elastic/kibana#291814](https://github.com/elastic/kibana/pull/291814) adds an internal write path. [#294886](https://github.com/elastic/kibana/pull/294886) is the public OpenAPI follow-up.

#### Priority

| Source | Behavior |
|--------|----------|
| Enrichment | `assessment.triagePriority`, using the exact GitHub Projects Priority value (for example, `P1: High`) |
| Estimate | Derived from `release_note:*`, `needsDocs`, and `effortTag` as P0–P3. The card badge is dashed and marked **(estimate)**. |
| None | Items with `needsDocs: "no"` and no gaps are **Unrated**. |

When an issue is created, the project **Priority** field uses `triagePriority` first, then the estimate, then `project.defaultPriority`.

### 4. Enrichment and skill updates

Changes to `templates/skill.md.template` (version 3.15.0) so enriched data keeps the filters accurate:

- **API reference gaps:** For public routes, `docsGap` entries include the OpenAPI operation URL and say "API reference". For internal routes, they use `actionType: review-only` and say the route is internal or not in the public OpenAPI spec, so `docSurface` stays `unknown`.
- **Public routes still get API analysis:** Step 2a skips API analysis only for purely internal server refactors. Public `/api/...` changes are analyzed even when `needsDocs` is `"no"` (for example, OpenAPI code generation).
- **`triagePriority`:** Optional. Set it when severity is clear, such as P0 or P1 for breaking changes or major features with `needsDocs: "yes"`. Leave it out when `needsDocs` is `"no"`. Use the same values as the target GitHub Project.
- **Split enrichment batches:** Batches such as `data/enrichments-batch-a.json` can be merged with `scripts/merge-enrichments.mjs`, which accepts `triagePriority`.
- **UI reference:** The skill describes the new filters, skip reasons, and bulk actions so agents can explain them.

### 5. Card badges

In addition to the existing assessment and release-note chips, each card can show:

- **API ref**, **New content**, or **Update existing**, from `docWorkKind` and `docSurface`
- **P0** to **P3**, from `triagePriorityLevel`

Badges are dashed when the value is an estimate. The effort tag badge is unchanged.

### 6. Scan scope and scan buttons

The **Scan scope** row shows what the loaded queue covers and lets writers refresh it without the terminal.

- **Summary:** Repo, **Merged since** (`lastRun.lastRunDate`, the start of the scan window), **Last scan run** (`queue.scannedAt`), and the number of categories and team labels. The **Merged since** tooltip explains that the date only moves on **Mark scan complete**.
- **Details:** **Show categories and labels** opens a table with each category's team labels and its item count in the queue. Below it are the release note labels and any `excludeLabels` or `excludeTitlePatterns`. The open or closed state is kept in `sessionStorage` (`scan-context-open`).
- **Run scan:** Calls the existing `POST /scan`, which had no button before. A message covers the page while the scan runs, and a toast then reports new and total items. The endpoint now returns `scanStats: { total, added }` and responds with `409` if a scan is already running. New items are matched by repo and PR numbers, because item IDs change on every scan.
- **Enrich N items:** Counts items that still need enrichment, using the skill's Step 2 rule: not pre-filtered, not **owned by dev**, and no `docsGap`. It opens a dialog with a prompt to paste into Claude Code. Enrichment needs an AI agent with docs search, so the server doesn't run it. The button is disabled when nothing is left.
- **Tooltips:** Both buttons have tooltips ([Section 9](#9-help-text)) that say what will happen, including the current **Merged since** date and the number of items waiting.

### 7. Skip reasons

Each card has five **Skip** buttons. Each one calls `POST /dismiss` with a `reason`, removes the item from the queue, and adds a `dismissed` entry to `data/history.json`. The last two are new.

| Button | Stored `reason` |
|--------|-----------------|
| Skip – no docs | `no docs needed` |
| Skip – already tracked | `already tracked` |
| Skip – owned by dev | `owned by dev` |
| Skip – release notes only | `release notes only` |
| Skip – not my area | `not my area` |

The reason shows in the **History** tab and in the **Skipped** list at the bottom of the queue (items skipped since the current scan), which has **Restore** (`POST /undo-dismiss`). **Restore** deletes the skip from history, so the PR comes back on the next scan. No API fields change; only the set of allowed `reason` values grows. Auto-dismiss can still add a suffix, for example `no docs needed (auto, …)`.

`test/skip-options.test.ts` checks that every card has all five buttons.

### 8. Bulk actions

Lets writers act on a filtered slice of the queue without opening each card.

**Selecting items**

- Each card has a checkbox. Each category header has a checkbox that selects the visible items in that category.
- The **Bulk actions** row has **Select all** (every item matching the current filters), **Clear selection**, and a selected count on the left. The **Action** dropdown, in the same pill style as the filters, and the apply button are on the right.
- The apply button names the action and count, for example **Accept 5 quests** or **Skip – no docs (3)**. It's disabled until at least one item is selected.

**Actions**

The **Action** dropdown offers **Accept quest** and the five skip reasons from [Section 7](#7-skip-reasons). Every action asks for confirmation first and lists a sample of the selected titles.

- **Accept quest** creates a GitHub issue for each item. **Good first issue** isn't applied in bulk; use the per-card checkbox.
- **Skip** actions dismiss each item with the matching `reason`.
- **Mark scan complete** isn't a bulk action. It stays the button shown when the queue is empty.

**Progress bar**

While a bulk action runs, a bar appears under the bulk row (`#queue-bulk-progress`) with a running count, for example `Creating issues… 3 / 8` or `Skipping… 5 / 8`. The bulk controls stay disabled until it finishes. At the end, a message reports how many items succeeded and shows the first error, if any. Failed items stay in the queue.

**API**

The UI processes items one at a time so the progress bar can update after each one:

- **Accept quest:** `POST /create-issue` for each item
- **Skip:** `POST /dismiss` for each item, with `{ queueItemId, reason }`. There's no batch dismiss endpoint.

The fork also adds `POST /create-issues` (`{ queueItemIds: string[], goodFirstIssue?: boolean }`). It creates issues one after another in a single request and returns `{ created: [...], failed: [...] }`. The UI doesn't call it. Both endpoints share `createDocsIssueFromQueueItem` in `src/create-from-queue.ts`.

### 9. Help text

Explains the UI in place, so writers don't need the README open while they triage.

**Descriptions**

- The **Triage queue** heading has a one-line description of what the queue holds and what to do with a card.
- The History tab has a new **Decision history** heading with a count of issues created and items skipped, and a description that points to **Restore**.
- The **Issue suggestion** label on each card says the text becomes the GitHub issue when accepted.

**Tooltips**

| Where | What the tooltip explains |
|-------|---------------------------|
| Tabs and the settings button | What each tab or dialog holds |
| Scan scope | Each summary fact, and what **Run scan** and **Enrich** will do |
| Filter labels | What each filter matches, including Focus and estimates |
| Bulk actions | **Select all**, **Clear selection**, the **Action** choices, and exactly what the apply button will do for the current selection |
| Category headers | The category's team labels, the select-all checkbox, and the count pills |
| Card badges | Assessment and confidence (or the pre-filter rule), release note label, availability, doc work, priority, effort, and **Already tracked**. Estimates say where the guess came from. |
| Card actions | **Accept**, each skip reason, **good first issue**, and the target repo |
| Skipped list and History | **Restore**, decision icons, scan dates, and versions |

**How it works**

- Any element with a `data-tip` attribute gets the tooltip. `tipAttr()` in `src/public/app.js` builds the escaped attribute.
- One shared element (`#ui-tooltip`, `role="tooltip"`) appears below the control, or above it near the bottom of the window. It stays inside the window and its arrow points at the control.
- It shows after a short hover delay or on keyboard focus, and hides on Escape, scroll, or click. While it's shown, the focused control gets `aria-describedby`.
- Labels with a tooltip have a dotted underline. Disabled buttons sit in a `.tip-wrap` wrapper so their tooltip still appears.
- This replaces the browser `title` attributes on badges and buttons.

### 10. Related fork changes

These came from the same triage work and are in the fork. They're listed for context and aren't described in detail here.

- Alerting v1/v2 queue repair (`fixAlertingQueue`)
- Security - Cases vs One Workflow category repair (`resolveSecurityCasesCategoryFromLabels`, `fixSecurityCasesQueueItem`)
- `excludeLabels` and `excludeTitlePatterns` config
- Retry on GitHub Search API rate limits

---

## Why upstream

- Writers can triage by release and team without forking scan logic.
- API reference work gets its own view, and internal routes stay out of it until they're public.
- Priority puts breaking changes and features first, and enrichment can override the estimate.
- Focus options cut down on config edits each release.
- The merge date filter answers "what landed recently" and "what's new since my last scan" without relying on version labels.
- Bulk actions remove repetitive clicks after enrichment. The progress bar shows how a long run is going when GitHub calls are slow (SSO, rate limits, meta-issue linking).
- The new skip reasons record why an item was skipped, which keeps history useful.
- The labeled controls panel, compact scan scope, and one-line filter row make large queues workable on a laptop screen.
- **Run scan** and **Enrich** mean writers don't have to remember commands to refresh or enrich the queue.
- Tooltips and short descriptions explain badges, filters, and actions where they appear, which helps writers who are new to the tool.

## Merge notes

- **Docs:** The fork's `README.md` and `templates/skill.md.template` already describe these changes. Take them with the code, minus the README's **Fork enhancements** section. Then run `./scripts/setup.sh` to reinstall the skill.
- **Backward compatibility:** Default `autoFocusStackReleases` to `false` and leave `defaultQueueFilters` unset.
- **Decisions for upstream:**
  - When both `focusStackReleases` and `autoFocusStackReleases` are set, which wins? The fork lets auto win.
  - Keep `POST /create-issues`? The UI no longer calls it.
  - Should **Enrich** keep handing off a prompt, or launch Claude Code from the server? The fork hands off a prompt, because a page that starts an agent with write access needs protection against cross-site requests.

## Test plan

1. **Default filters:** In a fresh session with `defaultQueueFilters` set, the toolbar starts with those values. After you change a filter, your choice persists for the session.
2. **Stack focus:** With `v9.6.x` and `v9.7.x` items in the queue, auto focus picks up to the two newest minors, and Focus filters to them.
3. **Category focus:** Categories in `focusCategories` show ★ and appear under Focus. The filter also matches `alsoAppliesTo`.
4. **Merged:** 7, 30, and 90-day counts match the latest `mergedAt`. **Since last scan** uses `filterMeta.lastScanAt`. Custom From and To are inclusive, and **Clear range** resets them (`test/queue-merge-filter.test.ts`).
5. **API reference only:** A public server route with an enriched `/docs/api/` gap shows **API ref** and matches the filter.
6. **Internal routes:** A PR with `access: 'internal'` gets no API ref estimate, and review-only internal gaps don't match the filter (`test/doc-surface.test.ts`).
7. **Priority:** A breaking change with `needsDocs: "yes"` is estimated P0. An enriched `triagePriority` shows on the card and is set on the created issue (`test/triage-priority.test.ts`).
8. **Layout:** The panel shows three labeled rows, and stacks them under 720px. The categories table opens, closes, and remembers its state. The filter row stays on one line and scrolls horizontally. **Reset** sets all six filters to All.
9. **Skip reasons:** Each card has five skip buttons. Each stores its exact `reason`, which shows in History and in the Skipped list (`test/skip-options.test.ts`).
10. **Bulk accept:** Filter to one category, click **Select all**, and apply **Accept quest**. The progress bar advances per item. Failed items stay in the queue, and successes are recorded in history.
11. **Bulk skip:** Select items, apply any skip reason, and confirm. The progress bar advances, and history shows the `reason`. The apply button is disabled when nothing is selected.
12. **Run scan:** The page shows a scanning message, then a toast with new and total counts. Edits and enrichment survive. A second `POST /scan` during a scan returns `409`.
13. **Enrich:** With unenriched items, the button and the dialog's prompt show the same count. With none, the button reads **All items enriched** and is disabled.
14. **Help text:** Hover over or tab to a filter label, badge, or button. The tooltip appears below it (above it near the bottom of the window), stays inside the window, and hides on Escape or scroll. With nothing selected, the disabled apply button's tooltip says to select an item first.
15. **Regression:** `fixAlertingQueue`, excludes, other `GET /queue` consumers, the enrichment merge script, and single-card `POST /create-issue` behave as before.

## Fork commits

| Commit | Changes |
|--------|---------|
| `42070fe` | Alerting v1/v2 queue repair, `excludeLabels` / `excludeTitlePatterns`, GitHub search retry |
| `76cfb38` | Assessment, stack release, and doc work filters; `docWorkKind` and `docSurface`; skill 3.15.0 |
| `3c34d45` | `autoFocusStackReleases`; first version of this document |
| `0d460da` | Category and priority filters, internal-route `docSurface`, collapsible scan scope, toolbar layout, `triagePriority` |
| `45fb090` | Sample `data/enrichments-batch-*.json` files for split enrichment |
| `770d604` | Bulk issue creation, category and priority filter fixes, `create-from-queue` refactor |
| `e847654` | Security - Cases vs One Workflow category repair |
| `c5c62a0` | Merged filter, compact toolbar, two new skip reasons |
| `a1b0b7b` | Bulk action dropdown (accept and skip), README update |
| `873325e` | Bulk progress bar; UI creates issues one request at a time |
| `82ba988` | **Run scan** and **Enrich** buttons, scan scope table, controls panel layout, filter **Reset**, bulk bar labels |

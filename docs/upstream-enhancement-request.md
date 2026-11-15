# Enhancement request — queue filters, enrichment, and triage UI (for upstream)

**Author:** Nastasha Solomon  
**Fork / branch:** https://github.com/nastasha-solomon/docs-quest-scanner (`main`)  
**Upstream:** https://github.com/florent-leborgne/docs-quest-scanner  

**Commits of note (fork `main`):**

| Commit | What |
|--------|------|
| `42070fe` | Alerting v1/v2 queue repair, `excludeLabels` / `excludeTitlePatterns`, GitHub search retry |
| `76cfb38` | Assessment / stack / doc-work filters, `docWorkKind` + `docSurface`, skill **3.15.0** |
| `3c34d45` | `autoFocusStackReleases`, this upstream doc (initial) |
| `0d460da` | Category + priority filters, internal-route `docSurface`, collapsible scan scope, toolbar layout, `triagePriority` |
| `45fb090` | Sample `data/enrichments-batch-*.json` for split enrichment merge workflow |
| `770d604` | Bulk create, category/priority filter fixes, `create-from-queue` refactor |
| `e847654` | Security - Cases vs One Workflow category repair |
| `c5c62a0` | **Merged** date filter, compact filter toolbar, extra skip reasons (`release notes only`, `not my area`) |
| `a1b0b7b` | **Bulk action** dropdown (accept + skip reasons), README triage UI refresh |
| `873325e` | Bulk **progress bar** on accept/skip; UI uses sequential `POST /create-issue` |

---

## Summary

For Security / Alerting / Observability triage, the post-scan queue is large. Writers need to narrow it by **stack minor**, **merge date**, **team category**, **assessment**, **doc work type** (including **API reference only**), and **priority**—without mis-tagging internal server routes as public API work.

This proposal adds:

- **Combinable queue filters** (persisted in `sessionStorage`, optional session defaults from config).
- **Transient classification on `GET /queue`** (`docWorkKind`, `docSurface`, `triagePriorityLevel`, stack minors).
- **Enrichment fields and skill guidance** so filters stay accurate after AI triage.
- **Review UI** improvements: collapsible scan-label strip, grouped filter controls, card badges, priority sort within categories.
- **Bulk actions** — select filtered queue rows and **Apply** accept or skip in one pass (same `reason` values as per-card buttons).
- **Bulk progress bar** — while accept or skip runs, a full-width bar under the bulk row shows per-item progress (`Creating issues… 3 / 8`, `Skipping… 5 / 8`) and disables bulk controls until the run finishes (see §7).
- **Merged date filter** — client-side window on latest PR merge (`mergedAt`), orthogonal to stack minor / version labels.
- **Additional skip reasons** on triage cards for release-note-only scope and out-of-area items (same history shape as existing dismiss actions).

Related fork work (unchanged here): Alerting queue repair, scan excludes, search retry, Security Cases category repair.

---

## Typical weekly triage slice

Filters compose in any order; a common Security / Alerting pass:

1. **Stack release** — Focus (auto or config), e.g. 9.7 + 9.6  
2. **Category** — Focus (`focusCategories`), e.g. Alerting v2 + Detection Engine  
3. **Assessment** — Needs docs + Check  
4. **Merged** — Last 30 days or **Since last scan** when catching up after enrichment  
5. **Doc work** — API reference only (when doing an API pass; not defaulted)  
6. **Priority** — P0 + P1 (enriched `triagePriority` or release-note heuristics)

Example config defaults (applied once per browser tab when filter `sessionStorage` keys are unset):

```json
"autoFocusStackReleases": true,
"focusCategories": [
  "Kibana - Alerting v2",
  "Security - Detection Engine"
],
"defaultQueueFilters": {
  "assessment": "yes,check",
  "version": "focus",
  "category": "focus",
  "priority": "p0,p1"
}
```

---

## Proposed behavior

### 1. Review UI filters (combinable, `sessionStorage`)

| Filter | Purpose |
|--------|---------|
| **Assessment** | All / needs docs / check / no / needs docs + check |
| **Stack release** | All / **Focus** (newest 1–2 minors or `focusStackReleases`) / single minor (`v9.6.0` → **9.6**) |
| **Merged** | All dates / **Last 7 / 30 / 90 days** / **Since last scan** / **Custom range** (From / To) |
| **Doc work** | New / update / **API reference only** / not classified |
| **Category** | All / **Focus** (`focusCategories`) / one category (matches `category` or `alsoAppliesTo`) |
| **Priority** | All / P0+P1 / P0–P3 / unrated |

- **Showing X of Y items** when any filter is active.
- **★** in dropdowns marks entries in `focusStackReleases` or `focusCategories`.
- **Default filters:** `defaultQueueFilters` in `data/config.json` — only applied when the user has not yet set that filter in `sessionStorage` this session.
- **Sort:** Within each category group, cards sort by `triagePriorityLevel` (P0 first), then confidence.

#### Merged date filter (client-side)

- **Purpose:** Narrow by **when PRs merged**, independent of **stack release** (version labels on the PR).
- **Date rule:** For grouped queue items, use the **latest** `mergedAt` among PRs in the item (same rule as serverless week estimates).
- **Presets:** `7d`, `30d`, `90d` (rolling from “now”); **Since last scan** uses `filterMeta.lastScanAt` (`queue.scannedAt` or `lastRun.lastRunDate` on `GET /queue`).
- **Custom:** Optional **From** / **To** calendar fields (inclusive local days); open-ended if only one bound is set. Selecting **Custom range…** reveals a second row; **Clear range** resets dates.
- **Counts:** Dropdown options show how many queue items match each preset (full queue, not other filters).
- **Persistence:** `sessionStorage` keys `queue-merge-filter`, `queue-merge-from`, `queue-merge-to`; optional defaults via `defaultQueueFilters.mergeRange`, `mergeFrom`, `mergeTo`.
- **Implementation:** `src/public/queue-merge-filter.js` (shared logic, unit-tested); filter step in `applyQueueFilters()` after assessment and stack release.
- **Items without `mergedAt`:** Excluded when any merge preset is active (not when **All dates**).
- **Does not change scanning** — only filters the loaded queue (unlike `maxMergeAgeMonths` on scan).

#### Filter toolbar layout

Each control is a **label + select** in one bordered pill (`.queue-filter-field`). The filter row stays on **one line** with horizontal scroll on narrow viewports (`flex-wrap: nowrap`). Selects use content-sized width (`field-sizing: content` where supported). Main content uses tighter horizontal padding (`.app-container`) so more of the queue fits on screen.

### 2. Config: release and category focus

**Stack — manual (optional):**

```json
"focusStackReleases": ["9.6", "9.7"]
```

**Stack — automatic (optional):**

```json
"autoFocusStackReleases": true
```

On each queue load, auto focus = **newest one or two majors.minor present in the queue** (from PR version labels). UI: **Focus: 9.7, 9.6 (auto)**. When `autoFocusStackReleases` is true, manual `focusStackReleases` is ignored. Patches map to major.minor only (`v9.6.1` → `9.6`). No calendar integration.

**Category focus (optional):**

```json
"focusCategories": ["Kibana - Alerting v2", "Security - Detection Engine"]
```

Adds **Focus: … (config)** in the Category filter. Does not affect scanning or category assignment—triage convenience only.

### 3. Scan scope bar (collapsible)

The strip above the queue that lists source repo, team labels, release-note filter labels, and scan date range is **collapsed by default** inside a `<details>` element:

- **Summary:** `Scan scope: elastic/kibana · {date range} · N labels` + “Show scan labels”
- **Expanded:** Team labels and release-note labels in labeled rows  
- Open/closed state persisted in `sessionStorage` (`scan-context-open`)

Reduces visual noise when the configured label list is long.

### 4. Server-side fields on `GET /queue` (transient, not persisted)

| Field | Source |
|-------|--------|
| `stackMinors` | PR version labels per item |
| `docWorkKind` / `docWorkKindSource` | `effortTag`, `docsGap.actionType`, release-note heuristics (`src/doc-work-kind.ts`) |
| `docSurface` / `docSurfaceSource` | API-only vs guides vs mixed (`src/doc-surface.ts`) |
| `triagePriorityLevel` / `triagePriorityLabel` / `triagePrioritySource` | `assessment.triagePriority` or `deriveTriagePriority` (`src/triage-priority.ts`) |
| `filterMeta.focusStackReleases` / `focusAuto` | Manual or auto stack focus |
| `filterMeta.focusCategories` | From config |
| `filterMeta.lastScanAt` | Anchor for **Since last scan** merge filter |

**Doc work “API reference only” filter** matches `docSurface === 'api-only'` and doc work update/unknown (not net-new guides only).

#### `docSurface` — avoid false “API reference only” on internal routes

The **API reference only** filter and dashed **API ref (estimate)** badge must not fire on server work that changes HTTP paths but is **not** on the public OpenAPI surface yet.

`deriveDocSurface`:

1. **Heuristic (pre-enrichment):** No `api-only` when the PR text has `access: 'internal'`, “not public yet”, “routes are internal”, “internal for now” — even if the body mentions `POST /api/...` and files are `server/`-only.
2. **Enriched:** When every `docsGap` entry is `review-only` and gap text cites internal / not public / **no action now** / absent from public API reference → `docSurface: unknown`. Legacy operation URLs in gaps are context only.

**Example:** [elastic/kibana#291814](https://github.com/elastic/kibana/pull/291814) (internal write path) vs public OpenAPI follow-up [#294886](https://github.com/elastic/kibana/pull/294886).

#### `triagePriority`

| Source | Behavior |
|--------|----------|
| **Enriched** | `assessment.triagePriority` — exact GitHub Projects Priority string (e.g. `P1: High`) |
| **Heuristic** | From `release_note:*` + `needsDocs` + `effortTag` → P0–P3; card badge shows level with dashed **(estimate)** |
| **None** | `needsDocs: no` with no gaps → unrated for priority filter |

On **Create issue**, project **Priority** = `triagePriority` → heuristic label → `project.defaultPriority`.

### 5. Skill enrichment (template **3.15.0+**)

**Filters (agents):** Document Assessment, Stack release (`autoFocusStackReleases` / `focusStackReleases`), **Merged** (presets / since last scan / custom), Doc work, Category (`focusCategories`), Priority (`triagePriority`).

**`docsGap` / API reference:**

- Public routes: OpenAPI operation URLs and “API reference” phrasing for **API reference only** filter.
- Internal routes: `actionType: review-only`, gap text states internal / not in public OpenAPI → `docSurface` stays `unknown`.

**`triagePriority` (optional on assessment):** Set when severity is clear — e.g. P0/P1 for breaking or major feature gaps with `needsDocs: yes`; omit for `needsDocs: "no"`. Use the same strings as the target GitHub Project.

**Merge workflow:** Enrichment batches can be split (e.g. `data/enrichments-batch-a.json`) and merged with `scripts/merge-enrichments.mjs`, which accepts `triagePriority` alongside other assessment fields.

**Internal vs public API:** Step 2a early exit only for purely internal server refactors; public `/api/...` still gets API reference analysis even when `needsDocs: "no"` (OpenAPI-codegen cases).

### 6. Card header badges (UI)

Existing assessment + release-note chips, plus:

- **API ref** / **New content** / **Update existing** — from `docWorkKind` / `docSurface` (dashed when heuristic).
- **P0–P3** — from `triagePriorityLevel` (dashed when heuristic).
- Effort tag badge unchanged when `effortTag` is set.

### 7. Bulk actions

When a category slice is ready (for example after filters + enrichment), writers can act on many queue items without opening each card.

**UI**

- Checkbox on each triage card; **Select all** checkbox on each category header (visible items only).
- Bar below filters: **Select visible** (current filter results), **Bulk action** (same pill style as other queue filters), **Apply**, **Clear**.
- **Bulk progress bar** (`#queue-bulk-progress`): Shown only while **Apply** is running. Full-width track under the bulk control row; label shows verb + `completed / total` (e.g. `Creating issues… 3 / 8`, `Skipping… 5 / 8`). **Select visible**, **Bulk action**, **Apply**, and **Clear** stay disabled until the run ends. The review UI calls `POST /create-issue` or `POST /dismiss` once per selected item so the bar can advance after each round trip (see **API**).
- **Apply** is disabled until at least one item is selected.
- **Bulk action** dropdown options (each applies to all selected items):

| Bulk action | Effect |
|-------------|--------|
| Accept quest | Create GitHub issues (see **API** below) |
| Skip – no docs | Dismiss with `no docs needed` |
| Skip – already tracked | Dismiss with `already tracked` |
| Skip – owned by dev | Dismiss with `owned by dev` |
| Skip – release notes only | Dismiss with `release notes only` |
| Skip – not my area | Dismiss with `not my area` |

- **Accept quest:** confirmation dialog lists a sample of titles. **Good first issue** is not bulk-applied (per-card checkbox still applies to single create).
- **Skip – …:** confirmation dialog lists titles and the chosen `reason` (same strings as §8).
- **Mark scan complete** is intentionally **not** in the bulk dropdown — it remains the empty-queue control only.

**API**

- **Accept quest (review UI):** `POST /create-issue` once per selected `queueItemId` so the progress bar can update after each success or failure. **Batch API:** `POST /create-issues` with `{ queueItemIds: string[], goodFirstIssue?: boolean }` still processes items **sequentially** in one request and returns `{ created: [...], failed: [...] }`. Each success uses `createDocsIssueFromQueueItem` in `src/create-from-queue.ts`.
- **Skip – …:** client calls `POST /dismiss` once per selected `queueItemId` with `{ queueItemId, reason }` (sequential; failures collected like bulk create). No batch dismiss endpoint in the fork.

### 8. Skip / dismiss reasons (triage card actions)

Each **Skip** button calls `POST /dismiss` with a `reason` string; the item is removed from the queue and appended to `data/history.json` with `decision: "dismissed"`.

| UI label | `reason` stored in history |
|----------|---------------------------|
| Skip – no docs | `no docs needed` |
| Skip – already tracked | `already tracked` |
| Skip – owned by dev | `owned by dev` |
| Skip – release notes only | `release notes only` |
| Skip – not my area | `not my area` |

**UI surfaces:** **History** tab (per-row `reason`, grouped by `session`); **Queue** tab **Skipped** collapsible (dismissals since current `queue.scannedAt`) with **Restore** (`POST /undo-dismiss`). No new API fields—only additional allowed `reason` values. Auto-dismiss after enrichment may still use suffixed strings (e.g. `no docs needed (auto, …)`).

`test/skip-options.test.ts` asserts all five manual skip buttons are present on each card. The **Bulk action** dropdown (§7) uses the same five skip `reason` values plus **Accept quest**.

### 9. Related fork work (same triage use case)

- Alerting v1/v2 queue repair (`fixAlertingQueue`)
- Security - Cases vs One Workflow (`resolveSecurityCasesCategoryFromLabels`, `fixSecurityCasesQueueItem`)
- Configurable `excludeLabels` / `excludeTitlePatterns`
- GitHub Search API retry on rate limits

---

## Why upstream

- Release- and **team-focused** triage without forking scan logic.
- API-only lane is visible; **internal** route work stays out until public OpenAPI lands.
- **Priority** surfaces breaking/feature work first; writers can still override via enrichment.
- Auto stack focus and **category focus** reduce repetitive config edits each train.
- Collapsible scan scope and clearer filter grouping make large queues usable on laptop-width viewports.
- **Bulk actions** support category-based accept or skip after enrichment without repetitive single-card clicks; a **progress bar** makes multi-item GitHub calls observable on slow runs (SSO, rate limits, meta-issue linking).
- **Merged** filter supports “what landed recently” and “since I last scanned” without conflating merge time with version labels.
- Extra **skip reasons** record writer intent in history for slice hygiene (release-note-only, not my area).

---

## Suggested merge notes

- README: document all filter keys, `focusStackReleases`, `autoFocusStackReleases`, `focusCategories`, `defaultQueueFilters` (including optional `mergeRange`, `mergeFrom`, `mergeTo`), manual skip `reason` values, **bulk actions** (accept + skip), and the bulk **progress bar**.
- Skill **Skip reasons** and **Queue filters** sections: list `release notes only` and `not my area`; document **Merged** filter, bulk **Bulk action** + **Apply** bar, and per-item progress during bulk runs.
- Default `autoFocusStackReleases: false` and omit `defaultQueueFilters` for backward compatibility.
- Policy choice: whether manual `focusStackReleases` should override auto when both are set (fork: auto wins).
- Install / bump skill from `templates/skill.md.template` after merge (`./scripts/setup.sh`).

---

## Test plan

1. **Stack:** Queue with `v9.6.x` and `v9.7.x` — auto focus shows up to two newest minors; Focus filter matches.
2. **Category:** `focusCategories` — Focus option and ★ on named categories; filter includes `alsoAppliesTo`.
3. **Assessment + defaults:** Fresh session with `defaultQueueFilters` — toolbar matches config once; `sessionStorage` overrides thereafter.
4. **Doc work:** Public server route + enriched `/docs/api/` gap → **API ref** + **API reference only** filter.
5. **Internal routes:** `access: 'internal'` — no API ref estimate; review-only internal gaps → not in API-only filter (`test/doc-surface.test.ts`).
6. **Priority:** Breaking + `needsDocs: yes` → P0 heuristic; enriched `triagePriority` on card and on issue create (`test/triage-priority.test.ts`).
7. **UI:** Scan scope collapses/expands and remembers state; filter row stays on one line with horizontal scroll; **Bulk action** uses the same `.queue-filter-field` pill as other filters.
8. **Bulk actions:** Filter to one category → Select visible → **Accept quest** — progress bar advances item by item; partial create failures leave failed rows in queue; history records successes. **Skip – not my area** (or any skip) — confirm, dismiss all selected with progress; history rows show `reason`; **Apply** disabled with zero selection.
9. **Merged:** Presets 7d / 30d / 90d match latest-`mergedAt` counts; **Since last scan** uses `filterMeta.lastScanAt`; custom From/To inclusive; custom row clears with **Clear range** (`test/queue-merge-filter.test.ts`).
10. **Skip reasons:** Card shows five skip buttons; dismiss stores exact `reason`; History and Skipped list display it; `test/skip-options.test.ts`.
11. **Regression:** `fixAlertingQueue`, excludes, `GET /queue` consumers, existing enrichment merge script, single `POST /create-issue` unchanged behavior.
# Enhancement request — queue filters & release focus (for upstream)

**Author:** Nastasha Solomon  
**Fork / branch:** https://github.com/nastasha-solomon/docs-quest-scanner (`main`)  
**Upstream:** https://github.com/florent-leborgne/docs-quest-scanner  
**Commits of note:** `42070fe` (alerting routing, excludes, search retry), `76cfb38` (queue filters + API surface + skill 3.15.0), `3c34d45` (`autoFocusStackReleases`), plus fork `doc-surface` rules for internal routes (heuristic + enriched `review-only` gaps)

---

## Summary

For Security / Alerting / Observability triage, the post-scan queue is large. Writers need to narrow it to **the current stack minor**, **assessment** (needs docs vs check), and **type of doc work**—including **REST/OpenAPI reference** changes that were previously skipped or mixed with narrative guides.

This proposal adds **review UI filters**, **derived classification on queue load**, optional **auto focus minors**, and **skill guidance** so enrichment populates fields the filters rely on.

---

## Proposed behavior

### 1. Review UI filters (combinable, `sessionStorage`)

| Filter | Purpose |
|--------|---------|
| **Assessment** | All / needs docs / check / no / needs docs + check |
| **Stack release** | By major.minor from PR version labels (`v9.6.0` → `9.6`) |
| **Doc work** | New content / update existing / **API reference only** / not classified |
| **Category** | All / **Focus** (`focusCategories`) / single category (includes `alsoAppliesTo`) |
| **Priority** | All / P0+P1 / P0–P3 / unrated (`triagePriority` or release-note heuristics) |

“Showing X of Y items” when any filter is active. Optional `defaultQueueFilters` applies once per session when filter `sessionStorage` keys are unset.

### 2. Config: release focus

**Manual (optional):**

```json
"focusStackReleases": ["9.6", "9.7"]
```

Adds a **Focus: … (config)** shortcut and ★ next to those minors in the dropdown. Does not affect scanning.

**Automatic (optional):**

```json
"autoFocusStackReleases": true
```

On each queue load, focus minors = **the newest one or two minors present in the current queue** (derived from version labels, newest first). UI label: **Focus: 9.7, 9.6 (auto)**.

- **No calendar integration** — when `v9.7.x` PRs first appear in the queue, 9.7 enters focus automatically; until then focus stays on 9.6.
- **Patch releases** — `v9.6.0` and `v9.6.1` both map to **9.6** (major.minor only).
- When `autoFocusStackReleases` is true, the manual `focusStackReleases` list is not used (auto wins).
- Individual minors still always appear in the dropdown from queue data; focus is convenience only.

### 3. Server-side fields on `GET /queue` (transient)

| Field | Source |
|-------|--------|
| `stackMinors` | PR version labels per item |
| `docWorkKind` / `docWorkKindSource` | `effortTag`, `docsGap.actionType`, release-note heuristics |
| `docSurface` / `docSurfaceSource` | API-only vs guides vs mixed (`/docs/api/` URLs, gap text, route heuristics) |
| `filterMeta.focusStackReleases` | Manual or auto focus list |
| `filterMeta.focusAuto` | Whether focus was auto-derived |

**`docSurface` — avoid false “API reference only” on internal routes**

The **API reference only** filter and the dashed **API ref (estimate)** badge must not fire on Kibana server work that adds or changes HTTP paths but is **not** part of the public OpenAPI surface yet.

On queue load, `deriveDocSurface` (`src/doc-surface.ts`) should:

1. **Heuristic (pre-enrichment):** Do not classify as `api-only` when the PR text indicates internal routes — e.g. `access: 'internal'`, “not public yet”, “routes are internal”, “internal for now” — even if the body mentions `POST /api/...` and changed files are under `server/` only.
2. **Enriched (post-enrichment):** When every `docsGap` entry is `review-only` and the gap text says the routes are internal, not public, or **no action now** (including “absent from the public API reference”), return `docSurface: unknown` instead of `api-only`. Enrichment may still link a **legacy** public operation URL for context (e.g. the old “add comment” operation); that alone must not drive the API-only lane.

**Motivating example (Security triage):** [elastic/kibana#291814](https://github.com/elastic/kibana/pull/291814) (unified attachments write path, internal at merge) was showing **API ref (estimate)** while enrichment correctly said `needsDocs: no` — writers should wait for the public flip (e.g. [#294886](https://github.com/elastic/kibana/pull/294886)) before treating the item as API reference work.

### 4. Skill enrichment (template **3.15.0**)

- Replace blunt “API-only early exit” with: exit only for **internal** server refactors; run **API reference analysis** for public `/api/...` changes.
- Document `docsGap` with OpenAPI operation URLs and “API reference” phrasing for the **API reference only** filter. For **internal** routes, use `actionType: review-only` and gap text that states routes are internal / not in public OpenAPI — so queue `docSurface` stays `unknown` and does not pollute the API-only filter.
- Note queue toolbar filters and `autoFocusStackReleases` / `focusStackReleases` for agents.
- Align enrichment wording with `docSurface` heuristics above so server-only PRs with `/api/` in the description but `access: 'internal'` do not look like API reference tickets in the UI.

### 5. Related fork work (same triage use case)

Already on fork: Alerting v1/v2 queue repair, configurable `excludeLabels` / `excludeTitlePatterns`, GitHub Search API retry.

---

## Why upstream

- Release-focused triage without forking scan logic.
- API-only PRs get a visible lane instead of “no docs” or narrative noise; internal route work stays out of that lane until public OpenAPI lands.
- Auto focus removes a recurring manual config edit when the train advances—while staying honest (data-driven from queued PRs only).

---

## Suggested merge notes

- Document `focusStackReleases`, `autoFocusStackReleases`, and filters in README.
- Consider default `autoFocusStackReleases: false` for backward compatibility.
- Optional: `autoFocusStackReleases` + non-empty manual list = manual overrides auto (policy choice).

---

## Test plan

1. Queue with `v9.6.x` and `v9.7.x` labels — auto focus shows up to two newest minors.
2. Filters: **Focus (auto)** + **Needs docs + Check** + **API reference only**.
3. Enrich a **public** server-only route PR — `docsGap` with `/docs/api/` URL → **API ref** badge and **API reference only** filter match.
4. Internal route PR (body: `access: 'internal'` or “not public yet”, server paths only) — before enrichment: no **API ref (estimate)**; after enrichment with review-only internal gaps: `docSurface: unknown`, not in **API reference only**.
5. Regression: `fixAlertingQueue`, exclude rules, existing queue API consumers; unit tests in `test/doc-surface.test.ts` for internal heuristic and review-only gaps.
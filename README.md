# Docs Quest Scanner

A documentation triage tool that scans merged GitHub PRs, assesses their documentation impact with AI, and helps you create doc issues through a review UI.

Built for use with [Claude Code](https://docs.anthropic.com/en/docs/claude-code) as a skill — the AI handles PR analysis, doc gap detection, and issue drafting, while you review and decide in a local web UI.

## What it does

1. **Scans** merged PRs from a configured repo, filtered by team labels and release note labels
2. **Checks** whether each PR is already tracked by an existing docs issue (via GitHub cross-reference events — no extra API calls)
3. **Enriches** each PR with AI-powered analysis: summary, docs gap detection, effort estimate, existing page comparison
4. **Presents** a review UI where you triage items: accept (create issue) or skip — already-tracked PRs are clearly flagged
5. **Creates** GitHub issues with structured bodies, optionally adds them to a meta tracking issue, and sets GitHub Project board fields automatically

## Quick start

```bash
git clone https://github.com/florent-leborgne/docs-quest-scanner.git
cd docs-quest-scanner
./scripts/setup.sh
```

The setup script will:
- Install dependencies
- Configure your GitHub token
- Create a local `data/config.json` from defaults
- Install the Claude Code skill

Then edit `data/config.json` for your team (see [Configuration](#configuration) below), and run `/docs-quest-scanner` in Claude Code.

## Requirements

- Node.js 18+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
- A GitHub token with the right scopes (see below)

### GitHub authentication

The recommended approach is to use the [GitHub CLI](https://cli.github.com/) (`gh`). The setup script will automatically pick up your token from it.

```bash
# Install gh if needed: https://cli.github.com/
gh auth login

# Add the project scope (needed for board integration)
gh auth refresh -s project
```

This gives you a token with `repo`, `read:org`, and `project` scopes — everything the tool needs.

Alternatively, you can create a [personal access token](https://github.com/settings/tokens) manually with those scopes and paste it during setup.

## Configuration

Edit `data/config.json` after setup. Key settings:

| Setting | Description | Example |
|---------|-------------|---------|
| `title` | Display name in the UI header | `"My Team Triage"` |
| `sourceRepo` | Repo to scan for PRs | `{ "owner": "my-org", "repo": "my-repo" }` |
| `targetRepo` | Repo where doc issues are created | `{ "owner": "my-org", "repo": "docs" }` |
| `categories` | Team labels to monitor, grouped by doc area | See below |
| `releaseNoteLabels` | Exact PR labels or trailing-wildcard patterns that qualify for triage | `["release_note:*"]` |
| `issueLabels` | Labels added to created issues | `["Team:Docs"]` |
| `metaIssues` | Named release-checklist patterns, referenced by name | See below |
| `project` | GitHub Project board integration | See below |
| `excludeLabels` | PR labels to drop from every scan. Exact match, or a trailing `*` like release note labels. | `["Feature:Synthetics"]` |
| `excludeTitlePatterns` | Regexes; PRs whose titles match are dropped from every scan | `["^\\[Synthetics\\]"]` |
| `focusStackReleases` | Minors for the **Focus** option in the Stack release filter | `["9.6", "9.7"]` |
| `autoFocusStackReleases` | Use the newest one or two minors in the queue for **Focus** instead of `focusStackReleases` | `true` |
| `focusCategories` | Categories for the **Focus** option in the Category filter (marked ★) | `["Security - Detection Engine"]` |
| `defaultQueueFilters` | Starting filter values for a new browser session | See [Queue filters](#queue-filters) |

To scan more than one source repo in a single run, use the `repos[]` array (see [Multiple source repositories](#multiple-source-repositories)); the top-level `sourceRepo`/`targetRepo`/`categories` form is the single-repo shorthand.

The default release note filter includes `release_note:breaking`, `release_note:deprecation`, `release_note:feature`, and `release_note:enhancement`. Configure `release_note:*` to include every current and future release note category, including `release_note:fix` and `release_note:skip`. You can combine exact labels and trailing-wildcard patterns.

### Categories

A category groups one or more source labels and declares its project Area and created-issue feature label:

```json
{
  "categories": [
    {
      "name": "Discover",
      "labels": ["Team:dataDiscovery"],
      "area": "Kib: Core Analytics",
      "featureLabel": "Feature: Discover"
    },
    {
      "name": "Dashboards and Visualizations",
      "labels": ["Team:Presentation", "Team:Visualizations"],
      "area": "Kib: Core Analytics",
      "featureLabel": "Feature: Dashboards",
      "featureLabelByLabel": { "Team:Visualizations": "Feature: Visualizations" }
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `name` | Doc area name (the category) |
| `labels` | One or more team/feature labels; a PR matching **any** lands in this category |
| `area` | Area field value on the project board. Overrides `project.defaultArea`. |
| `areaByLabel` | Optional per-source-label Area override. A matching label wins over `area`. |
| `featureLabel` | GitHub label added to issues created for this category. |
| `featureLabelByLabel` | Optional per-source-label issue-label override. A matching label wins over `featureLabel`. |
| `feature` / `featureByLabel` | Optional legacy mapping for projects that still use a Feature field. |
| `metaIssue` | Name of a meta-issue pattern (see below) to link into. Overrides the group default; `null` opts the category out. |
| `metaIssueHeading` | Heading to match in the meta issue body (defaults to `name`) |
| `maxMergeAgeMonths` | How far before the last scan date the late-label catch may reach, in months. Falls back to the group value. Set to `0` when adding new labels, so the first scan doesn't drag in months of already-merged PRs. |
| `target` / `project` | Optional per-category overrides of the group's target repo / project |

A category can list several source labels and still route to one meta issue. Use the `ByLabel` mappings when those source labels require different project Areas or feature labels.

### Meta issues

When you accept a quest, the tool can add a link to the created issue inside a release checklist ("meta issue") in your target repo. Define your checklists once as **named patterns** in a top-level `metaIssues` registry, where `{version}` is replaced with the major.minor version (e.g. `9.5`):

```json
{
  "metaIssues": {
    "kibana": "Kibana {version}",
    "observability": "Observability {version}",
    "security": "Security {version}"
  }
}
```

Then **reference a pattern by name**. A repo group sets a default that all its categories inherit; a category can override it:

```json
{
  "repos": [{
    "metaIssue": "kibana",
    "categories": [
      { "name": "Dashboards", "labels": ["Team:Presentation"] },
      { "name": "Observability UI", "labels": ["Team:obs-ux-management"], "metaIssue": "observability" },
      { "name": "Internal only", "labels": ["Team:internal"], "metaIssue": null }
    ]
  }]
}
```

- A category inherits the group's `metaIssue` unless it sets its own.
- `"metaIssue": null` opts a category out of meta-issue linking.
- This is how one scan routes issues into the right solution checklist automatically, without manual moves.

Per-category settings are edited in `config.json` (the Settings dialog surfaces them read-only beneath each category row).

#### Meta issues in another repo

A registry entry can be an object instead of a string, so a checklist can live outside the target repo. Use this when issues are filed in a public docs repo but tracked in a private planning one:

```json
{
  "metaIssues": {
    "kib-core-analytics": {
      "titlePattern": "[Q{quarter} FY{fy}] [Kib] Core analytics docs",
      "owner": "elastic",
      "repo": "docs-content-internal"
    }
  }
}
```

`owner` and `repo` both default to the group's target repo, so the string form stays shorthand for "same repo".

#### Quarterly checklists

Some trackers are named by fiscal quarter rather than by release. Add a `quarterCalendar` and use the `{quarter}` and `{fy}` placeholders:

```json
{
  "quarterCalendar": {
    "anchor": { "version": "9.6", "fiscalQuarter": 2, "fiscalYear": 27 },
    "minorsPerQuarter": 1
  }
}
```

One anchor covers every future quarter. Elastic's fiscal year starts in May and Kibana ships one minor per quarter, so `9.6 = Q2 FY27` yields `9.7 = Q3 FY27`, `9.8 = Q4 FY27`, `9.9 = Q1 FY28`, and onward. Nothing needs editing each quarter.

A major bump is the one thing that can't be extrapolated, because the number of minors before it isn't known in advance. Derivation refuses to guess across a major boundary and logs what to add:

```json
{ "quarterCalendar": { "majorMinorCounts": { "9": 9 } } }
```

That says 9.9 was the last 9.x, so 10.0 is the quarter after it. Set `minorsPerQuarter` if the release cadence ever changes.

When a resolved title matches no open issue, the item is filed normally and the link is skipped with a warning naming the title it looked for — create the tracker or fix the anchor, then re-link. An exact title match always wins over the body-based ranking, so a near-empty quarterly tracker isn't outranked by a fuller sibling.

### Multiple source repositories

A single scan can span several source repos, each with its own labels, target repo, project, and meta issue. Use the `repos[]` array instead of the top-level `sourceRepo`/`targetRepo`/`categories` fields:

```json
{
  "title": "Docs triage",
  "metaIssues": { "kibana": "Kibana {version}", "elasticsearch": "Elasticsearch {version}" },
  "repos": [
    {
      "id": "elastic/kibana",
      "source": { "owner": "elastic", "repo": "kibana" },
      "target": { "owner": "elastic", "repo": "docs-content" },
      "metaIssue": "kibana",
      "project": { "org": "elastic", "number": 1034, "defaultArea": "Kib: Core Analytics" },
      "categories": [
        { "name": "Dashboards", "labels": ["Team:Presentation"], "featureLabel": "Feature: Dashboards" }
      ]
    },
    {
      "id": "elastic/elasticsearch",
      "source": { "owner": "elastic", "repo": "elasticsearch" },
      "target": { "owner": "elastic", "repo": "docs-content" },
      "metaIssue": "elasticsearch",
      "project": { "org": "elastic", "number": 1034 },
      "categories": [
        { "name": "Search", "labels": [":Search Relevance/Search"], "area": "Search" }
      ]
    }
  ]
}
```

Each repo group owns its routing. A scan iterates every group × its categories. The scanner resolves project Area, issue labels, project, and meta issue from the PR's source repo and labels. The **target repo** remains a per-issue dropdown choice that defaults to the group's `target`.

Per-group fields:

| Field | Description | Default |
|-------|-------------|---------|
| `id` | Stable identifier (used internally to route issues) | `"<source.owner>/<source.repo>"` |
| `label` | Optional display name | `id` |
| `source` / `target` | Source repo scanned / target repo for issues | required |
| `categories` | Team labels for this repo. Each category may override `metaIssue`, `target`, and `project` for itself (falling back to the group). | required |
| `metaIssue` | Default meta-issue **pattern name** (from the top-level `metaIssues` registry) for this group's categories | — |
| `project`, `issueLabels` | Same shape as the global fields, scoped to this group | — |
| `versionLabelPattern`, `releaseNoteLabels`, `maxMergeAgeMonths` | Per-group overrides | global defaults |
| `crossRefRepos` | Repos checked for existing docs issues | `[target, "<target>-internal"]` |
| `productIssuePattern` | Regex to extract the product issue URL from PR bodies | source repo's issues URL |

The legacy flat config (top-level `sourceRepo`/`targetRepo`/`categories`) still works unchanged. The Settings dialog edits `repos[]` configs with a structured form and provides a raw-JSON panel for fields the form doesn't expose, including label-specific overrides and the legacy project Feature mapping.

### GitHub Project integration

Auto-fill project board fields when creating issues:

```json
{
  "project": {
    "org": "my-org",
    "number": 42,
    "defaultArea": "My area",
    "defaultPriority": "P1: High",
    "defaultRequester": "DQS",
    "sizeMap": { "quick-fix": "XS", "update": "S", "new-content": "M" },
    "contentTypeMap": { "quick-fix": "Improvement", "update": "Improvement", "new-content": "Net-new" }
  }
}
```

Fields set automatically: **Release** (from version label), **Size** and **Content Type** (from the effort estimate via `sizeMap` / `contentTypeMap`), **Priority**, **Requester**, **Area** (from `area` / `areaByLabel`, then `defaultArea`), and **Serverless-pub** (computed deploy date). If your project still uses a **Feature** field, configure `feature` / `featureByLabel` on each category.

Your GitHub token needs the `project` scope for this. If using the `gh` CLI:

```bash
gh auth refresh -s project
```

## Usage

In Claude Code, run:

```
/docs-quest-scanner
```

The skill will:
1. Run the scanner to fetch new PRs
2. Enrich each item with deep AI analysis
3. Start the review UI at http://localhost:3847

### Manual commands

```bash
yarn scan          # Scan only (no AI enrichment)
yarn dev           # Start the review UI
yarn start         # Start the UI (no file watching)
yarn deploy        # Sync repo changes to the skill install (~/.claude/skills/docs-quest-scanner)
```

## How the review UI works

### Queue tab

A panel above the queue has three rows: **Scan scope**, **Filters**, and **Bulk actions**. Below it, the **Triage queue** heading shows the item count, and cards are grouped by category.

Hover over (or tab to) a button, badge, filter label, or category name to see what it means or what it will do. Labels with a dotted underline have an explanation.

Each card is a PR that needs triage. It shows the AI summary, availability, the suggested issue body, and badges for doc work type, API reference work, and priority (P0–P3). Dashed badges are estimates that enrichment hasn't confirmed. If the scan found an existing docs issue that references the PR (through GitHub cross-reference events), the card shows a green **Already tracked** badge and a link.

#### Scan scope

Shows what the loaded queue covers: the repo, **Merged since** (the date of your last completed scan), **Last scan run**, and the number of categories. **Show categories and labels** opens a table of each category's team labels and how many queue items it has, followed by the release note labels and any exclusions.

- **Run scan** fetches new PRs, the same as `yarn scan`. Your edits and enrichment are kept. The page is blocked until the scan finishes, and then a message reports how many items are new.
- **Enrich N items** shows how many items haven't been through AI enrichment yet. It opens a prompt to paste into Claude Code, because enrichment runs in the skill, not in the page. Refresh the page when the agent finishes.

The button tooltips show the current **Merged since** date and how many items are waiting.

#### Queue filters

Filters combine, and each choice is kept for the browser session. When any filter is active, the **Triage queue** heading shows "Showing X of Y items." **Reset** sets every filter back to All.

| Filter | Options |
|--------|---------|
| **Assessment** | All, Needs docs, Check, No docs needed, Needs docs + Check |
| **Stack release** | All versions, **Focus** (from `autoFocusStackReleases` or `focusStackReleases`), or one minor such as `9.6` |
| **Merged** | All dates, Last 7 / 30 / 90 days, **Since last scan**, or a custom From/To range. Uses the latest merge date among the item's PRs. |
| **Doc work** | All, New content, Update existing, **API reference only**, Not classified yet |
| **Category** | All categories, **Focus** (from `focusCategories`), or one category (also matches `alsoAppliesTo`) |
| **Priority** | All, P0 + P1, P0, P1, P2, P3, Unrated |

To start every new session with the same filters, set `defaultQueueFilters` in `data/config.json`. It accepts `assessment`, `version`, `mergeRange`, `mergeFrom`, `mergeTo`, `docWork`, `category`, and `priority` (allowed values are in `src/types.ts`):

```json
"defaultQueueFilters": { "assessment": "yes,check", "version": "focus", "priority": "p0,p1" }
```

`GET /queue` computes the fields these filters use (`docWorkKind`, `docSurface`, `triagePriorityLevel`, `stackMinors`, `filterMeta.lastScanAt`) on each request. They aren't saved to `queue.json`.

#### Card actions

- **Accept quest and create issue** (the wording changes with the [theme](#themes)): Creates the GitHub issue, links it in the meta issue if one is configured, sets project fields, and adds **good first issue** if checked.
- **Skip** buttons remove the item from the queue and record the reason in `history.json`:

| Button | Stored `reason` |
|--------|-----------------|
| Skip – no docs | `no docs needed` |
| Skip – already tracked | `already tracked` |
| Skip – owned by dev | `owned by dev` |
| Skip – release notes only | `release notes only` |
| Skip – not my area | `not my area` |

Items skipped since the current scan are listed under **Skipped** at the bottom of the queue. **Restore** undoes a skip by removing it from `history.json`, so the PR comes back on the next scan.

#### Bulk actions

1. Select cards with their checkboxes, a category header checkbox, or **Select all** (every item matching the current filters).
2. Choose an **Action**: **Accept quest** or any skip reason.
3. Click the button next to it, which names the action and count (for example, **Accept 5 quests**), and confirm.

A progress bar counts items as they're processed one at a time (for example, `Creating issues… 3 / 8`). When it finishes, a message reports how many succeeded and the first error, if any. Failed items stay in the queue. **Good first issue** isn't applied in bulk. **Clear selection** deselects everything.

The UI calls `POST /create-issue` or `POST /dismiss` once per item. `POST /create-issues` is also available for scripted batch creates.

#### Mark scan complete

When the queue is empty, **Mark scan complete** records the scan in `last_run.json`, so the next scan only looks at PRs merged after that point. See [Re-scan behavior](#re-scan-behavior).

### History tab

**Decision history** lists past decisions grouped by scan session, newest first, with a count of issues created and items skipped. Created issues link to GitHub, and skipped items show their reason.

### Themes

The palette button in the header switches the theme. Your choice is saved in this browser and applied before the page draws, so the default theme doesn't flash first.

| Theme | Look |
|-------|------|
| **Azeroth** (default) | The original quest-giver look and greetings |
| **Midnight Coven** | Dark obsidian and twilight purple with starlight gold, plus tarot, astrology, and witch familiars |
| **Bright Falls** | A softened dark theme with Alan Wake characters, lamp-amber accents, and a typewriter font |
| **Oldest House** | A light concrete theme with Control characters, Bureau red accents, and subtitles from the Board |

A theme changes colors, fonts, the greeting and mascots, the empty-queue and completion text, the rewards popup, toast messages, and the wording of the accept button on each card. Every accept label still says that it creates an issue. Skip reasons, filters, bulk actions, and tooltips are the same in every theme.

To add a theme:

1. Add an entry to `THEMES` in `src/public/themes.js` with an `id`, `name`, `description`, `colorMode` (`light` or `dark`), and the voice fields you want to change. Fields you leave out use Azeroth's.
2. Add an `html[data-theme="your-id"][data-color-mode]` block to `src/public/themes.css` that overrides the variables at the top of `src/public/styles.css`. Copy the Primer mapping at the end of an existing block so buttons, inputs, and dialogs match the theme.
3. Run `yarn test`. `test/themes.test.ts` checks that every theme has the fields the UI reads.

Greeting lines are inserted as HTML, so write literal angle brackets as `&lt;` and `&gt;` (the Oldest House `board()` helper does this for Board subtitles).

### Same-PR documentation coverage

During enrichment, the scanner inspects user-facing documentation included in the product PR, commonly under `docs/`, and compares it with the implemented behavior and the published docs. If those files completely and accurately cover the change and are assembled into the user-facing documentation, the item is automatically dismissed as **owned by dev**. A documentation path alone is never sufficient: incomplete, incorrect, unlinked, developer-only, generated, or release-note content stays in the triage queue with its specific gaps.

## Data files

All state is in `data/` (gitignored except defaults):

| File | Purpose |
|------|---------|
| `config.defaults.json` | Default settings (committed) |
| `config.json` | Your local overrides (gitignored) |
| `queue.json` | Current triage queue |
| `history.json` | All past decisions (created/dismissed) |
| `last_run.json` | Timestamp of last completed scan |

## Issue template

The generated issue body follows this structure:

1. **Summary** — AI-generated description of the change and why it needs docs
2. **Resources** — PR links, product issues, screenshots
3. **Availability** — Stack version, serverless deploy week, feature status
4. **Suggested edits** — Page-level docs gaps with current content quotes and suggested changes

The template is at `templates/issue-template.md` (Handlebars syntax) and can be customized.

## Re-scan behavior

- Each scan picks up PRs merged since the last completed scan
- Already-processed PRs (in history) are filtered out
- The scan date only advances when you click **Mark scan complete**
- Re-scanning re-fetches the same date range, merging with the existing queue and preserving your edits
- When the queue loads, known category mistakes are fixed (for example, Alerting v1 vs v2, and Security Cases vs One Workflow), and PRs matching `excludeLabels` or `excludeTitlePatterns` are removed

## Fork enhancements

This fork has triage features that aren't in [upstream](https://github.com/florent-leborgne/docs-quest-scanner) yet: queue filters (including merge date), bulk actions with a progress bar, **Run scan** and **Enrich** buttons, tooltips and descriptions, `docSurface` classification, category repair, and extra skip reasons. [`docs/upstream-enhancement-request.md`](docs/upstream-enhancement-request.md) is the proposal to add them upstream. [Themes](#themes) are fork-only and aren't part of that proposal. For changes by date, see [`docs/CHANGELOG.md`](docs/CHANGELOG.md).

## Maintaining this fork

A ruleset protects `main`. You can find it in the repository's **Settings → Rules → Rulesets**. It blocks deleting `main` and force-pushing to it, and requires every change to go through a pull request. No approvals are required, so you can merge your own PRs. Nobody can bypass it, including admins.

- **Sync with upstream through a PR.** The ruleset blocks GitHub's **Sync fork** button and `git push origin main`. Merge upstream into a branch instead:

  ```sh
  git fetch upstream
  git switch -c sync-upstream main
  git merge upstream/main
  git push -u origin sync-upstream
  ```

  Then open a PR from `sync-upstream` to `main` and merge it.
- **Direct push, if you ever need one:** Open the ruleset, set **Enforcement status** to **Disabled**, and push. Then set it back to **Active**.

## License

MIT

## Author

Crafted with hope by max lvl blacksmith [Florent LB](https://github.com/florent-leborgne)

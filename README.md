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

To scan more than one source repo in a single run, use the `repos[]` array (see [Multiple source repositories](#multiple-source-repositories)); the top-level `sourceRepo`/`targetRepo`/`categories` form is the single-repo shorthand.

The default release note filter includes `release_note:breaking`, `release_note:deprecation`, `release_note:feature`, and `release_note:enhancement`. Configure `release_note:*` to include every current and future release note category, including `release_note:fix` and `release_note:skip`. You can combine exact labels and trailing-wildcard patterns.

### Categories

A category groups one or more team labels under a doc area, and declares how its issues are routed on the project board:

```json
{
  "categories": [
    { "name": "Discover", "labels": ["Team:dataDiscovery"], "feature": "Kib: Discover" },
    {
      "name": "Dashboards and Visualizations",
      "labels": ["Team:Presentation", "Team:Visualizations"],
      "feature": "Kib: Dashboards",
      "featureByLabel": { "Team:Visualizations": "Kib: Visualizations" }
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `name` | Doc area name (the category) |
| `labels` | One or more team/feature labels; a PR matching **any** lands in this category |
| `feature` | Feature field value on the project board for this category |
| `featureByLabel` | Optional per-label Feature override — for a category that bundles teams needing different Features. A matching label wins over `feature`. |
| `metaIssue` | Name of a meta-issue pattern (see below) to link into. Overrides the group default; `null` opts the category out. |
| `metaIssueHeading` | Heading to match in the meta issue body (defaults to `name`) |
| `maxMergeAgeMonths` | How far before the last scan date the late-label catch may reach, in months. Falls back to the group value. Set to `0` when adding new labels, so the first scan doesn't drag in months of already-merged PRs. |
| `target` / `project` | Optional per-category overrides of the group's target repo / project |

A category can list several labels (e.g. `Team:Presentation` + `Team:Visualizations`) and still route to one meta issue; use `featureByLabel` only when those labels need different board Features.

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
      "project": { "org": "elastic", "number": 1034, "defaultArea": "Kibana core" },
      "categories": [
        { "name": "Dashboards", "labels": ["Team:Presentation", "Team:Visualizations"], "feature": "Kib: Dashboards" }
      ]
    },
    {
      "id": "elastic/elasticsearch",
      "source": { "owner": "elastic", "repo": "elasticsearch" },
      "target": { "owner": "elastic", "repo": "docs-content" },
      "metaIssue": "elasticsearch",
      "project": { "org": "elastic", "number": 1034 },
      "categories": [
        { "name": "Search", "labels": [":Search Relevance/Search"], "feature": "ES: Search" }
      ]
    }
  ]
}
```

Each repo group owns its routing. A scan iterates every group × its categories; created issues are added to that group's project and meta issue, and the **Feature / project / meta-issue mapping is resolved automatically** from the PR's source repo and labels — the writer doesn't pick it. The **target repo** remains a per-issue dropdown choice (defaulting to the group's `target`).

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

The legacy flat config (top-level `sourceRepo`/`targetRepo`/`categories`) still works unchanged — it's treated as a single repo group internally. The Settings dialog edits `repos[]` configs with a structured form (meta-issue patterns, per-repo fields, and category rows), with a raw-JSON panel as an advanced fallback for fields the form doesn't expose (`sizeMap`, `featureByLabel`, per-category `target`/`project`).

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

Fields set automatically: **Release** (from version label), **Size** and **Content Type** (from the effort estimate via `sizeMap` / `contentTypeMap`), **Priority**, **Requester**, and **Area** (group defaults), **Feature** (from the matched category's `feature` / `featureByLabel`), **Serverless-pub** (computed deploy date).

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

- **Queue tab**: Cards for each PR needing triage, with AI summary, availability info, and a suggested issue
- **Already tracked badge**: If the scan detected an existing docs issue that references a PR (via GitHub cross-reference events), the card shows a green "Already tracked" badge and links to the issue — so you can skip without wasting time re-reading the PR
- **Accept quest**: Creates the issue, optionally adds it to the meta tracking issue, sets project fields
- **Skip – no docs**: Dismisses a change that doesn't need documentation.
- **Skip – already tracked**: Dismisses documentation work tracked in another issue or checklist.
- **Skip – owned by dev**: Dismisses documentation work owned by the development team.
- **Mark scan complete**: Advances the scan timestamp so the next run only picks up new PRs

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
- The scan date only advances when you click "Mark scan complete"
- Re-scanning re-fetches the same date range, merging with the existing queue and preserving your edits

## License

MIT

## Author

Crafted with hope by max lvl blacksmith [Florent LB](https://github.com/florent-leborgne)

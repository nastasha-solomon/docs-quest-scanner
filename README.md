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
| `releaseNoteLabels` | PR labels that qualify for triage | `["release_note:feature", ...]` |
| `issueLabels` | Labels added to created issues | `["Team:Docs"]` |
| `metaIssues` | Named release-checklist patterns, referenced by name | See below |
| `project` | GitHub Project board integration | See below |

To scan more than one source repo in a single run, use the `repos[]` array (see [Multiple source repositories](#multiple-source-repositories)); the top-level `sourceRepo`/`targetRepo`/`categories` form is the single-repo shorthand.

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

The legacy flat config (top-level `sourceRepo`/`targetRepo`/`categories`) still works unchanged — it's treated as a single repo group internally. Multi-repo configs are edited as JSON in the Settings dialog.

### GitHub Project integration

Auto-fill project board fields when creating issues:

```json
{
  "project": {
    "org": "my-org",
    "number": 42,
    "defaultArea": "My area",
    "defaultPriority": "P2 (Important)",
    "sizeMap": { "quick-fix": "XS", "update": "S", "new-content": "M" },
    "contentTypeMap": { "quick-fix": "Improvement", "update": "Improvement", "new-content": "Net-new" }
  }
}
```

Fields set automatically: **Release** (from version label), **Size** and **Content Type** (from the effort estimate via `sizeMap` / `contentTypeMap`), **Priority** and **Area** (group defaults), **Feature** (from the matched category's `feature` / `featureByLabel`), **Serverless-pub** (computed deploy date).

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
- **Skip**: Marks the item as not needing docs (with reason)
- **Mark scan complete**: Advances the scan timestamp so the next run only picks up new PRs

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

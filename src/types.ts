/** A PR fetched from GitHub */
export interface PullRequest {
  number: number;
  title: string;
  url: string;
  author: string;
  mergedAt: string;
  body: string;
  labels: string[];
  changedFiles?: string[];
}

/** An existing docs issue that already tracks this PR */
export interface TrackedIssue {
  number: number;
  url: string;
  title: string;
}

/** A specific gap found between current docs and the PR change */
export interface DocsGapEntry {
  /** URL of the doc page analyzed */
  pageUrl: string;
  /** Page title */
  pageTitle: string;
  /** Specific heading/section within the page that's affected (if identifiable) */
  section?: string;
  /** What the current docs say (brief quote or description) */
  currentContent?: string;
  /** What needs to change and why (may include assembly implications when relevant) */
  gap: string;
  /**
   * What kind of doc work this gap requires — used internally to drive effortTag
   * and filter marginal gaps before they reach the issue template.
   */
  actionType?: 'update-existing' | 'add-section' | 'create-how-to' | 'create-overview' | 'review-only';
}

/** Assessment of whether a PR needs documentation */
export interface Assessment {
  /** yes = needs docs, check = unsure, no = no docs needed */
  needsDocs: 'yes' | 'check' | 'no';
  /** 0–1 confidence score */
  confidence: number;
  /** Human-readable summary of the change, incorporating release note text if present */
  summary: string;
  /** Why this assessment was made */
  reasoning: string;
  /** preview, beta, ga, or unknown */
  featureStatus?: string;
  /** Feature flag name if behind one, or null */
  featureFlag?: string;
  /** Estimated serverless release date */
  serverlessEstimate?: string;
  /**
   * Whether the change reaches serverless at all. Defaults to 'yes' — most Kibana
   * platform features ship to serverless and versioned stack. Set to 'no' only with
   * config evidence (plugin disabled in config/serverless.yml). 'unknown' only when
   * no owning plugin can be resolved. Gates serverlessEstimate: 'no' renders "N/A".
   */
  serverlessApplies?: 'yes' | 'no' | 'unknown';
  /** URLs to existing documentation pages */
  existingDocs?: string[];
  /** Link to the product-side issue if found */
  productIssue?: string;
  /** Section-level analysis of what's missing or wrong in existing docs */
  docsGap?: DocsGapEntry[];
  /** Effort estimate: quick-fix (change a word/value), update (rewrite a section), new-content (new section or page) */
  effortTag?: 'quick-fix' | 'update' | 'new-content';
  /**
   * Whether the PR diff actually supports the stated change — used internally
   * to calibrate confidence and reasoning; not rendered in the issue template.
   */
  premiseAccuracy?: 'accurate' | 'partially-accurate' | 'stale' | 'unsupported';
  /** Screenshot/GIF URLs extracted from PR bodies */
  screenshots?: string[];
  /** Existing docs issues found in the target repo that already track this PR */
  trackedIn?: TrackedIssue[];
}

/** A single item in the triage queue — one or more related PRs */
export interface QueueItem {
  id: string;
  /** Id of the RepoGroup this item was scanned from. Resolves target/project/meta at create time. */
  repoId: string;
  /** Primary category from config (e.g., "Dashboards and Visualizations") */
  category: string;
  /** Additional categories this item also applies to (from cross-category dedup) */
  alsoAppliesTo?: string[];
  /** Version label detected from PR labels (e.g., "v9.4.0") */
  version: string;
  prs: PullRequest[];
  assessment: Assessment;
  suggestedTitle: string;
  suggestedBody: string;
  /** Release note text extracted from PR body, if present */
  releaseNoteText?: string;
  /** User edits made in the review UI (persisted across re-scans) */
  userEdits?: {
    title?: string;
    body?: string;
    featureStatus?: string;
    featureFlag?: string;
    serverlessEstimate?: string;
    serverlessApplies?: 'yes' | 'no' | 'unknown';
    existingDocs?: string;
    targetRepo?: string;
  };
}

/** A triage queue written to queue.json */
export interface Queue {
  scannedAt: string;
  items: QueueItem[];
}

/** A record of a past decision */
export interface HistoryEntry {
  /** PR numbers covered by this decision */
  prNumbers: number[];
  decision: 'created' | 'dismissed';
  /** Id of the RepoGroup this decision belongs to (absent on legacy entries). */
  repoId?: string;
  /** Why it was dismissed (e.g., "no docs needed", "already tracked") */
  reason?: string;
  /** URL of the created issue */
  issueUrl?: string;
  issueNumber?: number;
  timestamp: string;
  version: string;
  /** The suggested title at time of decision, for reference */
  title?: string;
  /** The scan date this entry belongs to, for grouping into sessions */
  session?: string;
}

/** Persisted history */
export interface History {
  entries: HistoryEntry[];
}

/** Last scan metadata */
export interface LastRun {
  /** ISO date of the last completed scan (legacy/global fallback). */
  lastRunDate?: string;
  /** Per-repo-group last-run dates (repoId → ISO date). Preferred when present. */
  byRepo?: Record<string, string>;
}

/** A GitHub repo reference. */
export interface RepoRef {
  owner: string;
  repo: string;
}

/** GitHub Projects v2 integration config (issues are added to the project and fields auto-filled). */
export interface ProjectConfig {
  /** GitHub org that owns the project (e.g., "elastic") */
  org: string;
  /** Project number (from the URL, e.g., 1034) */
  number: number;
  /** Default area field value (e.g., "Kibana core") */
  defaultArea?: string;
  /** Default priority field value (e.g., "P1: High") */
  defaultPriority?: string;
  /** Default requester field value (e.g., "DQS") */
  defaultRequester?: string;
  /** Effort tag → Size mapping */
  sizeMap?: Record<string, string>;
  /** Effort tag → Content Type field value mapping */
  contentTypeMap?: Record<string, string>;
  /**
   * @deprecated Legacy category-name → Feature mapping. Superseded by
   * `Category.feature`. Still read for backward compatibility (folded into
   * categories by normalizeConfig).
   */
  featureMap?: Record<string, string>;
  /**
   * @deprecated Legacy PR-label → Feature mapping. Superseded by
   * `Category.featureByLabel`. Still read for backward compatibility.
   */
  featureLabelMap?: Record<string, string>;
}

/** Named meta-issue patterns: name → title pattern (with a `{version}` placeholder). */
export type MetaIssuesRegistry = Record<string, string>;

/**
 * Meta issue configuration. A meta issue is a checklist issue in the target
 * repo that tracks all docs issues for a given release. When enabled, newly
 * created issues are automatically linked into the matching section.
 *
 * Can be set globally (`Config.metaIssue`) or per category (`Category.metaIssue`),
 * where the category value overrides the global one for that category only.
 */
export interface MetaIssueConfig {
  /** Whether to link created issues to a meta issue. Defaults to true. */
  enabled?: boolean;
  /**
   * Title search pattern used to find the meta issue in the target repo.
   * Use `{version}` as a placeholder for the major.minor version (e.g., "9.5").
   * Default: "Kibana {version}"
   *
   * Examples:
   *   "My Project {version} release checklist"
   *   "Docs tracker — {version}"
   */
  titlePattern?: string;
}

/** A team category with its GitHub labels */
export interface Category {
  name: string;
  labels: string[];
  /** Heading to match in the meta issue body (defaults to name if not set) */
  metaIssueHeading?: string;
  /**
   * Name of a meta-issue pattern (from the top-level `metaIssues` registry) to
   * link this category's issues into. Overrides the group's default `metaIssue`.
   * Set to `null` to opt this category out of meta-issue linking. Omit to inherit
   * the group default.
   */
  metaIssue?: string | null;
  /**
   * Feature field value for this category's issues on the project board
   * (e.g. "Kib: Discover"). Applies to every label in the category.
   */
  feature?: string;
  /**
   * Per-label Feature overrides for the rare category that bundles teams mapping
   * to different Features (e.g. Team:Visualizations → "Kib: Visualizations").
   * A matching label wins over `feature`.
   */
  featureByLabel?: Record<string, string>;
  /** Issue labels for this category's issues. Falls back to the group's `issueLabels`. */
  issueLabels?: string[];
  /**
   * Project board number for this category's issues. Overrides the group
   * project's `number` only — org, defaults, and field maps are inherited.
   */
  projectNumber?: number;
  /**
   * Route this category's issues to a different target repo than the group's
   * default (advanced; edited via raw JSON). The user can still redirect per
   * issue via the UI dropdown.
   */
  target?: RepoRef;
}

/**
 * A self-contained scan target: one source repo and its categories, routed to
 * one target repo / project / meta-issue. A scan iterates `repos × categories`.
 */
export interface RepoGroup {
  /** Stable id, referenced by QueueItem.repoId. Defaults to `${source.owner}/${source.repo}`. */
  id: string;
  /** Optional display label for the UI. */
  label?: string;
  /** Repo whose merged PRs are scanned. */
  source: RepoRef;
  /** Repo where docs issues are created (default target; user can still redirect per issue). */
  target: RepoRef;
  categories: Category[];
  project?: ProjectConfig;
  /** Default meta-issue pattern name (from the `metaIssues` registry) for this group's categories. */
  metaIssue?: string;
  issueLabels?: string[];
  /** Defaults to `^v\d+\.\d+\.\d+$`. */
  versionLabelPattern?: string;
  releaseNoteLabels?: string[];
  /** Defaults to 6 (see Config.maxMergeAgeMonths). */
  maxMergeAgeMonths?: number;
  /** Repos to scan for existing cross-referenced docs issues. Defaults to [target, `${target}-internal`]. */
  crossRefRepos?: string[];
  /** Regex to extract a product-side issue URL from PR bodies. Defaults to the source repo's issues URL. */
  productIssuePattern?: string;
}

/**
 * App configuration. Two shapes are accepted on disk:
 *  - Multi-repo: define `repos[]`.
 *  - Legacy single-target: define the top-level `sourceRepo`/`targetRepo`/`categories`/… fields.
 * `normalizeConfig` (config.ts) turns either into a `NormalizedConfig`; the legacy
 * fields are kept optional so both validate.
 */
export interface Config {
  /** Display title shown in the header. */
  title?: string;
  /** Named meta-issue patterns referenced by `RepoGroup.metaIssue` / `Category.metaIssue`. */
  metaIssues?: MetaIssuesRegistry;
  /** Multi-repo scan targets. When present, takes precedence over the legacy fields below. */
  repos?: RepoGroup[];

  // ── Legacy single-target fields (used only when `repos` is absent) ──
  sourceRepo?: RepoRef;
  targetRepo?: RepoRef;
  categories?: Category[];
  /** Regex pattern to detect version labels on PRs. Default: /^v\d+\.\d+\.\d+$/ */
  versionLabelPattern?: string;
  /** Release note labels that qualify a PR for docs triage. */
  releaseNoteLabels?: string[];
  /**
   * Drop late-label-catch results whose mergedAt is older than this many
   * months before sinceDate. Default: 6.
   */
  maxMergeAgeMonths?: number;
  issueLabels?: string[];
  /**
   * @deprecated Legacy global meta issue (object form). Superseded by the named
   * `metaIssues` registry; still read for backward compatibility and registered
   * under the name "default" by normalizeConfig.
   */
  metaIssue?: MetaIssueConfig;
  /** GitHub Projects v2 integration. */
  project?: ProjectConfig;
}

/** Config after normalization — always expressed as repo groups. Consumed by scan/create code. */
export interface NormalizedConfig {
  title?: string;
  /** Named meta-issue patterns (name → title pattern). */
  metaIssues: MetaIssuesRegistry;
  repos: RepoGroup[];
}

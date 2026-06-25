import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Config,
  History,
  LastRun,
  Queue,
  NormalizedConfig,
  RepoGroup,
  Category,
  RepoRef,
  ProjectConfig,
  MetaIssuesRegistry,
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DATA_DIR = resolve(ROOT, 'data');

const paths = {
  configDefaults: resolve(DATA_DIR, 'config.defaults.json'),
  config: resolve(DATA_DIR, 'config.json'),
  queue: resolve(DATA_DIR, 'queue.json'),
  history: resolve(DATA_DIR, 'history.json'),
  lastRun: resolve(DATA_DIR, 'last_run.json'),
  issueTemplate: resolve(ROOT, 'templates', 'issue-template.md'),
};

export { paths, DATA_DIR, ROOT };

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch (err) {
    throw new Error(`Failed to parse ${path}: ${(err as Error).message}`);
  }
}

function writeJson<T>(path: string, data: T): void {
  const serialized = JSON.stringify(data, null, 2) + '\n';
  // Verify the serialized output is valid JSON before writing
  JSON.parse(serialized);
  writeFileSync(path, serialized, 'utf-8');
}

/** Load config, falling back to defaults if no user config exists */
export function loadConfig(): Config {
  const userConfig = readJson<Config>(paths.config);
  if (userConfig) return userConfig;

  const defaults = readJson<Config>(paths.configDefaults);
  if (!defaults) throw new Error('Missing config.defaults.json');
  return defaults;
}

const DEFAULT_VERSION_PATTERN = '^v\\d+\\.\\d+\\.\\d+$';
const DEFAULT_RELEASE_NOTE_LABELS = [
  'release_note:breaking',
  'release_note:deprecation',
  'release_note:feature',
  'release_note:enhancement',
];

/** Fill per-group defaults derived from the group's source/target. */
function fillRepoDefaults(g: RepoGroup): RepoGroup {
  const target = `${g.target.owner}/${g.target.repo}`;
  return {
    ...g,
    id: g.id || `${g.source.owner}/${g.source.repo}`,
    versionLabelPattern: g.versionLabelPattern ?? DEFAULT_VERSION_PATTERN,
    releaseNoteLabels: g.releaseNoteLabels ?? DEFAULT_RELEASE_NOTE_LABELS,
    issueLabels: g.issueLabels ?? [],
    maxMergeAgeMonths: g.maxMergeAgeMonths ?? 6,
    crossRefRepos:
      g.crossRefRepos ??
      (g.target.repo.endsWith('-internal')
        ? [target]
        : [target, `${g.target.owner}/${g.target.repo}-internal`]),
    productIssuePattern:
      g.productIssuePattern ?? `https://github\\.com/${g.source.owner}/${g.source.repo}/issues/\\d+`,
  };
}

/**
 * Fold legacy `project.featureMap` / `featureLabelMap` into per-category
 * `feature` / `featureByLabel`, so resolution code only deals with the new shape.
 */
function foldLegacyFeatures(group: RepoGroup): RepoGroup {
  const fm = group.project?.featureMap;
  const flm = group.project?.featureLabelMap;
  if (!fm && !flm) return group;
  const categories = group.categories.map((c) => {
    const next: Category = { ...c };
    if (next.feature === undefined && fm?.[c.name]) next.feature = fm[c.name];
    if (flm) {
      const byLabel: Record<string, string> = { ...(next.featureByLabel ?? {}) };
      for (const lbl of c.labels) if (flm[lbl]) byLabel[lbl] = flm[lbl];
      if (Object.keys(byLabel).length) next.featureByLabel = byLabel;
    }
    return next;
  });
  return { ...group, categories };
}

/**
 * Normalize either config shape into repo groups + a meta-issue registry. A
 * `repos[]` config is used directly; a legacy flat config is wrapped into a
 * single synthetic group. Legacy global `metaIssue` and `project.featureMap`/
 * `featureLabelMap` are migrated so the rest of the app only deals with the
 * new shape (named meta issues + per-category feature).
 */
export function normalizeConfig(raw: Config): NormalizedConfig {
  // Named meta-issue registry; a legacy global metaIssue object becomes "default".
  const metaIssues: MetaIssuesRegistry = { ...(raw.metaIssues ?? {}) };
  if (raw.metaIssue && metaIssues.default === undefined) {
    metaIssues.default = raw.metaIssue.titlePattern ?? 'Kibana {version}';
  }

  let groups: RepoGroup[];
  if (raw.repos?.length) {
    groups = raw.repos.map((g) => foldLegacyFeatures(fillRepoDefaults(g)));
  } else {
    if (!raw.sourceRepo || !raw.targetRepo || !raw.categories) {
      throw new Error(
        'Config must define either `repos` or the legacy `sourceRepo`/`targetRepo`/`categories` fields.'
      );
    }
    // Legacy global meta issue → reference the synthesized "default" pattern,
    // unless it was explicitly disabled.
    const legacyMeta = raw.metaIssue && raw.metaIssue.enabled === false ? undefined : 'default';
    groups = [
      foldLegacyFeatures(
        fillRepoDefaults({
          id: `${raw.sourceRepo.owner}/${raw.sourceRepo.repo}`,
          source: raw.sourceRepo,
          target: raw.targetRepo,
          categories: raw.categories,
          project: raw.project,
          metaIssue: raw.metaIssue ? legacyMeta : undefined,
          issueLabels: raw.issueLabels,
          versionLabelPattern: raw.versionLabelPattern,
          releaseNoteLabels: raw.releaseNoteLabels,
          maxMergeAgeMonths: raw.maxMergeAgeMonths,
        })
      ),
    ];
  }
  return { title: raw.title, metaIssues, repos: groups };
}

/** Load and normalize the config into repo groups (what scan/create code consumes). */
export function loadNormalizedConfig(): NormalizedConfig {
  return normalizeConfig(loadConfig());
}

/** The target repo / project an issue is routed to, after category + group resolution. */
export interface ResolvedRouting {
  target: RepoRef;
  project?: ProjectConfig;
  issueLabels: string[];
}

/**
 * Resolve where an item's issue is filed and which project it joins.
 * Precedence: category override → group default. Single source of truth so
 * create-issue and the UI agree.
 */
export function resolveRouting(group: RepoGroup, category?: Category): ResolvedRouting {
  return {
    target: category?.target ?? group.target,
    project: category?.project ?? group.project,
    issueLabels: group.issueLabels ?? [],
  };
}

/**
 * Resolve the meta-issue title pattern for a category, or null if it isn't linked.
 * Precedence: category.metaIssue (null = opt out) → group.metaIssue → none.
 * The resolved name is looked up in the registry.
 */
export function resolveMetaPattern(
  metaIssues: MetaIssuesRegistry,
  group: RepoGroup,
  category?: Category
): string | null {
  // Explicit category opt-out.
  if (category && 'metaIssue' in category && category.metaIssue === null) return null;
  const name = category?.metaIssue ?? group.metaIssue;
  if (!name) return null;
  return metaIssues[name] ?? null;
}

/**
 * Resolve the Feature field value for an item: a per-label override
 * (featureByLabel) wins over the category's default feature.
 */
export function resolveFeature(category: Category | undefined, prLabels: string[]): string | undefined {
  if (!category) return undefined;
  if (category.featureByLabel) {
    for (const label of prLabels) {
      const f = category.featureByLabel[label];
      if (f) return f;
    }
  }
  return category.feature;
}

export function saveConfig(config: Config): void {
  writeJson(paths.config, config);
}

export function loadQueue(): Queue {
  return readJson<Queue>(paths.queue) ?? { scannedAt: '', items: [] };
}

export function saveQueue(queue: Queue): void {
  writeJson(paths.queue, queue);
}

export function loadHistory(): History {
  return readJson<History>(paths.history) ?? { entries: [] };
}

export function saveHistory(history: History): void {
  writeJson(paths.history, history);
}

export function loadLastRun(): LastRun | null {
  return readJson<LastRun>(paths.lastRun);
}

export function saveLastRun(lastRun: LastRun): void {
  writeJson(paths.lastRun, lastRun);
}

export function loadIssueTemplate(): string {
  return readFileSync(paths.issueTemplate, 'utf-8');
}

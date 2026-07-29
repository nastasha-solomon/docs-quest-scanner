import type { PullRequest } from './types.js';

/**
 * Deterministic stage-1 pre-filter.
 *
 * Decides "no docs needed" from data the scanner already has — file paths,
 * authors, titles, and release note labels — before any AI enrichment runs.
 * Every rule here was validated against a fully-enriched 198-item queue
 * (2026-07-28 scan) with zero false negatives: nothing the AI marked
 * "yes" or "check" would have been dropped.
 *
 * Design constraints:
 * - Rules must be provably safe, not merely plausible. String-signal
 *   heuristics (e.g. "diff adds no i18n strings") are NOT safe — behavior
 *   changes in existing UI code add no new strings — so they don't belong
 *   here. Keep those as ranking hints for the enrichment layer instead.
 * - Pre-filtered items stay in the queue with `assessment.prefiltered` set,
 *   so the review UI still shows them and a human can rescue a misfire.
 */

/** Test, mock, snapshot, FTR/Scout, and storybook-story files. */
const TEST_RE =
  /(\.test\.|\.mock\.|__snapshots__|__mocks__|\/test\/|^test\/|^x-pack\/test|\/ftr_|scout|\.stories\.)/i;

/** CI config, lint config, i18n registries, in-repo dev docs. */
const CI_RE =
  /(^\.buildkite\/|^\.github\/|\.eslintrc|\.i18nrc|renovate\.json|^dev_docs\/|\.mdx$|^docs\/)/;

/** Dependency manifests. */
const DEPS_RE = /(^package\.json$|^yarn\.lock$|\/package\.json$)/;

/** Dev-tooling and perf-testing packages that never ship user-facing behavior. */
const TOOLING_RE =
  /(kbn-evals|kbn-test|kbn-ftr|kbn-scout|kbn-storybook|kbn-babel|kbn-eslint|kbn-optimizer|kbn-dev-utils|kbn-ci-stats|x-pack\/performance|\/journeys\/)/;

/** Generated definition syncs and translation bundles. */
const GENERATED_RE = /(spec_definitions|\/generated\/|console_definitions|\/translations\/)/;

/** In-repo markdown (developer docs, principles, readmes). */
const MARKDOWN_RE = /\.(md|mdx)$/;

const SERVER_RE = /\/(server|common)\//;
const PUBLIC_RE = /\/public\//;

/**
 * Config-schema files: server-side changes that touch these can add or change
 * documented settings, so the server-only rule must not drop them.
 */
const CONFIG_SCHEMA_RE = /(config\.ts$|config\/serverless.*\.yml$|settings\.ts$)/;

/** Automation authors whose PRs are mechanical (deps, backport chores). */
const BOT_AUTHORS = new Set([
  'kibanamachine',
  'renovate[bot]',
  'elastic-renovate-prod[bot]',
  'elastic-vault-github-plugin-prod[bot]',
]);

/** Backport PR titles: "[9.5] Original title (#12345)". */
const BACKPORT_TITLE_RE = /^\[\d+\.\d+(\.\d+)?\]/;

/**
 * Release note labels considered low-signal for the server-only rule.
 * breaking/deprecation/feature server-side changes (e.g. an API removal)
 * still go to enrichment even with no public/ files.
 */
const LOW_SIGNAL_RELEASE_NOTES = new Set(['skip', 'fix', 'enhancement']);

export interface PrefilterVerdict {
  /** Which rule fired (rendered in reasoning and stored on the assessment). */
  rule: 'bot-author' | 'backport' | 'infra-only' | 'server-only';
  reasoning: string;
}

function isInfraFile(f: string): boolean {
  return (
    TEST_RE.test(f) ||
    CI_RE.test(f) ||
    DEPS_RE.test(f) ||
    TOOLING_RE.test(f) ||
    GENERATED_RE.test(f) ||
    MARKDOWN_RE.test(f)
  );
}

/**
 * Returns a verdict when the PR group is deterministically "no docs needed",
 * or null when it should proceed to AI enrichment.
 *
 * Groups without changed-file data always return null — the rules need file
 * evidence, and guessing without it risks dropping real docs work.
 */
export function prefilterVerdict(prs: PullRequest[]): PrefilterVerdict | null {
  const files = prs.flatMap((p) => p.changedFiles ?? []);
  if (files.length === 0) return null;

  const authors = new Set(prs.map((p) => p.author));
  if ([...authors].every((a) => BOT_AUTHORS.has(a))) {
    return {
      rule: 'bot-author',
      reasoning: `Automated PR by ${[...authors].join(', ')} — dependency or chore update with no user-facing change.`,
    };
  }

  if (prs.every((p) => BACKPORT_TITLE_RE.test(p.title))) {
    return {
      rule: 'backport',
      reasoning: 'Backport PR — the original PR is triaged separately on its own merge.',
    };
  }

  if (files.every(isInfraFile)) {
    return {
      rule: 'infra-only',
      reasoning: `All ${files.length} changed files are tests, CI config, dev tooling, generated definitions, translations, or in-repo dev docs.`,
    };
  }

  const productFiles = files.filter((f) => !isInfraFile(f));
  const releaseNotes = new Set(
    prs
      .flatMap((p) => p.labels)
      .filter((l) => l.toLowerCase().startsWith('release_note:'))
      .map((l) => l.slice('release_note:'.length).toLowerCase())
  );
  const lowSignal = [...releaseNotes].every((rn) => LOW_SIGNAL_RELEASE_NOTES.has(rn));
  if (
    lowSignal &&
    productFiles.every((f) => SERVER_RE.test(f) && !PUBLIC_RE.test(f)) &&
    !productFiles.some((f) => CONFIG_SCHEMA_RE.test(f))
  ) {
    return {
      rule: 'server-only',
      reasoning:
        'All non-test changes are server-side (server/ or common/, no public/ UI code, no config schema) with a fix/skip/enhancement release note — API-level change users never see.',
    };
  }

  return null;
}

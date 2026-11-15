import { Octokit } from '@octokit/rest';
import type { PullRequest, RepoRef, TrackedIssue } from './types.js';

let octokit: Octokit | null = null;

export function getOctokit(): Octokit {
  if (!octokit) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GITHUB_TOKEN environment variable is required');
    octokit = new Octokit({ auth: token });
  }
  return octokit;
}

/**
 * Search for merged PRs matching the given team labels,
 * merged after the given date. No version filter — version is
 * detected per-PR from its labels instead.
 *
 * Uses a dual-query strategy to also catch PRs where the team label
 * was added after the PR merged (late-labeled PRs):
 *   1. Primary: `merged:>=sinceDate` — the normal incremental scan
 *   2. Secondary: `updated:>=sinceDate` — catches PRs whose labels
 *      changed since the last scan even if they merged before it
 */
export async function searchMergedPRs(
  source: RepoRef,
  teamLabels: string[],
  sinceDate: string,
  maxMergeAgeMonths = 6
): Promise<PullRequest[]> {
  const ok = getOctokit();
  const { owner, repo } = source;

  const teamQ = teamLabels.map((l) => `label:"${l}"`).join(' ');

  const mergedQuery = `repo:${owner}/${repo} is:pr is:merged merged:>=${sinceDate} ${teamQ}`;

  // Secondary query catches PRs where the team label was added after the PR
  // merged: GitHub's updated_at changes when labels are added/removed, so any
  // PR labeled since the last scan appears here even if it merged before sinceDate.
  const updatedQuery = `repo:${owner}/${repo} is:pr is:merged updated:>=${sinceDate} ${teamQ}`;

  const [primary, secondary] = await Promise.all([
    paginateSearch(ok, mergedQuery),
    paginateSearch(ok, updatedQuery),
  ]);

  // Merge and deduplicate by PR number — primary takes precedence
  const seen = new Map<number, PullRequest>();
  for (const pr of primary) {
    seen.set(pr.number, pr);
  }

  // Compute the merge-age cutoff: late-label entries merged before this date
  // are filtered out. They're typically PRs whose only recent activity is an
  // unrelated label edit (e.g., a version label removed years after merge).
  const maxAgeMonths = maxMergeAgeMonths;
  const cutoff = new Date(sinceDate);
  cutoff.setMonth(cutoff.getMonth() - maxAgeMonths);
  const cutoffMs = cutoff.getTime();

  let lateCount = 0;
  let staleCount = 0;
  for (const pr of secondary) {
    if (seen.has(pr.number)) continue;
    const mergedMs = pr.mergedAt ? Date.parse(pr.mergedAt) : NaN;
    if (Number.isFinite(mergedMs) && mergedMs < cutoffMs) {
      staleCount++;
      continue;
    }
    seen.set(pr.number, pr);
    lateCount++;
  }

  if (lateCount > 0) {
    console.log(
      `    (Late-label catch: found ${lateCount} additional PR${lateCount !== 1 ? 's' : ''} labeled after merging)`
    );
  }
  if (staleCount > 0) {
    console.log(
      `    (Skipped ${staleCount} late-label entr${staleCount !== 1 ? 'ies' : 'y'} merged >${maxAgeMonths} months ago)`
    );
  }

  return [...seen.values()];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry GitHub search when the search API rate limit (30/min) is hit. */
async function searchWithRetry(
  ok: Octokit,
  params: Parameters<Octokit['search']['issuesAndPullRequests']>[0],
  maxRetries = 8
): ReturnType<Octokit['search']['issuesAndPullRequests']> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await ok.search.issuesAndPullRequests(params);
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string; response?: { headers?: Record<string, string> } };
      const isRateLimit = e?.status === 403 && /rate limit/i.test(String(e?.message ?? ''));
      if (!isRateLimit || attempt >= maxRetries) throw err;
      const resetHeader = e?.response?.headers?.['x-ratelimit-reset'];
      const resetMs = resetHeader ? Number(resetHeader) * 1000 : NaN;
      const waitMs = Math.max((Number.isFinite(resetMs) ? resetMs - Date.now() : 60_000) + 2000, 2000);
      console.log(
        `    (Search API rate limit — waiting ${Math.ceil(waitMs / 1000)}s before retrying...)`
      );
      await sleep(waitMs);
    }
  }
}

/**
 * Paginate through all pages of a GitHub search query and return PullRequest objects.
 * GitHub exposes at most 1,000 results for any one search query, so searches
 * above that limit are recursively split into non-overlapping date ranges.
 */
async function paginateSearch(ok: Octokit, query: string): Promise<PullRequest[]> {
  const firstPage = await fetchSearchPage(ok, query, 1);

  if (firstPage.totalCount <= SEARCH_RESULT_LIMIT) {
    return collectSearchPages(ok, query, firstPage);
  }

  const dateQualifier = query.match(/\b(merged|updated):>=(\d{4}-\d{2}-\d{2})\b/);
  if (!dateQualifier) {
    throw new Error(
      `GitHub search returned ${firstPage.totalCount} results, but the query has no supported date qualifier to partition: ${query}`
    );
  }

  const [, qualifier, startDate] = dateQualifier;
  const endDate = formatUtcDate(new Date());
  return searchDateRange(ok, query, qualifier, startDate, startDate, endDate);
}

const SEARCH_RESULT_LIMIT = 1000;
const SEARCH_PAGE_SIZE = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

type SearchPage = Awaited<ReturnType<typeof fetchSearchPage>>;

async function fetchSearchPage(
  ok: Octokit,
  query: string,
  page: number
): Promise<{
  totalCount: number;
  items: Awaited<ReturnType<Octokit['search']['issuesAndPullRequests']>>['data']['items'];
}> {
  const result = await searchWithRetry(ok, {
    q: query,
    per_page: SEARCH_PAGE_SIZE,
    page,
    sort: 'updated',
    order: 'desc',
  });

  return {
    totalCount: result.data.total_count,
    items: result.data.items,
  };
}

async function collectSearchPages(
  ok: Octokit,
  query: string,
  firstPage: SearchPage
): Promise<PullRequest[]> {
  const results: PullRequest[] = [];
  let page = 1;
  let items = firstPage.items;

  while (items.length > 0) {
    for (const item of items) {
      results.push({
        number: item.number,
        title: item.title,
        url: item.html_url,
        author: item.user?.login ?? 'unknown',
        mergedAt: (item.pull_request?.merged_at as string) ?? item.closed_at ?? '',
        body: item.body ?? '',
        labels: (item.labels ?? []).map((l) =>
          typeof l === 'string' ? l : l.name ?? ''
        ),
      });
    }

    if (results.length >= firstPage.totalCount) break;
    page++;
    items = (await fetchSearchPage(ok, query, page)).items;
  }

  return results;
}

async function searchDateRange(
  ok: Octokit,
  baseQuery: string,
  qualifier: string,
  lowerBound: string,
  startDate: string,
  endDate: string
): Promise<PullRequest[]> {
  const boundedQuery = baseQuery.replace(
    `${qualifier}:>=${lowerBound}`,
    `${qualifier}:${startDate}..${endDate}`
  );
  const firstPage = await fetchSearchPage(ok, boundedQuery, 1);

  if (firstPage.totalCount <= SEARCH_RESULT_LIMIT) {
    return collectSearchPages(ok, boundedQuery, firstPage);
  }

  if (startDate === endDate) {
    throw new Error(
      `GitHub search returned ${firstPage.totalCount} results for ${qualifier}:${startDate}; a single day cannot be partitioned further`
    );
  }

  const startMs = parseUtcDate(startDate).getTime();
  const endMs = parseUtcDate(endDate).getTime();
  const midpointMs = startMs + Math.floor((endMs - startMs) / (2 * DAY_MS)) * DAY_MS;
  const midpoint = formatUtcDate(new Date(midpointMs));
  const nextDay = formatUtcDate(new Date(midpointMs + DAY_MS));

  const [left, right] = await Promise.all([
    searchDateRange(ok, baseQuery, qualifier, lowerBound, startDate, midpoint),
    searchDateRange(ok, baseQuery, qualifier, lowerBound, nextDay, endDate),
  ]);
  return [...left, ...right];
}

function parseUtcDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || formatUtcDate(date) !== value) {
    throw new Error(`Invalid search date: ${value}`);
  }
  return date;
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}


/**
 * Fetch changed files for a specific PR.
 */
export async function getPRFiles(
  owner: string,
  repo: string,
  prNumber: number
): Promise<string[]> {
  const ok = getOctokit();
  const { data: files } = await ok.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });
  return files.map((f) => f.filename);
}

/**
 * Create an issue on the target repo.
 */
export function partitionIssueLabels(
  requested: string[],
  available: string[]
): { existing: string[]; missing: string[] } {
  const availableSet = new Set(available.map((label) => label.toLowerCase()));
  return {
    existing: requested.filter((label) => availableSet.has(label.toLowerCase())),
    missing: requested.filter((label) => !availableSet.has(label.toLowerCase())),
  };
}

export async function createIssue(
  owner: string,
  repo: string,
  title: string,
  body: string,
  labels: string[]
): Promise<{ number: number; url: string; skippedLabels: string[] }> {
  const ok = getOctokit();
  let issueLabels = labels;
  let skippedLabels: string[] = [];
  if (labels.length) {
    try {
      const available = await ok.paginate(ok.issues.listLabelsForRepo, {
        owner,
        repo,
        per_page: 100,
      });
      const partitioned = partitionIssueLabels(
        labels,
        available.map((label) => label.name)
      );
      issueLabels = partitioned.existing;
      skippedLabels = partitioned.missing;
      if (skippedLabels.length) {
        console.warn(`  Labels not found in ${owner}/${repo}: ${skippedLabels.join(', ')}`);
      }
    } catch (err) {
      console.warn(`  Could not validate labels for ${owner}/${repo}; using configured labels:`, err);
    }
  }
  const { data } = await ok.issues.create({
    owner,
    repo,
    title,
    body,
    labels: issueLabels,
  });
  return { number: data.number, url: data.html_url, skippedLabels };
}

/**
 * Find an open meta issue by title in the given repo.
 *
 * @param searchTitle - Fully resolved title to search for (placeholders already
 *   substituted by `resolveMetaTitle`).
 * @param expectedHeadings - The tool's category headings (category name or its
 *   `metaIssueHeading`). Used to disambiguate when the title matches several
 *   issues: the broad release meta is the one whose body carries the most of
 *   these `## heading` sections.
 */
export async function findMetaIssue(
  owner: string,
  repo: string,
  searchTitle: string,
  expectedHeadings?: string[]
): Promise<{ number: number; title: string; body: string } | null> {
  const ok = getOctokit();

  const query = `repo:${owner}/${repo} is:issue is:open "${searchTitle}" in:title`;
  const { data } = await ok.search.issuesAndPullRequests({
    q: query,
    per_page: 20,
  });

  if (data.items.length === 0) return null;

  // An exact title match is unambiguous, so it always wins. Quarterly trackers like
  // "[Q2 FY27] [Kib] Core analytics docs" are named exactly and start out nearly
  // empty, so the body heuristics below would otherwise rank a fuller sibling above
  // the right issue.
  const exact = data.items.filter(
    (i) => i.title.trim().toLowerCase() === searchTitle.trim().toLowerCase()
  );
  const candidates = exact.length ? exact : data.items;

  // A title pattern like "Kibana 9.5" can match several open issues: the broad
  // release meta plus narrower trackers that share the version prefix (for
  // example a "Kibana 9.5 - Dashboards and library APIs GA" issue). Blindly
  // taking items[0] let GitHub relevance ranking send checklist entries to the
  // wrong tracker. Rank candidates so the comprehensive release meta wins:
  //   1. most of the tool's expected category headings present as "## heading"
  //   2. most "## " sections overall
  //   3. lowest issue number (the long-lived release meta is usually the oldest)
  const headings = (expectedHeadings ?? []).map((h) => h.toLowerCase());
  const headingMatchCount = (body: string): number => {
    const lower = body.toLowerCase();
    return headings.reduce(
      (n, h) => (new RegExp(`^##\\s+${escapeRegex(h)}\\s*$`, 'm').test(lower) ? n + 1 : n),
      0
    );
  };
  const sectionCount = (body: string): number => (body.match(/^##\s+/gm) ?? []).length;

  const ranked = [...candidates].sort((a, b) => {
    const byHeading = headingMatchCount(b.body ?? '') - headingMatchCount(a.body ?? '');
    if (byHeading !== 0) return byHeading;
    const bySections = sectionCount(b.body ?? '') - sectionCount(a.body ?? '');
    if (bySections !== 0) return bySections;
    return a.number - b.number;
  });

  const item = ranked[0];
  return {
    number: item.number,
    title: item.title,
    body: item.body ?? '',
  };
}

/**
 * Append an issue reference to the meta issue body under the right category section.
 * When `subHeading` is set, the item is routed into (or under a freshly created)
 * `### subHeading` sub-list inside the category section; otherwise it joins the
 * section's flat list, as before.
 */
export async function addToMetaIssue(
  owner: string,
  repo: string,
  metaIssueNumber: number,
  categoryName: string,
  issueUrl: string,
  subHeading?: string
): Promise<void> {
  const ok = getOctokit();

  // Get current body
  const { data: issue } = await ok.issues.get({
    owner,
    repo,
    issue_number: metaIssueNumber,
  });

  const body = insertIntoMetaBody(issue.body ?? '', categoryName, issueUrl, subHeading);

  await ok.issues.update({
    owner,
    repo,
    issue_number: metaIssueNumber,
    body,
  });
}

/**
 * Pure body transform behind {@link addToMetaIssue} (extracted so it can be unit
 * tested without hitting GitHub). Inserts a `- [ ] issueUrl` checklist item under
 * the `## categoryName` section, refreshing the section's `_[Last check: …]_` line.
 * With `subHeading`, the item goes under a `### subHeading` sub-list, created at the
 * end of the section if it doesn't exist yet.
 */
export function insertIntoMetaBody(
  body: string,
  categoryName: string,
  issueUrl: string,
  subHeading?: string,
  today: Date = new Date()
): string {
  const newEntry = `- [ ] ${issueUrl}`;
  const todayStr = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Find the category heading (## Category name), case-insensitively.
  const headingPattern = new RegExp(
    `(## ${escapeRegex(categoryName)}[^\n]*\n)((?:.*\n)*?)(?=\n## |$)`,
    'i'
  );
  const match = body.match(headingPattern);

  if (!match) {
    // Category not found — append it at the end with a "Last check" line.
    const sub = subHeading ? `### ${subHeading}\n` : '';
    return body.trimEnd() + `\n\n## ${categoryName}\n_[Last check: ${todayStr}]_\n${sub}${newEntry}\n`;
  }

  const headingLine = match[1];
  const beforeSection = body.slice(0, (match.index ?? 0) + headingLine.length);
  const afterSection = body.slice((match.index ?? 0) + match[0].length);

  // Update "Last check" date if present, or insert one right after the heading.
  const lastCheckPattern = /_\[Last check: [^\]]*\]_/;
  let section = match[2];
  if (lastCheckPattern.test(section)) {
    section = section.replace(lastCheckPattern, `_[Last check: ${todayStr}]_`);
  } else {
    section = `_[Last check: ${todayStr}]_\n` + section;
  }

  section = subHeading
    ? insertUnderSubHeading(section, subHeading, newEntry)
    : insertAfterLastListItem(section, newEntry);

  return beforeSection + section + afterSection;
}

/** Insert `newEntry` after the last `- ` list item in `section`, or append it. */
function insertAfterLastListItem(section: string, newEntry: string): string {
  const lastListIdx = section
    .trimEnd()
    .split('\n')
    .reduceRight((found, l, i) => (found === -1 && l.trim().startsWith('- ') ? i : found), -1);

  if (lastListIdx >= 0) {
    const lines = section.split('\n');
    lines.splice(lastListIdx + 1, 0, newEntry);
    return lines.join('\n');
  }
  // No list items yet — append after the existing section content.
  return section + newEntry + '\n';
}

/**
 * Route `newEntry` under `### subHeading` within a category section, creating the
 * sub-heading at the end of the section if it's absent. Line-based (rather than
 * regex) so it's robust whether or not sub-lists are separated by blank lines.
 */
function insertUnderSubHeading(section: string, subHeading: string, newEntry: string): string {
  const lines = section.split('\n');
  const isSubHeading = (l: string) => /^###\s/.test(l);
  const isHeading = (l: string) => /^##?#?\s/.test(l); // ## or ### boundary
  const target = subHeading.trim().toLowerCase();

  const headIdx = lines.findIndex(
    (l) => isSubHeading(l) && l.replace(/^###\s+/, '').trim().toLowerCase() === target
  );

  if (headIdx === -1) {
    // Sub-heading not present — create it at the end of the section.
    return `${section.trimEnd()}\n\n### ${subHeading}\n${newEntry}\n`;
  }

  // The sub-block runs until the next ## / ### heading or the end of the section.
  let end = lines.length;
  for (let i = headIdx + 1; i < lines.length; i++) {
    if (isHeading(lines[i])) {
      end = i;
      break;
    }
  }

  // Insert after the last list item in the sub-block, else right after the heading.
  let insertAt = headIdx + 1;
  for (let i = headIdx + 1; i < end; i++) {
    if (lines[i].trim().startsWith('- ')) insertAt = i + 1;
  }

  lines.splice(insertAt, 0, newEntry);
  return lines.join('\n');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Fetch cross-reference events from a PR's timeline and return any issues
 * that reference it from one of the target repos (e.g., elastic/docs-content).
 *
 * GitHub automatically records a `cross-referenced` event on a PR whenever
 * another issue or PR mentions it — so this is more accurate than a text search
 * and doesn't touch the search API rate limit.
 */
export async function findCrossReferencedIssues(
  sourceOwner: string,
  sourceRepo: string,
  prNumber: number,
  targetRepos: string[]   // e.g. ["elastic/docs-content", "elastic/docs-content-internal"]
): Promise<TrackedIssue[]> {
  const ok = getOctokit();
  const found = new Map<number, TrackedIssue>();
  const targetSet = new Set(targetRepos.map((r) => r.toLowerCase()));

  try {
    const { data: events } = await ok.issues.listEventsForTimeline({
      owner: sourceOwner,
      repo: sourceRepo,
      issue_number: prNumber,
      per_page: 100,
    });

    for (const event of events) {
      if (event.event !== 'cross-referenced') continue;

      const src = (event as any).source;
      const issue = src?.issue;
      if (!issue) continue;

      const repoFullName: string = issue.repository?.full_name ?? '';
      if (!targetSet.has(repoFullName.toLowerCase())) continue;

      if (issue.pull_request) continue;

      if (!found.has(issue.number)) {
        found.set(issue.number, {
          number: issue.number,
          url: issue.html_url,
          title: issue.title,
        });
      }
    }
  } catch {
    // Non-critical
  }

  return [...found.values()];
}

// ── GitHub Projects v2 integration ──────────────────────

interface ProjectField {
  id: string;
  name: string;
  dataType: string;
  options?: { id: string; name: string }[];
}

interface ProjectSchema {
  projectId: string;
  fields: ProjectField[];
}

const schemaCache = new Map<string, ProjectSchema>();

/**
 * Fetch the project schema (field IDs + option IDs) via GraphQL.
 * Cached per (org, projectNumber) for the lifetime of the process — keying
 * by project is required when a single run touches more than one project,
 * otherwise the first project's field/option IDs leak into the others.
 */
async function getProjectSchema(org: string, projectNumber: number): Promise<ProjectSchema> {
  const cacheKey = `${org}:${projectNumber}`;
  const cached = schemaCache.get(cacheKey);
  if (cached) return cached;
  const ok = getOctokit();

  const query = `query($org: String!, $number: Int!) {
    organization(login: $org) {
      projectV2(number: $number) {
        id
        fields(first: 50) {
          nodes {
            ... on ProjectV2Field {
              id
              name
              dataType
            }
            ... on ProjectV2SingleSelectField {
              id
              name
              dataType
              options { id name }
            }
            ... on ProjectV2IterationField {
              id
              name
              dataType
            }
          }
        }
      }
    }
  }`;

  const result: any = await ok.graphql(query, { org, number: projectNumber });
  const project = result.organization.projectV2;

  const schema: ProjectSchema = {
    projectId: project.id,
    fields: project.fields.nodes.map((f: any) => ({
      id: f.id,
      name: f.name,
      dataType: f.dataType,
      options: f.options ?? undefined,
    })),
  };

  schemaCache.set(cacheKey, schema);
  return schema;
}

/**
 * Add an issue to a project and return the project item ID.
 */
async function addIssueToProject(projectId: string, issueNodeId: string): Promise<string> {
  const ok = getOctokit();
  const mutation = `mutation($projectId: ID!, $contentId: ID!) {
    addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
      item { id }
    }
  }`;
  const result: any = await ok.graphql(mutation, { projectId, contentId: issueNodeId });
  return result.addProjectV2ItemById.item.id;
}

/**
 * Set a single-select field on a project item.
 */
async function setSelectField(
  projectId: string,
  itemId: string,
  fieldId: string,
  optionId: string
): Promise<void> {
  const ok = getOctokit();
  await ok.graphql(
    `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId, itemId: $itemId,
        fieldId: $fieldId, value: { singleSelectOptionId: $optionId }
      }) { projectV2Item { id } }
    }`,
    { projectId, itemId, fieldId, optionId }
  );
}

/**
 * Set a date field on a project item.
 */
async function setDateField(
  projectId: string,
  itemId: string,
  fieldId: string,
  date: string // ISO date string YYYY-MM-DD
): Promise<void> {
  const ok = getOctokit();
  await ok.graphql(
    `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $date: Date!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId, itemId: $itemId,
        fieldId: $fieldId, value: { date: $date }
      }) { projectV2Item { id } }
    }`,
    { projectId, itemId, fieldId, date }
  );
}

/**
 * Find the option ID for a given field name and option value.
 * Uses fuzzy matching (case-insensitive, startsWith).
 */
function findOption(
  schema: ProjectSchema,
  fieldName: string,
  optionValue: string
): { fieldId: string; optionId: string } | null {
  const field = schema.fields.find(
    (f) => f.name.toLowerCase() === fieldName.toLowerCase() && f.options
  );
  if (!field?.options) return null;

  const lower = optionValue.toLowerCase();
  const option =
    field.options.find((o) => o.name.toLowerCase() === lower) ??
    field.options.find((o) => o.name.toLowerCase().startsWith(lower));
  if (!option) return null;

  return { fieldId: field.id, optionId: option.id };
}

/**
 * Find a date field by name.
 */
function findDateField(schema: ProjectSchema, fieldName: string): string | null {
  const field = schema.fields.find(
    (f) => f.name.toLowerCase() === fieldName.toLowerCase() && f.dataType === 'DATE'
  );
  return field?.id ?? null;
}

export interface ProjectFieldValues {
  /** e.g., "9.4" for Release */
  release?: string;
  /** e.g., "XS", "S", "M" for Size */
  size?: string;
  /** e.g., "P1: High" for Priority */
  priority?: string;
  /** e.g., "DQS" for Requester */
  requester?: string;
  /** e.g., "Kibana core" for Area */
  area?: string;
  /** e.g., "Kib: ES|QL" for Feature */
  feature?: string;
  /** e.g., "Net-new", "Improvement" for Content Type */
  contentType?: string;
  /** YYYY-MM-DD for Serverless-pub */
  serverlessPubDate?: string;
}

export interface ProjectFieldResult {
  ok: boolean;
  /** Why it failed, when ok is false. */
  reason?: 'missing-scope' | 'error';
  /** Human-readable, UI-friendly message. */
  message?: string;
  /** Number of fields successfully set, when ok is true. */
  fieldsSet?: number;
}

/** OAuth scopes the GitHub Project mutations require (read schema + write fields). */
const PROJECT_SCOPE = 'project';

/**
 * Read the classic OAuth scopes carried by the current token, from the
 * `X-OAuth-Scopes` response header. Returns null when scopes can't be
 * determined — e.g. a fine-grained PAT, which doesn't report classic scopes
 * and uses a different permission model.
 */
export async function getTokenScopes(): Promise<string[] | null> {
  try {
    const ok = getOctokit();
    const res = await ok.request('GET /');
    const header = (res.headers as Record<string, string | undefined>)['x-oauth-scopes'];
    if (header == null) return null;
    return String(header)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * Whether the token can read and write GitHub Projects v2.
 * Returns null when it can't be determined (assume OK in that case).
 */
export async function hasProjectScope(): Promise<boolean | null> {
  const scopes = await getTokenScopes();
  if (scopes === null) return null;
  return scopes.includes(PROJECT_SCOPE);
}

/**
 * Startup preflight: warn loudly if project board integration is configured
 * but the token can't write to projects. Turns the otherwise-silent per-issue
 * failure into an actionable banner. Never throws.
 */
export async function preflightProjectScope(projectConfigured: boolean): Promise<void> {
  if (!projectConfigured) return;
  const has = await hasProjectScope();
  if (has !== false) return; // true = OK; null = can't tell, don't cry wolf
  console.warn(
    [
      '',
      '⚠️  GitHub token is missing the `project` scope.',
      '   Issues will still be created, but they will NOT be added to the',
      '   project board or have Area / Size / Priority / Requester / Feature / Release set.',
      '',
      '   Fix it:   gh auth refresh -s project',
      '   Restart:  GITHUB_TOKEN=$(gh auth token) yarn dev',
      '',
    ].join('\n')
  );
}

/**
 * Add an issue to a GitHub Project and set field values.
 * Non-blocking: never throws. Returns a result describing what happened so
 * callers (and the UI) can surface failures instead of swallowing them.
 */
export async function setProjectFields(
  org: string,
  projectNumber: number,
  issueOwner: string,
  issueRepo: string,
  issueNumber: number,
  values: ProjectFieldValues
): Promise<ProjectFieldResult> {
  try {
    const ok = getOctokit();
    const schema = await getProjectSchema(org, projectNumber);

    // Get the issue's node ID
    const { data: issue } = await ok.issues.get({
      owner: issueOwner,
      repo: issueRepo,
      issue_number: issueNumber,
    });
    const issueNodeId = issue.node_id;

    // Add to project
    const itemId = await addIssueToProject(schema.projectId, issueNodeId);
    console.log(`  Added issue #${issueNumber} to project (item: ${itemId.slice(-8)})`);

    // Set fields in parallel
    const ops: Promise<void>[] = [];

    if (values.release) {
      const match = findOption(schema, 'Release', values.release);
      if (match) ops.push(setSelectField(schema.projectId, itemId, match.fieldId, match.optionId));
      else console.warn(`  Release option "${values.release}" not found in project`);
    }

    if (values.size) {
      const match = findOption(schema, 'Size', values.size);
      if (match) ops.push(setSelectField(schema.projectId, itemId, match.fieldId, match.optionId));
      else console.warn(`  Size option "${values.size}" not found in project`);
    }

    if (values.priority) {
      const match = findOption(schema, 'Priority', values.priority);
      if (match) ops.push(setSelectField(schema.projectId, itemId, match.fieldId, match.optionId));
      else console.warn(`  Priority option "${values.priority}" not found in project`);
    }

    if (values.requester) {
      const match = findOption(schema, 'Requester', values.requester);
      if (match) ops.push(setSelectField(schema.projectId, itemId, match.fieldId, match.optionId));
      else console.warn(`  Requester option "${values.requester}" not found in project`);
    }

    if (values.area) {
      const match = findOption(schema, 'Area', values.area);
      if (match) ops.push(setSelectField(schema.projectId, itemId, match.fieldId, match.optionId));
      else console.warn(`  Area option "${values.area}" not found in project`);
    }

    if (values.feature) {
      const match = findOption(schema, 'Feature', values.feature);
      if (match) ops.push(setSelectField(schema.projectId, itemId, match.fieldId, match.optionId));
      else console.warn(`  Feature option "${values.feature}" not found in project`);
    }

    if (values.contentType) {
      const match = findOption(schema, 'Content Type', values.contentType);
      if (match) ops.push(setSelectField(schema.projectId, itemId, match.fieldId, match.optionId));
      else console.warn(`  Content Type option "${values.contentType}" not found in project`);
    }

    if (values.serverlessPubDate) {
      const fieldId = findDateField(schema, 'Serverless-pub');
      if (fieldId) ops.push(setDateField(schema.projectId, itemId, fieldId, values.serverlessPubDate));
      else console.warn(`  Serverless-pub date field not found in project`);
    }

    await Promise.all(ops);
    const count = ops.length;
    console.log(`  Set ${count} project field${count !== 1 ? 's' : ''}`);
    return { ok: true, fieldsSet: count };
  } catch (err) {
    const msg = String(err);
    const isScopeError =
      msg.includes('read:project') || (msg.includes('scope') && msg.includes('project'));
    if (isScopeError) {
      console.warn(
        'Project fields skipped: token missing `project` scope. Fix: gh auth refresh -s project'
      );
      return {
        ok: false,
        reason: 'missing-scope',
        message: 'Token missing `project` scope — run: gh auth refresh -s project',
      };
    }
    console.warn('Failed to set project fields (non-blocking):', err);
    return { ok: false, reason: 'error', message: msg };
  }
}

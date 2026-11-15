import {
  loadNormalizedConfig,
  resolveRouting,
  resolveMetaIssue,
  resolveMetaBucket,
  resolveFeature,
  resolveArea,
  resolveIssueLabels,
} from './config.js';
import { getOctokit, createIssue, addToMetaIssue, findMetaIssue, setProjectFields } from './github.js';
import { resolveMetaTitle } from './fiscal-quarter.js';
import { deriveTriagePriority } from './triage-priority.js';
import { releaseNoteLabelsFromPrLabels } from './doc-work-kind.js';
import { renderIssueBody } from './template.js';
import type { History, HistoryEntry, Queue, QueueItem } from './types.js';

export type CreateFromQueueResult = {
  issue: Awaited<ReturnType<typeof createIssue>>;
  projectFields: Awaited<ReturnType<typeof setProjectFields>> | null;
  title: string;
};

/**
 * Create a docs issue for one queue item, append history, remove from queue.
 * Caller must load config/queue/history and save after one or more calls.
 */
export async function createDocsIssueFromQueueItem(
  item: QueueItem,
  config: ReturnType<typeof loadNormalizedConfig>,
  queue: Queue,
  history: History,
  options: { goodFirstIssue?: boolean } = {}
): Promise<CreateFromQueueResult> {
  const group = config.repos.find((r) => r.id === item.repoId);
  if (!group) {
    throw new Error(
      `No repo group "${item.repoId}" in current config — re-run the scan after changing repos.`
    );
  }

  const primaryCategory = group.categories.find((c) => c.name === item.category);
  const routing = resolveRouting(group, primaryCategory);

  const title = item.userEdits?.title ?? item.suggestedTitle;
  const ok = getOctokit();
  const { data: authUser } = await ok.users.getAuthenticated().catch(() => ({ data: null }));
  const body = renderIssueBody(item, authUser?.login);
  const targetRepo = item.userEdits?.targetRepo ?? `${routing.target.owner}/${routing.target.repo}`;
  const [owner, repo] = targetRepo.split('/');

  const prLabels = item.prs.flatMap((pr) => pr.labels ?? []);
  const labels = resolveIssueLabels(
    routing.issueLabels,
    primaryCategory,
    prLabels,
    Boolean(options.goodFirstIssue)
  );
  const issue = await createIssue(owner, repo, title, body, labels);

  let projectFields: Awaited<ReturnType<typeof setProjectFields>> | null = null;
  if (routing.project) {
    const p = routing.project;
    const versionMatch = item.version?.match(/v?(\d+\.\d+)/);
    const latestMerge = item.prs.map((pr) => pr.mergedAt).filter(Boolean).sort().pop();
    let serverlessPubDate: string | undefined;
    if (latestMerge) {
      const d = new Date(latestMerge);
      d.setDate(d.getDate() + 7);
      const day = d.getDay();
      const diff = day === 0 ? -6 : -(day - 1);
      d.setDate(d.getDate() + diff);
      serverlessPubDate = d.toISOString().split('T')[0];
    }

    const feature = resolveFeature(primaryCategory, prLabels);

    projectFields = await setProjectFields(p.org, p.number, owner, repo, issue.number, {
      release: versionMatch ? versionMatch[1] : undefined,
      size: p.sizeMap?.[item.assessment.effortTag ?? ''] ?? undefined,
      priority:
        item.assessment.triagePriority ??
        deriveTriagePriority(item.assessment, releaseNoteLabelsFromPrLabels(prLabels)).label ??
        p.defaultPriority ??
        undefined,
      requester: p.defaultRequester ?? undefined,
      area: resolveArea(primaryCategory, prLabels, p.defaultArea),
      feature,
      contentType: p.contentTypeMap?.[item.assessment.effortTag ?? ''] ?? undefined,
      serverlessPubDate,
    });
  }

  if (item.version && item.version !== 'unknown') {
    const categoriesToLink = [item.category, ...(item.alsoAppliesTo ?? [])];
    const subHeading = resolveMetaBucket(group, item.prs.flatMap((pr) => pr.labels ?? []));
    const expectedHeadings = group.categories.map((c) => c.metaIssueHeading ?? c.name);
    const metaCache = new Map<string, Awaited<ReturnType<typeof findMetaIssue>>>();
    for (const catName of categoriesToLink) {
      const cat = group.categories.find((c) => c.name === catName);
      const meta = resolveMetaIssue(config.metaIssues, group, cat);
      if (!meta) continue;
      const resolved = resolveMetaTitle(meta.titlePattern, item.version, config.quarterCalendar);
      if (!resolved.ok) {
        console.warn(
          `Skipped meta-issue link for ${catName} ${item.version}: ${resolved.reason} ` +
            `(pattern: "${meta.titlePattern}")`
        );
        continue;
      }
      const cacheKey = `${meta.owner}/${meta.repo}#${resolved.title}`;
      try {
        let found = metaCache.get(cacheKey);
        if (found === undefined) {
          found = await findMetaIssue(meta.owner, meta.repo, resolved.title, expectedHeadings);
          metaCache.set(cacheKey, found);
        }
        if (found) {
          const heading = cat?.metaIssueHeading ?? catName;
          await addToMetaIssue(meta.owner, meta.repo, found.number, heading, issue.url, subHeading);
        } else {
          console.warn(
            `No open meta issue titled "${resolved.title}" in ${meta.owner}/${meta.repo} ` +
              `(version ${item.version}) — create it, or fix the quarterCalendar anchor.`
          );
        }
      } catch (err) {
        console.warn(`Failed to update meta issue for ${catName} ${item.version}:`, err);
      }
    }
  }

  const entry: HistoryEntry = {
    prNumbers: item.prs.map((p) => p.number),
    decision: 'created',
    repoId: item.repoId,
    issueUrl: issue.url,
    issueNumber: issue.number,
    timestamp: new Date().toISOString(),
    version: item.version,
    title,
    session: queue.scannedAt?.split('T')[0],
  };
  history.entries.push(entry);
  queue.items = queue.items.filter((i) => i.id !== item.id);

  return { issue, projectFields, title };
}
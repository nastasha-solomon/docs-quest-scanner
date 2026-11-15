import { Router } from 'express';
import {
  loadConfig,
  loadNormalizedConfig,
  normalizeConfig,
  resolveRouting,
  resolveMetaIssue,
  resolveMetaBucket,
  resolveFeature,
  resolveArea,
  resolveIssueLabels,
  saveConfig,
  loadQueue,
  saveQueue,
  loadHistory,
  saveHistory,
  loadLastRun,
  saveLastRun,
} from '../config.js';
import { getOctokit, createIssue, addToMetaIssue, findMetaIssue, setProjectFields } from '../github.js';
import { resolveMetaTitle } from '../fiscal-quarter.js';
import { runScan, fixAlertingQueue, filterExcludedQueueItems } from '../scanner.js';
import { deriveDocWorkKind, releaseNoteLabelsFromPrLabels } from '../doc-work-kind.js';
import { deriveDocSurface } from '../doc-surface.js';
import { collectItemStackMinors } from '../release-version.js';
import { renderIssueBody, clearTemplateCache } from '../template.js';
import type { HistoryEntry, QueueItem } from '../types.js';

export const apiRouter = Router();

// ── User ───────────────────────────────────────────────

apiRouter.get('/user', (_req, res, next) => {
  const ok = getOctokit();
  ok.users.getAuthenticated()
    .then(({ data }) => {
      res.json({ login: data.login, name: data.name, avatarUrl: data.avatar_url });
    })
    .catch((err: unknown) => {
      console.warn('Failed to fetch user:', err instanceof Error ? err.message : err);
      res.json({ login: null, avatarUrl: null });
    });
});

// ── Config ──────────────────────────────────────────────

apiRouter.get('/config', (_req, res) => {
  res.json(loadConfig());
});

apiRouter.put('/config', (req, res) => {
  try {
    saveConfig(req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

// ── Queue ───────────────────────────────────────────────

apiRouter.get('/queue', (_req, res) => {
  const loaded = loadQueue();
  const config = loadNormalizedConfig();
  const defaultRepoId = config.repos[0]?.id;
  let storedItems = fixAlertingQueue(loaded.items);
  storedItems = filterExcludedQueueItems(storedItems, config.repos, defaultRepoId);
  if (
    storedItems.length !== loaded.items.length ||
    storedItems.some((item, i) => item.category !== loaded.items[i]?.category)
  ) {
    saveQueue({ ...loaded, items: storedItems });
  }
  const queue = { ...loaded, items: storedItems };
  const groupById = new Map(config.repos.map((g) => [g.id, g]));

  // Union of every selectable target repo across groups (target + cross-ref repos),
  // for the per-issue target dropdown.
  const targetOptions = [
    ...new Set(
      config.repos.flatMap((g) => [
        `${g.target.owner}/${g.target.repo}`,
        ...(g.crossRefRepos ?? []),
        ...g.categories.flatMap((c) => (c.target ? [`${c.target.owner}/${c.target.repo}`] : [])),
      ])
    ),
  ];

  // Re-render bodies and attach each item's resolved routing (transient — not persisted)
  // so the UI can show source/target/project without reading the legacy config shape.
  const versionPattern =
    config.repos[0]?.versionLabelPattern ?? loadConfig().versionLabelPattern ?? '^v\\d+\\.\\d+\\.\\d+$';

  const items = queue.items.map((item) => {
    let suggestedBody: string;
    try {
      suggestedBody = renderIssueBody(item);
    } catch {
      suggestedBody = '(template rendering failed)';
    }
    const group = groupById.get(item.repoId);
    const routing = group
      ? resolveRouting(group, group.categories.find((c) => c.name === item.category))
      : undefined;
    const prLabels = item.prs.flatMap((p) => p.labels ?? []);
    const docWork = deriveDocWorkKind(item.assessment, releaseNoteLabelsFromPrLabels(prLabels));
    const docSurface = deriveDocSurface(item.assessment, item.prs);
    return {
      ...item,
      suggestedBody,
      resolvedTarget: routing ? `${routing.target.owner}/${routing.target.repo}` : undefined,
      repoLabel: group?.label ?? group?.id,
      projectNumber: routing?.project?.number,
      stackMinors: collectItemStackMinors(item, versionPattern),
      docWorkKind: docWork.kind,
      docWorkKindSource: docWork.source,
      docSurface: docSurface.surface,
      docSurfaceSource: docSurface.source,
    };
  });

  res.json({
    ...queue,
    items,
    targetOptions,
    filterMeta: {
      focusStackReleases: loadConfig().focusStackReleases ?? [],
      versionLabelPattern: versionPattern,
    },
  });
});

/** Update user edits for a queue item */
apiRouter.patch('/queue/:id', (req, res) => {
  const queue = loadQueue();
  const item = queue.items.find((i) => i.id === req.params.id);
  if (!item) {
    res.status(404).json({ error: 'Queue item not found' });
    return;
  }

  item.userEdits = { ...item.userEdits, ...req.body.userEdits };

  // Re-render the issue body with new edits
  if (req.body.suggestedTitle) item.suggestedTitle = req.body.suggestedTitle;
  item.suggestedBody = renderIssueBody(item);

  saveQueue(queue);
  res.json(item);
});

// ── Scan ────────────────────────────────────────────────

apiRouter.post('/scan', async (_req, res) => {
  try {
    const queue = await runScan();

    // Render bodies
    for (const item of queue.items) {
      item.suggestedBody = renderIssueBody(item);
    }
    saveQueue(queue);

    res.json(queue);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** Mark the current scan as complete — advances the last_run date */
apiRouter.post('/scan/complete', (_req, res) => {
  const queue = loadQueue();
  if (!queue.scannedAt) {
    res.status(400).json({ error: 'No scan has been run yet' });
    return;
  }

  const date = queue.scannedAt.split('T')[0];
  // The scan covered every configured group, so advance each group's date.
  // Keep the legacy global lastRunDate as a fallback for any newly added group.
  const prev = loadLastRun() ?? {};
  const byRepo = { ...(prev.byRepo ?? {}) };
  for (const group of loadNormalizedConfig().repos) {
    byRepo[group.id] = date;
  }
  saveLastRun({ lastRunDate: date, byRepo });

  res.json({ ok: true, lastRunDate: date });
});

apiRouter.get('/last-run', (_req, res) => {
  res.json(loadLastRun() ?? { lastRunDate: null });
});

// ── History ─────────────────────────────────────────────

apiRouter.get('/history', (_req, res) => {
  res.json(loadHistory());
});

// ── Create issue ────────────────────────────────────────

apiRouter.post('/create-issue', async (req, res) => {
  try {
    const { queueItemId, goodFirstIssue } = req.body;
    const config = loadNormalizedConfig();
    const queue = loadQueue();
    const history = loadHistory();

    const item = queue.items.find((i) => i.id === queueItemId);
    if (!item) {
      res.status(404).json({ error: 'Queue item not found' });
      return;
    }

    // Resolve the repo group this item belongs to. Fail loudly rather than
    // mis-route if the config changed since the scan.
    const group = config.repos.find((r) => r.id === item.repoId);
    if (!group) {
      res.status(409).json({
        error: `No repo group "${item.repoId}" in current config — re-run the scan after changing repos.`,
      });
      return;
    }

    // Resolve routing: a category override (target/project) wins over the group
    // default. The primary category decides where the issue is filed.
    const primaryCategory = group.categories.find((c) => c.name === item.category);
    const routing = resolveRouting(group, primaryCategory);

    const title = item.userEdits?.title ?? item.suggestedTitle;
    const ok = getOctokit();
    const { data: authUser } = await ok.users.getAuthenticated().catch(() => ({ data: null }));
    const body = renderIssueBody(item, authUser?.login);
    // Target repo stays a UI choice: the dropdown wins, defaulting to the resolved
    // target. It only changes where the issue is filed — project/meta follow routing.
    const targetRepo = item.userEdits?.targetRepo ?? `${routing.target.owner}/${routing.target.repo}`;
    const [owner, repo] = targetRepo.split('/');

    // Create the issue
    const prLabels = item.prs.flatMap((pr) => pr.labels ?? []);
    const labels = resolveIssueLabels(
      routing.issueLabels,
      primaryCategory,
      prLabels,
      Boolean(goodFirstIssue)
    );
    const issue = await createIssue(owner, repo, title, body, labels);

    // Try to set project fields
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

      // Feature: a per-label override (featureByLabel) wins over the category's
      // feature, so a category that bundles teams still routes each correctly.
      const feature = resolveFeature(primaryCategory, prLabels);

      projectFields = await setProjectFields(
        p.org,
        p.number,
        owner,
        repo,
        issue.number,
        {
          release: versionMatch ? versionMatch[1] : undefined,
          size: p.sizeMap?.[item.assessment.effortTag ?? ''] ?? undefined,
          priority: p.defaultPriority ?? undefined,
          requester: p.defaultRequester ?? undefined,
          area: resolveArea(primaryCategory, prLabels, p.defaultArea),
          feature,
          contentType: p.contentTypeMap?.[item.assessment.effortTag ?? ''] ?? undefined,
          serverlessPubDate,
        }
      );
    }

    // Link the created issue into the meta-issue checklist(s) for its version.
    // Each category can override the global meta-issue config (issue #2), so the
    // primary category and any also-applies categories may resolve to different
    // checklists. Categories without an override share the global config.
    if (item.version && item.version !== 'unknown') {
      const categoriesToLink = [item.category, ...(item.alsoAppliesTo ?? [])];
      // Route into a "Notable changes" / "Fixes and clarifications" sub-list based
      // on the item's release-note labels (undefined when sub-lists are disabled).
      const subHeading = resolveMetaBucket(group, item.prs.flatMap((pr) => pr.labels ?? []));
      // The tool's category headings, used to disambiguate when a version title
      // pattern matches several issues (release meta vs. a narrower tracker).
      const expectedHeadings = group.categories.map((c) => c.metaIssueHeading ?? c.name);
      // Cache meta-issue lookups by resolved location so categories sharing a
      // checklist don't trigger duplicate searches. Value `null` = not found.
      const metaCache = new Map<string, Awaited<ReturnType<typeof findMetaIssue>>>();
      for (const catName of categoriesToLink) {
        const cat = group.categories.find((c) => c.name === catName);
        const meta = resolveMetaIssue(config.metaIssues, group, cat);
        if (!meta) continue; // no meta issue resolved → not linked
        // A meta issue can live outside the group's target repo (for example a
        // quarterly planning tracker in an internal repo).
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

    // Record in history
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
    saveHistory(history);

    // Remove from queue
    queue.items = queue.items.filter((i) => i.id !== queueItemId);
    saveQueue(queue);

    res.json({ ok: true, issue, projectFields });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Dismiss ─────────────────────────────────────────────

apiRouter.post('/dismiss', (req, res) => {
  const { queueItemId, reason } = req.body;
  const config = loadConfig();
  const queue = loadQueue();
  const history = loadHistory();

  const item = queue.items.find((i) => i.id === queueItemId);
  if (!item) {
    res.status(404).json({ error: 'Queue item not found' });
    return;
  }

  const entry: HistoryEntry = {
    prNumbers: item.prs.map((p) => p.number),
    decision: 'dismissed',
    repoId: item.repoId,
    reason: reason ?? 'no docs needed',
    timestamp: new Date().toISOString(),
    version: item.version,
    title: item.userEdits?.title ?? item.suggestedTitle,
    session: queue.scannedAt?.split('T')[0],
  };
  history.entries.push(entry);
  saveHistory(history);

  queue.items = queue.items.filter((i) => i.id !== queueItemId);
  saveQueue(queue);

  res.json({ ok: true });
});

// ── Undo dismiss ────────────────────────────────────────

apiRouter.post('/undo-dismiss', (req, res) => {
  const { prNumbers } = req.body;
  const history = loadHistory();

  const idx = history.entries.findIndex(
    (e) =>
      e.decision === 'dismissed' &&
      e.prNumbers.length === prNumbers.length &&
      e.prNumbers.every((n: number) => prNumbers.includes(n))
  );

  if (idx === -1) {
    res.status(404).json({ error: 'History entry not found' });
    return;
  }

  history.entries.splice(idx, 1);
  saveHistory(history);

  res.json({ ok: true, message: 'Dismissed entry removed. Re-scan to pick up these PRs again.' });
});

// ── Meta issue detection ────────────────────────────────

/**
 * Look up the meta issue for a version (?version=v9.4.0). Categories can resolve to
 * different trackers, so pass ?category= to check a specific one; without it, the
 * group default is used.
 */
apiRouter.get('/meta-issue', async (req, res) => {
  try {
    const version = req.query.version as string;
    if (!version) {
      res.status(400).json({ error: 'version query param required (e.g., ?version=v9.4.0)' });
      return;
    }
    const config = loadNormalizedConfig();
    const repoId = req.query.repoId as string | undefined;
    const group = (repoId && config.repos.find((r) => r.id === repoId)) || config.repos[0];
    const categoryName = req.query.category as string | undefined;
    const category = categoryName
      ? group.categories.find((c) => c.name === categoryName)
      : undefined;
    const target = resolveMetaIssue(config.metaIssues, group, category);
    if (!target) {
      res.json({ number: null, reason: 'no meta issue configured' });
      return;
    }
    const resolved = resolveMetaTitle(target.titlePattern, version, config.quarterCalendar);
    if (!resolved.ok) {
      res.json({ number: null, reason: resolved.reason });
      return;
    }
    const expectedHeadings = group.categories.map((c) => c.metaIssueHeading ?? c.name);
    const meta = await findMetaIssue(target.owner, target.repo, resolved.title, expectedHeadings);
    res.json(meta ?? { number: null, reason: `no open issue titled "${resolved.title}"` });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Template ────────────────────────────────────────────

apiRouter.post('/clear-template-cache', (_req, res) => {
  clearTemplateCache();
  res.json({ ok: true });
});

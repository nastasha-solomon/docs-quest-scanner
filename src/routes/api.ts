import { Router } from 'express';
import {
  loadConfig,
  loadNormalizedConfig,
  normalizeConfig,
  resolveRouting,
  resolveMetaIssue,
  saveConfig,
  loadQueue,
  saveQueue,
  loadHistory,
  saveHistory,
  loadLastRun,
  saveLastRun,
} from '../config.js';
import { getOctokit } from '../github.js';
import { createDocsIssueFromQueueItem } from '../create-from-queue.js';
import { runScan, fixAlertingQueue, filterExcludedQueueItems } from '../scanner.js';
import { deriveDocWorkKind, releaseNoteLabelsFromPrLabels } from '../doc-work-kind.js';
import { deriveDocSurface } from '../doc-surface.js';
import { deriveTriagePriority } from '../triage-priority.js';
import { collectItemStackMinors, uniqueStackMinorsFromItems } from '../release-version.js';
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
    const releaseNotes = releaseNoteLabelsFromPrLabels(prLabels);
    const docWork = deriveDocWorkKind(item.assessment, releaseNotes);
    const docSurface = deriveDocSurface(item.assessment, item.prs);
    const triagePriority = deriveTriagePriority(item.assessment, releaseNotes);
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
      triagePriorityLevel: triagePriority.level,
      triagePriorityLabel: triagePriority.label,
      triagePrioritySource: triagePriority.source,
    };
  });

  const rawConfig = loadConfig();
  const lastRun = loadLastRun();
  const manualFocus = rawConfig.focusStackReleases ?? [];
  const queueMinors = uniqueStackMinorsFromItems(queue.items, versionPattern);
  let focusStackReleases = manualFocus;
  let focusAuto = false;
  if (rawConfig.autoFocusStackReleases) {
    focusStackReleases = queueMinors.slice(0, 2);
    focusAuto = true;
  }

  res.json({
    ...queue,
    items,
    targetOptions,
    filterMeta: {
      focusStackReleases,
      focusAuto,
      focusCategories: rawConfig.focusCategories ?? [],
      versionLabelPattern: versionPattern,
      lastScanAt: queue.scannedAt || lastRun?.lastRunDate || null,
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

    const { issue, projectFields } = await createDocsIssueFromQueueItem(
      item,
      config,
      queue,
      history,
      { goodFirstIssue: Boolean(goodFirstIssue) }
    );
    saveHistory(history);
    saveQueue(queue);

    res.json({ ok: true, issue, projectFields });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('No repo group')) {
      res.status(409).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

/** Create docs issues for multiple queue items (sequential; stops on first hard failure). */
apiRouter.post('/create-issues', async (req, res) => {
  try {
    const { queueItemIds, goodFirstIssue } = req.body ?? {};
    if (!Array.isArray(queueItemIds) || queueItemIds.length === 0) {
      res.status(400).json({ error: 'queueItemIds must be a non-empty array' });
      return;
    }

    const config = loadNormalizedConfig();
    const queue = loadQueue();
    const history = loadHistory();

    const created: Array<{
      queueItemId: string;
      issue: Awaited<ReturnType<typeof createDocsIssueFromQueueItem>>['issue'];
      projectFields: Awaited<ReturnType<typeof createDocsIssueFromQueueItem>>['projectFields'];
      title: string;
    }> = [];
    const failed: Array<{ queueItemId: string; error: string }> = [];

    for (const queueItemId of queueItemIds) {
      const item = queue.items.find((i) => i.id === queueItemId);
      if (!item) {
        failed.push({ queueItemId, error: 'Queue item not found' });
        continue;
      }
      try {
        const result = await createDocsIssueFromQueueItem(item, config, queue, history, {
          goodFirstIssue: Boolean(goodFirstIssue),
        });
        created.push({
          queueItemId,
          issue: result.issue,
          projectFields: result.projectFields,
          title: result.title,
        });
      } catch (err) {
        failed.push({ queueItemId, error: String(err) });
      }
    }

    saveHistory(history);
    saveQueue(queue);

    res.json({ ok: true, created, failed });
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

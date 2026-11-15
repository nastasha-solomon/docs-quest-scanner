/** @typedef {import('../types.js').QueueItem} QueueItem */

const DAY_MS = 86_400_000;

/**
 * @param {QueueItem} item
 * @returns {number | null}
 */
export function itemLatestMergedAtMs(item) {
  const dates = (item.prs ?? []).map((p) => p.mergedAt).filter(Boolean);
  if (!dates.length) return null;
  return Math.max(...dates.map((d) => Date.parse(d)));
}

/**
 * Local-calendar start of day for an ISO date string (yyyy-mm-dd).
 * @param {string} yyyyMmDd
 */
export function startOfLocalDayMs(yyyyMmDd) {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  if (!y || !m || !d) return NaN;
  return new Date(y, m - 1, d).getTime();
}

/** Inclusive end of local calendar day. @param {string} yyyyMmDd */
export function endOfLocalDayMs(yyyyMmDd) {
  const start = startOfLocalDayMs(yyyyMmDd);
  if (Number.isNaN(start)) return NaN;
  return start + DAY_MS - 1;
}

/**
 * @param {'all' | '7d' | '30d' | '90d' | 'since-scan' | 'custom'} filter
 * @param {{
 *   customFrom?: string;
 *   customTo?: string;
 *   sinceScanAt?: string | null;
 *   now?: number;
 * }} opts
 * @returns {{ startMs?: number; endMs?: number } | null}
 */
export function mergeFilterWindow(filter, opts = {}) {
  if (filter === 'all') return null;

  const now = opts.now ?? Date.now();

  if (filter === '7d' || filter === '30d' || filter === '90d') {
    const days = filter === '7d' ? 7 : filter === '30d' ? 30 : 90;
    return { startMs: now - days * DAY_MS, endMs: now };
  }

  if (filter === 'since-scan') {
    const raw = opts.sinceScanAt;
    if (!raw) return null;
    const scanMs = Date.parse(raw);
    if (Number.isNaN(scanMs)) return null;
    return { startMs: scanMs, endMs: now };
  }

  if (filter === 'custom') {
    const from = opts.customFrom?.trim();
    const to = opts.customTo?.trim();
    if (!from && !to) return null;
    /** @type {{ startMs?: number; endMs?: number }} */
    const window = { endMs: now };
    if (from) {
      const startMs = startOfLocalDayMs(from);
      if (!Number.isNaN(startMs)) window.startMs = startMs;
    }
    if (to) {
      const endMs = endOfLocalDayMs(to);
      if (!Number.isNaN(endMs)) window.endMs = endMs;
    }
    return window;
  }

  return null;
}

/**
 * @param {QueueItem} item
 * @param {'all' | '7d' | '30d' | '90d' | 'since-scan' | 'custom'} filter
 * @param {Parameters<typeof mergeFilterWindow>[1]} opts
 */
export function itemMatchesMergeFilter(item, filter, opts = {}) {
  const window = mergeFilterWindow(filter, opts);
  if (!window) return true;

  const mergedMs = itemLatestMergedAtMs(item);
  if (mergedMs == null) return false;

  if (window.startMs != null && mergedMs < window.startMs) return false;
  if (window.endMs != null && mergedMs > window.endMs) return false;
  return true;
}

/**
 * @param {QueueItem[]} items
 * @param {'all' | '7d' | '30d' | '90d' | 'since-scan' | 'custom'} preset
 * @param {Parameters<typeof mergeFilterWindow>[1]} opts
 */
export function countItemsForMergePreset(items, preset, opts = {}) {
  if (preset === 'all') return items.length;
  return items.filter((item) => itemMatchesMergeFilter(item, preset, opts)).length;
}
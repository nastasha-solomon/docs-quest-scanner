import type { PullRequest, QueueItem } from './types.js';

const DEFAULT_VERSION_PATTERN = '^v\\d+\\.\\d+\\.\\d+$';

/** Major.minor stack release, e.g. `v9.6.0` or `9.6` → `9.6`. */
export function stackMinorFromVersionLabel(label: string): string | null {
  const m = label.match(/^v?(\d+)\.(\d+)(?:\.\d+)?$/i);
  if (!m) return null;
  return `${m[1]}.${m[2]}`;
}

/** All stack minors for a queue item (from `item.version` and matching PR labels). */
export function collectItemStackMinors(
  item: QueueItem,
  versionLabelPattern: string = DEFAULT_VERSION_PATTERN
): string[] {
  const re = new RegExp(versionLabelPattern);
  const set = new Set<string>();
  if (item.version && item.version !== 'unknown' && re.test(item.version)) {
    const mm = stackMinorFromVersionLabel(item.version);
    if (mm) set.add(mm);
  }
  for (const pr of item.prs) {
    for (const label of pr.labels ?? []) {
      if (!re.test(label)) continue;
      const mm = stackMinorFromVersionLabel(label);
      if (mm) set.add(mm);
    }
  }
  return [...set].sort(compareStackMinors);
}

export function itemMatchesStackMinor(
  item: QueueItem,
  stackMinor: string,
  versionLabelPattern?: string
): boolean {
  return collectItemStackMinors(item, versionLabelPattern).includes(stackMinor);
}

export function compareStackMinors(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 2; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Unique stack minors across the queue, newest first. */
export function uniqueStackMinorsFromItems(
  items: QueueItem[],
  versionLabelPattern?: string
): string[] {
  const set = new Set<string>();
  for (const item of items) {
    for (const mm of collectItemStackMinors(item, versionLabelPattern)) set.add(mm);
  }
  return [...set].sort(compareStackMinors).reverse();
}
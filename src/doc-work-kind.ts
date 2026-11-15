import type { Assessment, DocsGapEntry } from './types.js';

export type DocWorkKind = 'new' | 'update' | 'unknown';
export type DocWorkKindSource = 'enriched' | 'heuristic' | 'none';

const NEW_PAGE_ACTIONS = new Set<DocsGapEntry['actionType']>(['create-how-to', 'create-overview']);

/**
 * Classify doc work as net-new vs updating existing pages.
 * Enrichment (`effortTag` / `docsGap.actionType`) wins; release-note heuristics are fallbacks.
 */
export function deriveDocWorkKind(
  assessment: Assessment,
  releaseNoteLabels?: string[]
): { kind: DocWorkKind; source: DocWorkKindSource } {
  if (assessment.effortTag === 'new-content') {
    return { kind: 'new', source: 'enriched' };
  }
  if (assessment.effortTag === 'update' || assessment.effortTag === 'quick-fix') {
    return { kind: 'update', source: 'enriched' };
  }

  const gaps = assessment.docsGap ?? [];
  if (gaps.length > 0) {
    if (gaps.some((g) => g.actionType && NEW_PAGE_ACTIONS.has(g.actionType))) {
      return { kind: 'new', source: 'enriched' };
    }
    if (gaps.some((g) => g.actionType === 'add-section')) {
      return { kind: 'new', source: 'enriched' };
    }
    if (gaps.some((g) => g.actionType === 'update-existing' || g.actionType === 'review-only')) {
      return { kind: 'update', source: 'enriched' };
    }
  }

  const lower = (releaseNoteLabels ?? []).map((l) => l.toLowerCase());
  if (lower.includes('release_note:feature')) {
    return { kind: 'new', source: 'heuristic' };
  }
  if (
    lower.some((l) =>
      ['release_note:breaking', 'release_note:deprecation', 'release_note:enhancement'].includes(l)
    )
  ) {
    return { kind: 'update', source: 'heuristic' };
  }

  if (assessment.needsDocs === 'no' && !gaps.length && !assessment.effortTag) {
    return { kind: 'unknown', source: 'none' };
  }

  return { kind: 'unknown', source: 'none' };
}

/** Collect release_note:* labels from PR label lists. */
export function releaseNoteLabelsFromPrLabels(prLabels: string[]): string[] {
  return prLabels.filter((l) => l.toLowerCase().startsWith('release_note:'));
}
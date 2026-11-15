import type { Assessment } from './types.js';

export type TriagePriorityLevel = 'P0' | 'P1' | 'P2' | 'P3';
export type TriagePrioritySource = 'enriched' | 'heuristic' | 'none';

/** Parse P0–P3 from a GitHub Projects Priority field value or enrichment string. */
export function parsePriorityLevel(value: string): TriagePriorityLevel | null {
  const m = value.trim().match(/^(P[0-3])\b/i);
  if (!m) return null;
  return m[1].toUpperCase() as TriagePriorityLevel;
}

/**
 * Classify triage urgency for queue filters and project defaults.
 * Enrichment `assessment.triagePriority` wins; release-note heuristics are fallback.
 */
export function deriveTriagePriority(
  assessment: Assessment,
  releaseNoteLabels?: string[]
): { level: TriagePriorityLevel | null; label: string | null; source: TriagePrioritySource } {
  if (assessment.triagePriority) {
    const level = parsePriorityLevel(assessment.triagePriority);
    return {
      level,
      label: assessment.triagePriority,
      source: 'enriched',
    };
  }

  if (assessment.needsDocs === 'no' && !assessment.docsGap?.length) {
    return { level: null, label: null, source: 'none' };
  }

  const lower = (releaseNoteLabels ?? []).map((l) => l.toLowerCase());
  const needs = assessment.needsDocs;

  if (lower.includes('release_note:breaking') || lower.includes('release_note:deprecation')) {
    if (needs === 'yes') {
      return { level: 'P0', label: defaultLabelForLevel('P0'), source: 'heuristic' };
    }
    if (needs === 'check') {
      return { level: 'P1', label: defaultLabelForLevel('P1'), source: 'heuristic' };
    }
  }

  if (lower.includes('release_note:feature')) {
    if (needs === 'yes') {
      const level: TriagePriorityLevel =
        assessment.effortTag === 'new-content' ? 'P1' : 'P2';
      return { level, label: defaultLabelForLevel(level), source: 'heuristic' };
    }
    if (needs === 'check') {
      return { level: 'P2', label: defaultLabelForLevel('P2'), source: 'heuristic' };
    }
  }

  if (lower.includes('release_note:enhancement')) {
    if (needs === 'yes' || needs === 'check') {
      return { level: 'P2', label: defaultLabelForLevel('P2'), source: 'heuristic' };
    }
  }

  if (needs === 'yes') {
    if (assessment.effortTag === 'new-content') {
      return { level: 'P1', label: defaultLabelForLevel('P1'), source: 'heuristic' };
    }
    return { level: 'P2', label: defaultLabelForLevel('P2'), source: 'heuristic' };
  }

  if (needs === 'check') {
    return { level: 'P3', label: defaultLabelForLevel('P3'), source: 'heuristic' };
  }

  return { level: null, label: null, source: 'none' };
}

/** Display / project labels when enrichment did not set an exact option string. */
function defaultLabelForLevel(level: TriagePriorityLevel): string {
  switch (level) {
    case 'P0':
      return 'P0: Critical';
    case 'P1':
      return 'P1: High';
    case 'P2':
      return 'P2 (Important)';
    case 'P3':
      return 'P3: Low';
    default:
      return level;
  }
}
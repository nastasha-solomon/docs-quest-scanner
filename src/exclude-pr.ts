import { hasMatchingConfiguredLabel } from './release-note-labels.js';
import type { PullRequest, RepoGroup } from './types.js';

export function matchesExcludeTitlePattern(title: string, patterns: readonly string[]): boolean {
  if (!patterns.length) return false;
  return patterns.some((pattern) => {
    try {
      return new RegExp(pattern).test(title);
    } catch {
      return false;
    }
  });
}

/** True when this PR should never enter the triage queue for this repo group. */
export function shouldExcludePullRequest(pr: PullRequest, group: RepoGroup): boolean {
  const labels = pr.labels ?? [];
  if (group.excludeLabels?.length && hasMatchingConfiguredLabel(labels, group.excludeLabels)) {
    return true;
  }
  if (group.excludeTitlePatterns?.length && matchesExcludeTitlePattern(pr.title, group.excludeTitlePatterns)) {
    return true;
  }
  return false;
}
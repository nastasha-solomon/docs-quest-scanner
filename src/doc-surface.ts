import type { Assessment, PullRequest } from './types.js';

export type DocSurface = 'api-only' | 'guides' | 'mixed' | 'unknown';
export type DocSurfaceSource = 'enriched' | 'heuristic' | 'none';

const API_DOC_URL =
  /\/docs\/api\/(?:doc\/)?|\/docs\/api\b|elastic\.co\/docs\/api\/doc\//i;
const GUIDE_DOC_URL =
  /\/docs\/(?:solutions|explore-analyze|get-started|deploy-manage|tutorials)\//i;
const REFERENCE_NON_API = /\/docs\/reference\/(?!.*\/api\/)/i;

const API_GAP_HINT =
  /\b(api reference|openapi|operation\/|generated from the openapi|wire shape unchanged)\b/i;
const GUIDE_GAP_HINT =
  /\b(how-to|user-facing|ui\b|kibana ui|management (?:page|table|screen))\b/i;

const SERVER_RE = /\/(server|common)\//;
const PUBLIC_RE = /\/public\//;
const TEST_RE =
  /(\.test\.|\.mock\.|__snapshots__|\/test\/|^test\/|scout)/i;

function isApiDocUrl(url: string): boolean {
  if (!url) return false;
  return API_DOC_URL.test(url);
}

function isGuideDocUrl(url: string): boolean {
  if (!url) return false;
  if (isApiDocUrl(url)) return false;
  return GUIDE_DOC_URL.test(url) || REFERENCE_NON_API.test(url);
}

function hasPublicUiChange(prs: PullRequest[]): boolean {
  const files = prs.flatMap((p) => p.changedFiles ?? []).filter((f) => !TEST_RE.test(f));
  if (!files.length) return false;
  return files.some((f) => PUBLIC_RE.test(f));
}

/** PR body says new HTTP routes are internal / not public yet (no published API ref to update). */
function prDescribesInternalApi(prs: PullRequest[]): boolean {
  const text = prs.map((p) => `${p.title}\n${p.body}`).join('\n');
  return (
    /access:\s*['"]internal['"]/i.test(text) ||
    /\bnot public yet\b/i.test(text) ||
    /\broutes are internal\b/i.test(text) ||
    /\binternal for now\b/i.test(text)
  );
}

/** Enrichment marked review-only gaps with no writer action because routes are still internal. */
function gapsAreInternalApiPending(assessment: Assessment): boolean {
  const gaps = assessment.docsGap ?? [];
  if (!gaps.length) return false;
  return gaps.every(
    (g) =>
      g.actionType === 'review-only' &&
      /\b(internal|not public|no action now|absent from the public)\b/i.test(g.gap)
  );
}

function prLooksApiRouteOnly(prs: PullRequest[]): boolean {
  const text = prs.map((p) => `${p.title}\n${p.body}`).join('\n');
  const hasRoute = /\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/api\//i.test(text) || /\/api\/[\w/_-]+/i.test(text);
  if (!hasRoute) return false;
  const files = prs.flatMap((p) => p.changedFiles ?? []).filter((f) => !TEST_RE.test(f));
  if (!files.length) return hasRoute;
  const product = files.filter((f) => !/\.mdx?$/.test(f));
  if (!product.length) return hasRoute;
  return product.every((f) => SERVER_RE.test(f) && !PUBLIC_RE.test(f));
}

/**
 * Whether doc work targets API reference (OpenAPI / REST) only — not guides or UI how-tos.
 */
export function deriveDocSurface(assessment: Assessment, prs: PullRequest[]): {
  surface: DocSurface;
  source: DocSurfaceSource;
} {
  if (gapsAreInternalApiPending(assessment)) {
    return { surface: 'unknown', source: 'none' };
  }

  const gaps = assessment.docsGap ?? [];
  const docUrls = [
    ...gaps.map((g) => g.pageUrl).filter(Boolean),
    ...(assessment.existingDocs ?? []),
  ];

  let apiUrls = 0;
  let guideUrls = 0;
  for (const url of docUrls) {
    if (isApiDocUrl(url)) apiUrls++;
    else if (isGuideDocUrl(url)) guideUrls++;
  }

  let apiGaps = 0;
  let guideGaps = 0;
  for (const g of gaps) {
    const gapText = `${g.gap} ${g.pageTitle}`;
    if (g.pageUrl && isApiDocUrl(g.pageUrl)) apiGaps++;
    else if (g.pageUrl && isGuideDocUrl(g.pageUrl)) guideGaps++;
    else if (!g.pageUrl && API_GAP_HINT.test(gapText) && !GUIDE_GAP_HINT.test(gapText)) apiGaps++;
    else if (GUIDE_GAP_HINT.test(gapText) || (g.actionType && ['create-how-to', 'create-overview'].includes(g.actionType))) {
      guideGaps++;
    }
  }

  if (apiUrls + guideUrls > 0 || apiGaps + guideGaps > 0) {
    if ((apiUrls > 0 || apiGaps > 0) && guideUrls === 0 && guideGaps === 0) {
      return { surface: 'api-only', source: 'enriched' };
    }
    if (guideUrls > 0 || guideGaps > 0) {
      if (apiUrls > 0 || apiGaps > 0) return { surface: 'mixed', source: 'enriched' };
      return { surface: 'guides', source: 'enriched' };
    }
  }

  if (assessment.prefiltered === 'server-only') {
    return { surface: 'unknown', source: 'none' };
  }

  if (
    prs.length &&
    prLooksApiRouteOnly(prs) &&
    !hasPublicUiChange(prs) &&
    !prDescribesInternalApi(prs)
  ) {
    if (assessment.needsDocs === 'yes' || assessment.needsDocs === 'check') {
      return { surface: 'api-only', source: 'heuristic' };
    }
  }

  return { surface: 'unknown', source: 'none' };
}
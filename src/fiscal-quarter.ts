import type { QuarterCalendar } from './types.js';

/** A point on the fiscal calendar: Q`quarter` FY`fiscalYear`. */
export interface FiscalQuarter {
  /** 1-4. */
  quarter: number;
  /** Two-digit fiscal year, e.g. 27 for FY27. */
  fiscalYear: number;
}

/** Outcome of a derivation: the quarter, or why it could not be derived. */
export type QuarterResult =
  | { ok: true; value: FiscalQuarter }
  | { ok: false; reason: string };

interface ParsedVersion {
  major: number;
  minor: number;
}

/** Parse "9.6", "v9.6", or "v9.6.0" into major/minor. Returns null if unparseable. */
export function parseVersion(version: string): ParsedVersion | null {
  const m = version.match(/v?(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]) };
}

/**
 * Count minor releases from `from` to `to`, walking across major boundaries when
 * `majorMinorCounts` says how many minors each major shipped.
 *
 * A major bump can't be extrapolated: nobody knows how many 9.x minors ship before
 * 10.0 until it's decided. So this returns null rather than guessing, and the caller
 * reports what to add to the config.
 */
function minorDistance(
  from: ParsedVersion,
  to: ParsedVersion,
  majorMinorCounts: Record<string, number> | undefined
): number | null {
  if (from.major === to.major) return to.minor - from.minor;

  // Walk from the lower major up to the higher one, then flip the sign if needed.
  const [lo, hi] = from.major < to.major ? [from, to] : [to, from];
  let distance = -lo.minor;
  for (let major = lo.major; major < hi.major; major++) {
    const last = majorMinorCounts?.[String(major)];
    if (last === undefined) return null;
    distance += last + 1; // minors 0..last inclusive
  }
  distance += hi.minor;
  return from.major < to.major ? distance : -distance;
}

/**
 * Map a release version onto the fiscal calendar by extrapolating from the anchor.
 *
 * Quarters are counted as one absolute index (`fiscalYear * 4 + quarter`) so year
 * rollover is arithmetic rather than a special case.
 */
export function deriveFiscalQuarter(
  calendar: QuarterCalendar | undefined,
  version: string
): QuarterResult {
  if (!calendar) {
    return { ok: false, reason: 'no `quarterCalendar` configured' };
  }
  const anchor = parseVersion(calendar.anchor.version);
  if (!anchor) {
    return { ok: false, reason: `unparseable anchor version "${calendar.anchor.version}"` };
  }
  const target = parseVersion(version);
  if (!target) {
    return { ok: false, reason: `unparseable version "${version}"` };
  }

  const perQuarter = calendar.minorsPerQuarter ?? 1;
  if (perQuarter < 1) {
    return { ok: false, reason: '`minorsPerQuarter` must be at least 1' };
  }

  const minors = minorDistance(anchor, target, calendar.majorMinorCounts);
  if (minors === null) {
    const majors = [anchor.major, target.major].sort((a, b) => a - b);
    return {
      ok: false,
      reason:
        `cannot span majors ${majors[0]} → ${majors[1]}: add the last minor of each ` +
        `major to \`quarterCalendar.majorMinorCounts\` (for example {"${majors[0]}": 9}), ` +
        `or move the anchor to a ${target.major}.x version`,
    };
  }

  const quartersFromAnchor = Math.floor(minors / perQuarter);
  const anchorIndex = calendar.anchor.fiscalYear * 4 + calendar.anchor.fiscalQuarter;
  const index = anchorIndex + quartersFromAnchor;
  if (index < 1) {
    return { ok: false, reason: `version "${version}" falls before the fiscal calendar starts` };
  }

  return {
    ok: true,
    value: {
      fiscalYear: Math.floor((index - 1) / 4),
      quarter: ((index - 1) % 4) + 1,
    },
  };
}

/**
 * Fill `{version}`, `{quarter}`, and `{fy}` in a meta-issue title pattern.
 *
 * Patterns using only `{version}` never need a calendar. Quarter placeholders do,
 * and a failure here is reported rather than silently producing a title that would
 * match the wrong tracker.
 */
export function resolveMetaTitle(
  titlePattern: string,
  versionLabel: string,
  calendar?: QuarterCalendar
): { ok: true; title: string } | { ok: false; reason: string } {
  const parsed = parseVersion(versionLabel);
  if (!parsed) return { ok: false, reason: `unparseable version "${versionLabel}"` };

  let title = titlePattern.replace(/\{version\}/g, `${parsed.major}.${parsed.minor}`);

  if (/\{quarter\}|\{fy\}/.test(title)) {
    const derived = deriveFiscalQuarter(calendar, versionLabel);
    if (!derived.ok) return { ok: false, reason: derived.reason };
    title = title
      .replace(/\{quarter\}/g, String(derived.value.quarter))
      .replace(/\{fy\}/g, String(derived.value.fiscalYear));
  }

  return { ok: true, title };
}

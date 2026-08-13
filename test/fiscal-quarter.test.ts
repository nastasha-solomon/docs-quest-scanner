import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveFiscalQuarter, resolveMetaTitle } from '../src/fiscal-quarter.js';
import type { QuarterCalendar } from '../src/types.js';

/** Anchored on the two facts the trackers confirm: 9.5 = Q1 FY27, 9.6 = Q2 FY27. */
const CAL: QuarterCalendar = {
  anchor: { version: '9.6', fiscalQuarter: 2, fiscalYear: 27 },
  minorsPerQuarter: 1,
};

const derive = (version: string, cal: QuarterCalendar | undefined = CAL) =>
  deriveFiscalQuarter(cal, version);

test('the anchor version maps to the anchor quarter', () => {
  const r = derive('9.6');
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok && r.value, { quarter: 2, fiscalYear: 27 });
});

test('later minors walk forward through the fiscal year', () => {
  assert.deepEqual(derive('v9.7.0').ok && derive('v9.7.0').value, { quarter: 3, fiscalYear: 27 });
  assert.deepEqual(derive('v9.8.0').ok && derive('v9.8.0').value, { quarter: 4, fiscalYear: 27 });
});

test('the fiscal year rolls over after Q4', () => {
  assert.deepEqual(derive('9.9').ok && derive('9.9').value, { quarter: 1, fiscalYear: 28 });
  assert.deepEqual(derive('9.10').ok && derive('9.10').value, { quarter: 2, fiscalYear: 28 });
  assert.deepEqual(derive('9.13').ok && derive('9.13').value, { quarter: 1, fiscalYear: 29 });
});

test('earlier minors walk backward, matching the known Q1 FY27 tracker', () => {
  assert.deepEqual(derive('9.5').ok && derive('9.5').value, { quarter: 1, fiscalYear: 27 });
  assert.deepEqual(derive('9.4').ok && derive('9.4').value, { quarter: 4, fiscalYear: 26 });
  assert.deepEqual(derive('9.2').ok && derive('9.2').value, { quarter: 2, fiscalYear: 26 });
});

test('a version label with a patch component parses like the bare version', () => {
  assert.deepEqual(derive('v9.7.3').ok && derive('v9.7.3').value, { quarter: 3, fiscalYear: 27 });
});

test('a slower cadence groups several minors into one quarter', () => {
  const slow: QuarterCalendar = { ...CAL, minorsPerQuarter: 2 };
  assert.deepEqual(derive('9.7', slow).ok && derive('9.7', slow).value, { quarter: 2, fiscalYear: 27 });
  assert.deepEqual(derive('9.8', slow).ok && derive('9.8', slow).value, { quarter: 3, fiscalYear: 27 });
});

test('a major bump is refused until the config says how many minors the major had', () => {
  const r = derive('10.0');
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.reason : '', /majorMinorCounts/);
});

test('a major bump resolves once majorMinorCounts is supplied', () => {
  const cal: QuarterCalendar = { ...CAL, majorMinorCounts: { '9': 9 } };
  // 9.9 is Q1 FY28, so 10.0 is the quarter after it.
  assert.deepEqual(derive('10.0', cal).ok && derive('10.0', cal).value, { quarter: 2, fiscalYear: 28 });
  assert.deepEqual(derive('10.1', cal).ok && derive('10.1', cal).value, { quarter: 3, fiscalYear: 28 });
});

test('derivation fails cleanly without a calendar or with a bad version', () => {
  assert.equal(deriveFiscalQuarter(undefined, '9.6').ok, false);
  assert.equal(derive('nonsense').ok, false);
});

test('resolveMetaTitle fills version, quarter, and fiscal year', () => {
  const r = resolveMetaTitle('[Q{quarter} FY{fy}] [Kib] Core analytics docs', 'v9.6.0', CAL);
  assert.equal(r.ok && r.title, '[Q2 FY27] [Kib] Core analytics docs');
});

test('a version-only pattern needs no calendar', () => {
  const r = resolveMetaTitle('Kibana {version}', 'v9.6.0');
  assert.equal(r.ok && r.title, 'Kibana 9.6');
});

test('a quarter pattern without a calendar reports why instead of guessing', () => {
  const r = resolveMetaTitle('[Q{quarter} FY{fy}] docs', 'v9.6.0');
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.reason : '', /quarterCalendar/);
});

test('the configured calendar resolves the trackers this quarter and next', () => {
  const pattern = '[Q{quarter} FY{fy}] [Kib] Kibana UX docs';
  assert.equal(
    resolveMetaTitle(pattern, 'v9.6.0', CAL).ok &&
      resolveMetaTitle(pattern, 'v9.6.0', CAL).title,
    '[Q2 FY27] [Kib] Kibana UX docs'
  );
  assert.equal(
    resolveMetaTitle(pattern, 'v9.7.0', CAL).ok &&
      resolveMetaTitle(pattern, 'v9.7.0', CAL).title,
    '[Q3 FY27] [Kib] Kibana UX docs'
  );
});

#!/usr/bin/env node
/**
 * Auto-dismiss high-confidence resolved items after enrichment.
 *
 * Selects queue items where the assessment concluded needsDocs: "no" with
 * confidence >= threshold (default 0.8, from config `autoDismissConfidence`
 * or --threshold=N). Each dismissal is appended to history.json with a
 * distinct "(auto…)" reason. Complete same-PR docs use "owned by dev";
 * other no-docs verdicts use "no docs needed". Both are auditable in the UI's
 * History view and undoable like any manual skip.
 *
 * Safety properties:
 * - basicAssessment never emits "no" — a "no" verdict can only come from the
 *   deterministic pre-filter (confidence 0.95) or AI enrichment, so this can
 *   never fire on an unenriched item.
 * - Items with user edits are always left alone.
 * - "yes" and "check" items are never touched, regardless of confidence.
 *
 * Usage: node scripts/auto-dismiss.mjs [--threshold=0.9] [--dry-run]
 * Calibration note: the 0.8 default was validated against the 2026-07-28
 * 200-item queue, where every "no" at >= 0.8 survived manual review.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR =
  process.env.DQS_DATA_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data');

function readJson(name) {
  const p = resolve(DATA_DIR, name);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf-8'));
}

function writeJson(name, data) {
  const serialized = JSON.stringify(data, null, 2) + '\n';
  JSON.parse(serialized); // verify before writing
  writeFileSync(resolve(DATA_DIR, name), serialized, 'utf-8');
}

const dryRun = process.argv.includes('--dry-run');
const thresholdArg = process.argv.find((a) => a.startsWith('--threshold='));
const config = readJson('config.json') ?? readJson('config.defaults.json') ?? {};
const threshold = thresholdArg
  ? Number(thresholdArg.split('=')[1])
  : config.autoDismissConfidence ?? 0.8;

if (!Number.isFinite(threshold) || threshold <= 0) {
  console.log('Auto-dismiss disabled (autoDismissConfidence is not set to a value > 0).');
  process.exit(0);
}

const queue = readJson('queue.json');
const history = readJson('history.json') ?? { entries: [] };
if (!queue?.items) {
  console.log('No queue found — nothing to do.');
  process.exit(0);
}

const targets = queue.items.filter(
  (i) =>
    i.assessment?.needsDocs === 'no' &&
    (i.assessment?.confidence ?? 0) >= threshold &&
    !i.userEdits
);

if (targets.length === 0) {
  console.log(`No "no docs" items at confidence >= ${threshold} to auto-dismiss.`);
  process.exit(0);
}

for (const item of targets) {
  const kind = item.assessment.prefiltered
    ? `pre-filtered: ${item.assessment.prefiltered}`
    : `confidence ${item.assessment.confidence}`;
  const dismissReason = item.assessment.dismissReason === 'owned by dev'
    ? 'owned by dev'
    : 'no docs needed';
  console.log(`  - ${item.suggestedTitle} (${kind})`);
  if (dryRun) continue;
  history.entries.push({
    prNumbers: item.prs.map((p) => p.number),
    decision: 'dismissed',
    repoId: item.repoId,
    reason: `${dismissReason} (auto, ${kind})`,
    timestamp: new Date().toISOString(),
    version: item.version,
    title: item.userEdits?.title ?? item.suggestedTitle,
    session: queue.scannedAt?.split('T')[0],
  });
}

if (dryRun) {
  console.log(`Dry run: ${targets.length} items would be auto-dismissed at >= ${threshold}.`);
  process.exit(0);
}

const targetIds = new Set(targets.map((i) => i.id));
queue.items = queue.items.filter((i) => !targetIds.has(i.id));
writeJson('history.json', history);
writeJson('queue.json', queue);
console.log(
  `Auto-dismissed ${targets.length} items (needsDocs: no, confidence >= ${threshold}). ` +
    `${queue.items.length} items remain. Undo from the History view if needed.`
);

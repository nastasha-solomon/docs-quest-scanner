/**
 * One-off backfill: scan elastic/kibana for merged PRs labeled Feature:ES|QL
 * (+ a monitored release_note label) over an extended window, keep only
 * v9.5.0 ones not already in the queue, and append them to the existing
 * queue without disturbing other items. History filtering happens inside
 * runScan. Restores last_run.json afterwards.
 */
import { loadEnv } from '../src/env.js';
loadEnv();

import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScan } from '../src/scanner.js';
import { loadConfig, loadQueue, saveQueue } from '../src/config.js';
import { renderIssueBody } from '../src/template.js';

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../data');
const LAST_RUN = resolve(DATA_DIR, 'last_run.json');
const EXTENDED_SINCE = '2026-01-01';
const TARGET_VERSION = 'v9.5.0';

async function main() {
  const snapshot = loadQueue();
  copyFileSync(resolve(DATA_DIR, 'queue.json'), resolve(DATA_DIR, 'queue.backup.json'));
  const origLastRun = readFileSync(LAST_RUN, 'utf-8');

  const cfg = loadConfig();
  const repo = cfg.repos[0];
  const esql = repo.categories.find((c) => c.name === 'ES|QL in Kibana');
  if (!esql) throw new Error('ES|QL category not found in config');
  const override = {
    ...cfg,
    repos: [{ ...repo, categories: [{ ...esql, labels: ['Feature:ES|QL'] }] }],
  };

  writeFileSync(
    LAST_RUN,
    JSON.stringify({ lastRunDate: EXTENDED_SINCE, byRepo: { [repo.id ?? 'elastic/kibana']: EXTENDED_SINCE } }, null, 2) + '\n'
  );

  try {
    const scanned = await runScan(override as any);

    const existingNums = new Set<number>();
    for (const item of snapshot.items) for (const pr of item.prs) existingNums.add(pr.number);

    const kept = scanned.items.filter(
      (it) =>
        it.prs.some((pr) => pr.labels?.some((l) => l === TARGET_VERSION)) &&
        !it.prs.some((pr) => existingNums.has(pr.number))
    );
    const droppedVersion = scanned.items.length - scanned.items.filter((it) => it.prs.some((pr) => pr.labels?.some((l) => l === TARGET_VERSION))).length;
    const droppedDup = scanned.items.length - droppedVersion - kept.length;

    for (const item of kept) item.suggestedBody = renderIssueBody(item);

    const merged = { scannedAt: snapshot.scannedAt, items: [...snapshot.items, ...kept] };
    saveQueue(merged);

    console.log(`\n── Backfill summary ──`);
    console.log(`  Scanned ES|QL items (post history/release-note filter): ${scanned.items.length}`);
    console.log(`  Dropped (not ${TARGET_VERSION}): ${droppedVersion}`);
    console.log(`  Dropped (already in queue): ${droppedDup}`);
    console.log(`  Added to queue: ${kept.length}`);
    for (const it of kept) {
      for (const pr of it.prs) console.log(`    #${pr.number} ${pr.title}`);
    }
    console.log(`  Queue now has ${merged.items.length} items.`);
  } finally {
    writeFileSync(LAST_RUN, origLastRun);
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});

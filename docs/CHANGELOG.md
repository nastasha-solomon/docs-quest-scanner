# Changelog

Notable changes to this fork of Docs Quest Scanner, newest first. For changes made before the fork, see the [upstream repository](https://github.com/florent-leborgne/docs-quest-scanner).

Each entry says where the change lives:

- **Fork only:** Stays in this fork.
- **Proposed upstream:** Described in the [upstream enhancement request](upstream-enhancement-request.md).
- **From upstream:** Merged in from the upstream repository.

## Unreleased

<!--
Add an entry here in the same PR as the change. Before you merge, move the
entries under a heading for the merge date (YYYY-MM-DD).

Use these groups and leave out any that are empty: Features and enhancements,
Fixes, Breaking changes, Action needed. Write one line per change that says
what the user can now do, then where the change lives and a link to the PR or
commit. Leave out changes that only affect this fork's internal docs.
-->

## 2026-11-15

### Features and enhancements

- Choose one of four themes from the palette button in the header: Azeroth (the default), Midnight Coven, Bright Falls, or Oldest House. Each theme changes the colors, greetings, mascots, and the accept button label. The witch greetings that used to appear for one account are now part of Midnight Coven. (Fork only, [#1])
- Filter the queue by assessment, stack release, doc work, category, and priority. **API reference only** shows items that only need API reference updates, and leaves out internal routes that aren't public yet. (Proposed upstream, [76cfb38], [0d460da])
- Filter the queue by merge date, including **Since last scan** and a custom range. (Proposed upstream, [c5c62a0])
- Set focus releases, focus categories, and starting filter values with the new `focusStackReleases`, `autoFocusStackReleases`, `focusCategories`, and `defaultQueueFilters` config options. (Proposed upstream, [76cfb38], [3c34d45], [0d460da])
- See the doc work type (**API ref**, **New content**, or **Update existing**) and priority (**P0** to **P3**) on each card. Estimated values have a dashed border. (Proposed upstream, [76cfb38], [0d460da])
- Skip an item for two new reasons: **release notes only** and **not my area**. (Proposed upstream, [c5c62a0])
- Accept or skip many cards at once. Select the cards, choose an action, and a progress bar shows each item as it's processed. (Proposed upstream, [770d604], [a1b0b7b], [873325e])
- Start a scan with **Run scan**, or get an enrichment prompt with **Enrich**, from the **Scan scope** panel. The panel also shows what the queue covers. (Proposed upstream, [82ba988])
- Hover over or tab to a control or badge to see a tooltip that explains it. List headings now have short descriptions. (Proposed upstream, [cbb315e])
- Enrichment can set a triage priority, and it handles internal server changes separately from public API changes. (Proposed upstream, [76cfb38], [0d460da])

### Fixes

- Security PRs owned by the Cases team go to **Security - Cases** instead of **One Workflow**. Items already in the queue are corrected when it loads. (Fork only, [e847654])
- The accept button on each card now meets WCAG contrast requirements. (Fork only, [#1])

### Action needed

- Run `./scripts/setup.sh` to reinstall the skill. The skill template is now version 3.15.0 and describes the new filters, skip reasons, and bulk actions.

## 2026-11-14

### Features and enhancements

- Leave PRs out of scans with the new `excludeLabels` and `excludeTitlePatterns` config options. (Proposed upstream, [42070fe])
- Scans retry GitHub searches that hit the search API rate limit. (Proposed upstream, [42070fe])

### Fixes

- Alerting PRs go to the right category, **Alerting v1** or **Alerting v2**, when you scan and when the queue loads. (Fork only, [42070fe])

[#1]: https://github.com/nastasha-solomon/docs-quest-scanner/pull/1
[42070fe]: https://github.com/nastasha-solomon/docs-quest-scanner/commit/42070fe
[76cfb38]: https://github.com/nastasha-solomon/docs-quest-scanner/commit/76cfb38
[3c34d45]: https://github.com/nastasha-solomon/docs-quest-scanner/commit/3c34d45
[0d460da]: https://github.com/nastasha-solomon/docs-quest-scanner/commit/0d460da
[770d604]: https://github.com/nastasha-solomon/docs-quest-scanner/commit/770d604
[e847654]: https://github.com/nastasha-solomon/docs-quest-scanner/commit/e847654
[c5c62a0]: https://github.com/nastasha-solomon/docs-quest-scanner/commit/c5c62a0
[a1b0b7b]: https://github.com/nastasha-solomon/docs-quest-scanner/commit/a1b0b7b
[873325e]: https://github.com/nastasha-solomon/docs-quest-scanner/commit/873325e
[82ba988]: https://github.com/nastasha-solomon/docs-quest-scanner/commit/82ba988
[cbb315e]: https://github.com/nastasha-solomon/docs-quest-scanner/commit/cbb315e

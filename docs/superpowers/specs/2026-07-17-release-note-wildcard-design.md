# Release-note wildcard configuration design

## Goal

Allow a scanner configuration to select every current and future GitHub label whose name starts with `release_note:` by setting:

```json
{
  "releaseNoteLabels": ["release_note:*"]
}
```

Keep the repository's built-in and tracked defaults unchanged. Only the current local runtime will opt into the wildcard after deployment.

## Configuration contract

- A configured value without `*` remains an exact, case-insensitive label match.
- A configured value ending in `*` matches labels with the preceding prefix, case-insensitively.
- `release_note:*` therefore matches `release_note:feature`, `release_note:fix`, `release_note:skip`, and future labels in the same namespace.
- Exact values and wildcard values can coexist in one array.
- An empty configured array continues to match no release-note labels at the scanner layer.
- Omitting `releaseNoteLabels` continues to use the existing default list of breaking, deprecation, feature, and enhancement labels.

This preserves existing configurations and avoids giving an omitted or empty value a new implicit meaning.

## Scanner behavior

Move release-note label matching into a small pure helper and use it when the scanner filters merged pull requests. The helper will support exact entries and trailing-prefix wildcards only; embedded or leading wildcards are out of scope.

`release_note:fix` keeps its existing manual-review assessment. `release_note:skip` receives an explicit manual-review assessment instead of falling through to the generic unknown-label message. Any future wildcard-matched release-note label without a dedicated assessment continues to enter the queue as a manual check.

## Documentation and versioning

- Document wildcard syntax and exact overrides in the README and runtime skill template.
- Keep `data/config.defaults.json` and the built-in default array unchanged.
- Update configuration-field examples to show that `release_note:*` is supported.
- Increment the runtime skill template version for this behavior change.

## Testing

Add automated tests that first fail against the current exact-only behavior, then verify:

1. `release_note:*` matches breaking, deprecation, feature, enhancement, fix, skip, and an unknown future `release_note:` label.
2. The wildcard does not match unrelated labels.
3. An exact configured list still includes only its named labels.
4. Matching is case-insensitive.
5. The default normalized configuration remains the current four-label list.
6. `release_note:skip` receives the intended manual-review assessment.

Run the focused tests, TypeScript build, and the full available test command before deployment.

## Deployment and runtime configuration

Deploy only from the development clone using the existing `scripts/deploy.sh` flow:

- `~/.agents/skills/docs-quest-scanner` remains the single real canonical installation.
- `~/.claude/skills/docs-quest-scanner` remains a symlink to that canonical installation.
- Runtime data, including `data/config.json`, remains excluded from deployment and is never overwritten.

After deploying the wildcard-capable code, update only this machine's current scanner configuration to `releaseNoteLabels: ["release_note:*"]` through the scanner's configuration API or another JSON-safe path. Do not add a migration and do not change other installations or custom configurations.

Verify after deployment that the canonical installation contains the new code and skill version, the symlink layout has no duplicate skill, the current runtime config uses the wildcard, and a scan recognizes both `release_note:fix` and `release_note:skip` through the wildcard.

## Out of scope

- Changing the global default release-note list.
- Automatically migrating existing configurations.
- Querying GitHub for label names before each scan.
- Supporting general glob expressions beyond a trailing `*` prefix match.

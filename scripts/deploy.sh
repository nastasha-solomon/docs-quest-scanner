#!/bin/bash
# Deploy this repo as the installed docs-quest-scanner skill.
#
# Layout it maintains:
#   - Canonical install: ~/.agents/skills/docs-quest-scanner (real dir, holds code + runtime data)
#   - Other runtimes:    ~/.claude/skills/docs-quest-scanner -> symlink to the canonical dir
#
# Runtime data (queue/history/last_run/enrichments/config.json) is gitignored and
# is NEVER overwritten by a deploy. The tracked config.defaults.json IS updated.
set -euo pipefail

# Single source of truth. Every runtime points here via a symlink.
CANON="$HOME/.agents/skills/docs-quest-scanner"
# Runtime skill dirs that should be symlinks to the canonical copy.
# Each entry: "<absolute link path>|<relative symlink target from that path>"
LINKS=(
  "$HOME/.claude/skills/docs-quest-scanner|../../.agents/skills/docs-quest-scanner"
)

SRC="$(cd "$(dirname "$0")/.." && pwd)"

# Runtime files that must survive a deploy (mirror of .gitignore's data entries).
DATA_EXCLUDES=(
  --exclude='data/config.json'
  --exclude='data/queue.json'
  --exclude='data/history.json'
  --exclude='data/last_run.json'
  --exclude='data/enrichments.json'
)

echo "Deploying docs-quest-scanner"
echo "  from: $SRC"
echo "  to:   $CANON (canonical)"

if [ "$SRC" = "$CANON" ]; then
  echo "  ! Refusing to deploy onto itself (run this from your dev clone)."
  exit 1
fi

mkdir -p "$CANON"

# Sync code; keep node_modules/.git/dist and all runtime data intact.
# config.defaults.json (tracked) is intentionally NOT excluded, so it updates.
rsync -a \
  --exclude='node_modules/' \
  --exclude='.git/' \
  --exclude='dist/' \
  --exclude='.env' \
  --exclude='/SKILL.md' \
  "${DATA_EXCLUDES[@]}" \
  "$SRC"/ "$CANON"/

# Render the runtime SKILL.md from the template, pointing __TOOL_DIR__ at the
# canonical dir (gitignored, so not synced above).
sed "s|__TOOL_DIR__|$CANON|g" \
  "$SRC/.claude/skills/docs-quest-scanner/SKILL.md" > "$CANON/SKILL.md"

# Point every other runtime at the canonical copy via a symlink.
for entry in "${LINKS[@]}"; do
  link="${entry%%|*}"
  target="${entry##*|}"
  mkdir -p "$(dirname "$link")"
  if [ -L "$link" ]; then
    rm -f "$link"
  elif [ -e "$link" ]; then
    echo "  ! $link is a real directory, not a symlink — leaving it untouched."
    echo "    Back up its data/, then: rm -rf '$link' && ln -s '$target' '$link'"
    continue
  fi
  ln -s "$target" "$link"
  echo "  linked: $link -> $target"
done

echo "Deployed to $CANON."
echo "Run 'yarn install' there if dependencies changed."

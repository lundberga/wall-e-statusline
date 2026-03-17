#!/usr/bin/env bash
# wall-e STATUSLINE — one-line installer
# Usage: curl -fsSL https://raw.githubusercontent.com/lundberga/wall-e-statusline/master/install.sh | bash

set -e

INSTALL_DIR="$HOME/.claude/wall-e-statusline"
SETTINGS="$HOME/.claude/settings.json"
REPO="https://github.com/lundberga/wall-e-statusline.git"

echo ""
echo "  wall-e STATUSLINE — installer"
echo "  ────────────────────────────────────"
echo ""

# ── Check Node.js
if ! command -v node &>/dev/null; then
  echo "  ✗ Node.js not found. Install it from https://nodejs.org and retry."
  exit 1
fi
echo "  ✓ Node.js $(node --version)"

# ── Check git
if ! command -v git &>/dev/null; then
  echo "  ✗ git not found. Install git and retry."
  exit 1
fi

# ── Clone or update
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "  ↻ Updating existing install at $INSTALL_DIR"
  git -C "$INSTALL_DIR" pull --ff-only --quiet
else
  echo "  ↓ Cloning to $INSTALL_DIR"
  git clone --quiet "$REPO" "$INSTALL_DIR"
fi

# ── Create config.json if missing
CONFIG="$INSTALL_DIR/config.json"
if [ ! -f "$CONFIG" ]; then
  cat > "$CONFIG" <<'EOF'
{
  "city": "Stockholm",
  "country": "SE",
  "budgets": { "daily": 5.00, "weekly": 25.00, "monthly": 100.00 },
  "week_reset_day": "FRI"
}
EOF
  echo "  ✓ Created config.json (edit to set your city/budgets)"
else
  echo "  ✓ config.json exists"
fi

# ── Patch ~/.claude/settings.json
STATUS_CMD="node \"$INSTALL_DIR/wall-e_status.js\""

mkdir -p "$HOME/.claude"
if [ -f "$SETTINGS" ]; then
  # Use node to safely patch the JSON
  node - "$SETTINGS" "$STATUS_CMD" <<'JSEOF'
const fs = require('fs');
const [,, file, cmd] = process.argv;
let s = {};
try { s = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
s.statusCommand = cmd;
fs.writeFileSync(file, JSON.stringify(s, null, 2) + '\n');
JSEOF
else
  echo "{\"statusCommand\": \"$STATUS_CMD\"}" > "$SETTINGS"
fi
echo "  ✓ Patched ~/.claude/settings.json"
echo "    → $STATUS_CMD"

echo ""
echo "  Done. Restart Claude Code to activate the statusline."
echo ""

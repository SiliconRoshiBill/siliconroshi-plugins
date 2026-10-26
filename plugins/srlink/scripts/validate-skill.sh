#!/usr/bin/env bash
# ============================================================================
# validate-skill.sh -- structural lint for the srlink plugin
#
# Not a test framework. grep + expected substrings, so a line the model or
# the plugin loader needs cannot silently go missing before a release.
#
# Usage:  bash scripts/validate-skill.sh        (from the repo root)
# Exit:   0 = all checks pass, 1 = at least one check failed.
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

skill=skills/srlink/SKILL.md
fail=0
check() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then printf "  ok    %s\n" "$label"
  else printf "  FAIL  %s\n" "$label"; fail=1; fi
}
absent() { ! grep -rqE "$1" --exclude-dir=.git --exclude=validate-skill.sh --exclude=PACKAGING-REPORT.md .; }

echo "validating: srlink plugin"
check "frontmatter: name"        grep -qE '^name: srlink$' "$skill"
check "frontmatter: description" grep -qE '^description: ' "$skill"
check "skill: plugin-root path"  grep -qF '${CLAUDE_PLUGIN_ROOT}/skills/srlink/scripts/srlink.cjs' "$skill"
check "skill: auto-share default on, documents off" grep -qF 'srlink auto-share off' "$skill"
check "hook: uses plugin root"   grep -qF '${CLAUDE_PLUGIN_ROOT}/skills/srlink/scripts/hook.cjs' hooks/hooks.json
check "hook: off by default"     grep -qF 'cfg.autoShare !== true' skills/srlink/scripts/hook.cjs
check "cli: production default"  grep -qF "'https://www.siliconroshi.ai'" skills/srlink/scripts/srlink.cjs
check "json: plugin.json"        node -e 'JSON.parse(require("fs").readFileSync(".claude-plugin/plugin.json"))'
check "json: marketplace.json"   node -e 'JSON.parse(require("fs").readFileSync(".claude-plugin/marketplace.json"))'
check "json: hooks.json"         node -e 'JSON.parse(require("fs").readFileSync("hooks/hooks.json"))'
check "no personal paths"        absent '/U[s]ers/|/h[o]me/[a-z]'
check "no localhost defaults"    absent 'localhost|127\.0\.0\.1'
check "no token-like strings"    absent '(sk-[A-Za-z0-9]{20,}|Bearer [A-Za-z0-9._-]{20,})'

exit "$fail"

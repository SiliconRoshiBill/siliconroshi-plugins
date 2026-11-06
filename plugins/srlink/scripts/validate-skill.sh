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
check "skill: script path"       grep -qF 'scripts/srlink.cjs' "$skill"
check "skill: Claude plugin root" grep -qF '${CLAUDE_PLUGIN_ROOT}/skills/srlink' "$skill"
check "skill: auto-share default on, documents off" grep -qF 'srlink auto-share off' "$skill"
for ref in setup publish feed automation log; do
  check "skill: references/$ref.md linked" grep -qF "references/$ref.md" "$skill"
  check "skill: references/$ref.md exists" test -s "skills/srlink/references/$ref.md"
done
check "skill: lean core (<= 120 lines)" test "$(wc -l < "$skill")" -le 120
for ai in cursor github-copilot workbuddy grok; do
  check "install: agent table has $ai" grep -qF "['$ai'," skills/srlink/scripts/install.cjs
done
check "hook: uses plugin root"   grep -qF '${CLAUDE_PLUGIN_ROOT}/skills/srlink/scripts/hook.cjs' hooks/hooks.json
check "hook: auto-share gate"     grep -qF 'cfg.autoShare !== true' skills/srlink/scripts/hook.cjs
check "comments only: no like reporting" absent '\-\-like |mark <postId> liked'
check "cli: production default"  grep -qF "'https://www.siliconroshi.ai'" skills/srlink/scripts/srlink.cjs
check "json: plugin.json"        node -e 'JSON.parse(require("fs").readFileSync(".claude-plugin/plugin.json"))'
check "json: hooks.json"         node -e 'JSON.parse(require("fs").readFileSync("hooks/hooks.json"))'
check "no personal paths"        absent '/U[s]ers/|/h[o]me/[a-z]'
check "no localhost defaults"    absent 'localhost|127\.0\.0\.1'
check "no token-like strings"    absent '(sk-[A-Za-z0-9]{20,}|Bearer [A-Za-z0-9._-]{20,})'

exit "$fail"

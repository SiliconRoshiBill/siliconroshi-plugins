#!/usr/bin/env bash
# ============================================================================
# validate.sh -- pre-publish checks for the siliconroshi marketplace
#
#   1. claude plugin validate --strict on the marketplace manifest
#   2. claude plugin validate --strict on every vendored plugin (plugins/*)
#   3. each vendored plugin's own structural lint, if it ships one
#   4. node tests for every vendored plugin
#   5. no personal paths, no user names, no token-like strings
#
# Remote plugins (heropedia) are validated in their own repos.
#
# Usage:  bash scripts/validate.sh        (any cwd)
# Exit:   0 = all checks pass, 1 = at least one check failed.
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
check() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then printf "  ok    %s\n" "$label"
  else printf "  FAIL  %s\n" "$label"; fail=1; fi
}
absent() {
  ! grep -rqE "$1" --exclude-dir=.git --exclude-dir=node_modules \
      --exclude=validate.sh --exclude=validate-skill.sh --exclude=PACKAGING-REPORT.md .
}

echo "validating: siliconroshi marketplace"
check "marketplace manifest (strict)" claude plugin validate --strict .
for dir in plugins/*/; do
  name=$(basename "$dir")
  check "$name: plugin manifest (strict)" claude plugin validate --strict "$dir"
  lint="$dir/scripts/validate-skill.sh"
  [ -f "$lint" ] && check "$name: structural lint" bash "$lint"
done
check "node tests"               node --test 'plugins/**/*.test.cjs'
check "no personal paths"        absent '/U[s]ers/|/h[o]me/[a-z]'
check "no personal user names"   absent 'b[i]llzwu'
check "no token-like strings"    absent '(sk-[A-Za-z0-9]{20,}|Bearer [A-Za-z0-9._-]{20,})'

exit "$fail"

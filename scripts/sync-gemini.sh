#!/usr/bin/env bash
# ============================================================================
# sync-gemini.sh -- copy the srlink skill to the repo root for Gemini CLI
#
# Gemini CLI installs an extension from a repo ROOT and resolves symlinks
# to absolute paths at install time, so the root skills/srlink must be a
# real copy of plugins/srlink/skills/srlink. Run after any skill change;
# validate.sh fails while the two differ. Version follows plugin.json.
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf skills/srlink
mkdir -p skills
cp -R plugins/srlink/skills/srlink skills/srlink
version=$(node -p "require('./plugins/srlink/.claude-plugin/plugin.json').version")
node -e "const f='gemini-extension.json',j=require('./'+f);j.version='$version';require('fs').writeFileSync(f,JSON.stringify(j,null,2)+'\n')"
echo "skills/srlink synced, gemini-extension.json at $version"

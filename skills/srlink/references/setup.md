# SRlink: first-time setup

Read when the user wants to log in or set SRlink up on this computer. Commands below are `srlink <command>` = `node <skill folder>/scripts/srlink.cjs <command>`.

## Once per computer

1. `srlink login` — prints a link and a code and opens the browser; the user signs in to siliconroshi.ai and clicks Authorize. (`--url <site>` logs in to a test site instead of production.)
2. `srlink handles --rednote <name> --youtube @<name> [--linkedin <name>] [--x <name>] [--tiktok @<name>] [--instagram <name>] [--reddit u/<name>]` — the user's own account names, so other members' monitoring can verify their support. Also editable on SRlink → Mine.
3. Auto-share is on by default once the user is logged in, in AIs where SRlink is installed as a plugin (Claude Code, Codex, Gemini CLI): the plugin's PostToolUse hook registers posts the user publishes with any skill. Tell the user once that it is on and that `srlink auto-share off` turns it off.
4. The background YouTube check is on by default too: login (and, for users logged in before, the next session start) turns it on every hour (macOS launchd, Windows Task Scheduler, Linux crontab) and prints one line saying so. Relay that line once. It runs without Claude open and only reads the channel's public feed. `srlink schedule on 3` changes it to every 3 hours, `srlink schedule status` shows it, `srlink schedule off` stops it for good (it is never turned back on automatically after that).
5. Ask the user once: "Should the background check also scan the Claude sessions on this computer for posts you published, and register them? Read on this computer only; only post links are kept." On yes: `srlink scan on` (it runs inside the background check, so `schedule on` must be on too). YouTube posts are checked and registered without a browser; Rednote, LinkedIn, X, TikTok, Instagram and Reddit ones are handed to Claude at the next session start (see section 5).
6. `srlink status` to confirm.
7. Other AIs on this computer (Cursor, Copilot, WorkBuddy, Grok, Windsurf, OpenCode...): `srlink setup` links this skill into each one it finds and prints a report; show it to the user as is. They all share this login.

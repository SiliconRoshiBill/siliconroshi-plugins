# Install or update SRlink

For the AI doing the work. Run every command yourself and show the user the report the last command prints, as is.

## 0. Before you start

- You must be able to run terminal commands. If you can't, tell the user: "Please turn on command execution for me in my settings, then ask again."
- Node 18 or later: `node --version`. Missing? Tell the user to install it from https://nodejs.org, then ask again.
- Already installed? `node ~/.srlink/skill/scripts/srlink.cjs skill` prints a table → go to [Update](#update).

## 1. Claude Code, Codex or Gemini CLI: use the plugin

These three get the plugin, which also carries the auto-share hook:

```bash
claude plugin marketplace add SiliconRoshiBill/siliconroshi-plugins && claude plugin install srlink@siliconroshi
codex plugin marketplace add SiliconRoshiBill/siliconroshi-plugins && codex plugin add srlink@siliconroshi
gemini extensions install https://github.com/SiliconRoshiBill/siliconroshi-plugins
```

Run only the line for the AI you are. Then run step 2 too if the user has other AIs on this computer.

## 2. Every other AI (Cursor, Copilot, WorkBuddy, Grok, Windsurf, OpenCode ...)

```bash
git clone --depth 1 https://github.com/SiliconRoshiBill/siliconroshi-plugins.git ~/.srlink/src
node ~/.srlink/src/skills/srlink/scripts/srlink.cjs setup
```

`setup` copies the skill to `~/.srlink/skill` and links it into the skills folder of every AI it finds on this computer; AIs that have the plugin keep the plugin. Your AI is not in the report? `node ~/.srlink/skill/scripts/srlink.cjs skill link <your skills folder>`.

Tell the user to open a new session so the skill loads, then say "log in to SRlink".

## Update

```bash
node ~/.srlink/skill/scripts/srlink.cjs update
```

It pulls `~/.srlink/src` and links again. Plugin installs update through their plugin manager instead, and refresh the shared copy at their next session start.

## Uninstall

```bash
node ~/.srlink/skill/scripts/srlink.cjs skill remove --dry-run   # show the user first
node ~/.srlink/skill/scripts/srlink.cjs skill remove             # once they agree
```

It removes only the links and the copy it made; the login, settings and plugins stay. `srlink schedule off` and `srlink logout` only if the user asks.

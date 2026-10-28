# SRlink Plugin for Claude Code, Codex and Gemini CLI

Part of the SiliconRoshi plugin marketplace (`SiliconRoshiBill/siliconroshi-plugins`). If you already added that marketplace, `/plugin install srlink@siliconroshi` is all you need.

SRlink is SiliconRoshi's member network. Members register the posts they publish (YouTube, Rednote, X, LinkedIn, TikTok, Instagram, Reddit), read each other's posts in the SRfeed, and help support each other with comments and likes. This plugin lets you do all of that from Claude Code, Codex or Gemini CLI. All three share one login and settings in `~/.srlink/`.

It bundles:

- **`srlink` skill**: log in, register your posts, read the SRfeed with comment drafts, and check which members supported your posts. Triggers on "SRlink", "SRfeed", "share to SRlink", "check comments", or right after you publish a post.
- **`srlink` CLI** (`skills/srlink/scripts/srlink.cjs`, plain Node 18+, no dependencies): the skill calls it for you.
- **Auto-share hook** (`hooks/hooks.json`): on by default once you log in. See below.

## Install

```bash
claude plugin marketplace add SiliconRoshiBill/siliconroshi-plugins
claude plugin install srlink@siliconroshi
```

Open a new Claude Code session afterwards.

Codex:

```bash
codex plugin marketplace add SiliconRoshiBill/siliconroshi-plugins
codex plugin add srlink@siliconroshi
```

Gemini CLI:

```bash
gemini extensions install https://github.com/SiliconRoshiBill/siliconroshi-plugins
```

Open a new session in that agent afterwards.

What differs between agents:

- Browser steps (publishing, reading comments, checking Rednote / LinkedIn / X / TikTok / Instagram / Reddit posts) need a tool that drives your logged-in Chrome: Claude in Chrome in Claude Code, the Chrome plugin in Codex. Without one, the agent asks you to open the page.
- The session scan reads Claude Code session logs only.

## First run

Ask your agent "log in to SRlink", or run the steps yourself (`<plugin>` is the installed plugin folder; the agent fills it in):

1. `node <plugin>/skills/srlink/scripts/srlink.cjs login` prints a link and a code and opens your browser. Sign in at siliconroshi.ai and approve. A token is saved to `~/.srlink/config.json` (mode 600).
2. `srlink handles --rednote <name> --youtube @<name> [--linkedin <name>] [--x <name>] [--tiktok @<name>] [--instagram <name>] [--reddit u/<name>]` saves your own account names, so other members can verify your support.
3. Auto-share is on by default; `srlink auto-share off` turns it off (see below).
4. `srlink status` to confirm.

Other commands: `share`, `feed`, `mine`, `mark`, `observed`, `logout`. `login --url <site>` points at a test server; the default is https://www.siliconroshi.ai.

## The auto-share hook

The plugin registers a hook that runs after shell commands and MCP tools, browser tools included (`PostToolUse` in Claude Code and Codex, `AfterTool` in Gemini CLI). It is on by default once you are logged in (before that it stays silent); `srlink auto-share off` stops it and `srlink auto-share on` turns it back on.

When on, it looks in the tool's output for a new post link (one that was not in the tool's input, so links you only opened are skipped) and:

- if the output also holds a title for that link (for example JSON printed by an uploader), registers the post on SRlink as yours;
- otherwise tells the agent to register it only if you just published that post yourself.

On X it only counts bare `/<handle>/status/<id>` paths for your own saved handle. It never blocks a tool, never posts anything to a social platform, and always exits cleanly.

## Privacy

- Comments and likes are written and posted by you. The agent helps click only when you ask for that specific comment or like.
- The plugin never stores passwords or cookies for any platform. The only thing it keeps is your SRlink token in `~/.srlink/config.json`, plus a list of links it has already seen.
- When you check who supported your posts, the server keeps only commenters who are SRlink members; everyone else is counted and dropped.

## Development

```bash
# from the root of the siliconroshi-plugins repo
node --test 'plugins/srlink/**/*.test.cjs'        # hook + CLI tests (or: npm test)
bash plugins/srlink/scripts/validate-skill.sh     # structural checks
claude plugin validate --strict plugins/srlink
```

## License

MIT

---
name: srlink
description: SRlink, SiliconRoshi's member network, from any AI that loads skills (Claude Code, Codex, Gemini CLI, Cursor, Copilot, WorkBuddy, Grok and more). Log in once; publish posts to YouTube, Rednote, X, TikTok, Instagram and Reddit through the user's Chrome (or let the user's own posting skill do it); register every published post on SRlink; read the SRfeed with AI comment drafts and help the user comment; monitor the user's own posts to verify who supported them. Use for "SRlink", "srpost", "post to YouTube / Rednote / TikTok / Instagram / Reddit", "share to SRlink", "SRfeed", "check comments", "install SRlink in Cursor / another AI", or right after the user publishes a post anywhere.
---

# SRlink

Script: `scripts/srlink.cjs` in this skill's own folder, next to this SKILL.md: run `node <skill folder>/scripts/srlink.cjs <command>` (below: `srlink <command>`). In Claude Code the folder is `${CLAUDE_PLUGIN_ROOT}/skills/srlink`; in every other AI use the folder this skill was loaded from (for AIs set up by `srlink setup` that is `~/.srlink/skill`). Node 18+, no dependencies. Every AI on the computer shares one login and config in `~/.srlink/`.

Before acting, say "using the srlink skill". These rules hold for the whole session.

## What the user wants → what you do

Read the reference named in the last column before the first command of that kind; each one holds the exact steps.

| The user says | You run | Read |
|---|---|---|
| "log in to SRlink", set it up | `srlink login`, then `srlink handles ...` | [setup](references/setup.md) |
| publish / post this to YouTube, Rednote, X ... | their own posting skill, or the built-in Chrome flow; then `srlink share` | [publish](references/publish.md) |
| "share to SRlink", register a post | `srlink share --title ... --summary ... --publish-at ... --link <platform>=<url>`, then `srlink mine` | [publish](references/publish.md) |
| SRfeed, comment on members' posts | `srlink feed` → user picks a draft → `srlink mark` | [feed](references/feed.md) |
| "check comments", who supported me | `srlink mine` → read in Chrome → `srlink observed` | [feed](references/feed.md) |
| sync my posts, background check, session scan | `srlink sync`, `srlink schedule`, `srlink scan`, `srlink match` | [automation](references/automation.md) |
| "is it on SRlink?", something went wrong | `srlink mine`, then `srlink log 20` | [log](references/log.md) |
| status | `srlink status` (login, auto-share, background check) and `srlink skill` (which AIs have it) | — |
| install in Cursor / Copilot / WorkBuddy / Grok / another AI | `srlink setup`; for an AI not found: `srlink skill link <its skills folder>` | — |
| update | `srlink update` (plugin installs: the plugin manager updates it) | — |
| uninstall | `srlink skill remove --dry-run`, show it, then `srlink skill remove` once they agree; `srlink schedule off` and `srlink logout` only if they ask | — |

After `srlink setup` or `srlink update`, show the report it prints to the user as is: no additions, no reordering.

## Ground rules

- Act only in the user's own logged-in browser and only when the user asks. Never store social-platform passwords, cookies or tokens (the only thing kept is the SRlink token in `~/.srlink/config.json`); stop and ask at any login, 2FA, captcha or rate-limit prompt, and never retry around a platform block.
- Every publish needs an explicit "publish" (or the same word in the user's language) from the user for that one post. Show the exact final text, title, platform and media first; re-show after any edit. No batch publishing, no unattended publishing.
- Comments and likes: the user decides and posts each one. Help click only when the user asks for that specific comment, after they approve its final text. Like only when the user approves the like for that post (default yes, shown next to the comment preview); never like comments; skip if already liked.
- Browser work (publishing, reading comments, checking a Rednote / LinkedIn / X / TikTok / Instagram / Reddit post) uses a tool that drives the user's own logged-in Chrome: Claude in Chrome in Claude Code, the Chrome plugin in Codex, the AI's own browser tool elsewhere. If no such tool is available, say so and ask the user to open the page and paste what you need.
- Share only the user's own PUBLIC posts to SRlink. Never register an unlisted or private video (class recordings, member-only lessons), even if the user owns it. Never register a post someone else made, even one the user only searched for or opened. Never print the token or `~/.srlink/config.json`.
- Dates and times: when telling the user a date or time, use the local value the CLI printed (`posted_at_local` in `feed`/`mine`: when the post went public on its platform, or `status`'s plain text) — never UTC and never a raw ISO string. A `--publish-at` with no timezone offset is read as the user's own local time and sent to the server as an absolute UTC instant.
- Never tell the user a post is on SRlink from memory or from a hook note alone: `srlink mine` must show the card.

## Results and errors

Commands print JSON (`share`, `feed`, `mine`, `mark`, `observed`, `handles`) or plain lines. On failure they print one line and exit 1; branch on it:

| The line says | What to do |
|---|---|
| `Not logged in to SRlink` / `... failed: 401 unauthorized` | `srlink login`; the user approves in the browser themselves. Then repeat the command once |
| `Login denied` / `Code expired` / `Timed out waiting` | Tell the user; run `srlink login` again only if they want to |
| `share failed: 429 monthly_limit` | Free users get 1 share a month. Say so and mention a membership; do not retry |
| `... failed: 429 rate_limited` | Wait a minute, then try once more; never loop |
| `share failed: 400 bad_title / bad_summary / bad_links / bad_publish_at / bad_url` | Fix that argument (see [publish](references/publish.md)) and run again |
| `... failed: 404 not_found / not_your_post` | Wrong post id or link: check `srlink mine` / `srlink feed` |
| `... failed: 503 unavailable`, `fetch failed` | SRlink is unreachable. Tell the user, show `srlink log 5`; do not retry in a loop |
| `could not find the YouTube channel for ...` | The saved YouTube handle is wrong: `srlink handles --youtube @<name>` |
| `reading the clipboard is not supported` | Ask the user to paste the link |

A `share` reply is read, not assumed: `{"id":N}` new card, `"merged":true` added to a card, `"existing":true` already there, `"existing":true,"deleted":true` the user deleted it before and it was NOT registered.

## Hook notes (plugin installs only)

Where SRlink is installed as a plugin (Claude Code, Codex, Gemini CLI) a hook watches tool output; it is on by default and `srlink auto-share off` turns it off. "Registered on SRlink: ..." → tell the user in one line. "New post link(s) ..." → share only if the user just published that post themselves, with the title just used; ignore links you only searched for or opened. AIs that load only the skill get no hook notes: register every publish yourself as its last step.

## Red lines

- Never publish, comment or like without the user's approval of that one item.
- Never log in to a platform for the user, never ask for or print a password, cookie or the SRlink token.
- Never register someone else's post or a non-public video on SRlink.

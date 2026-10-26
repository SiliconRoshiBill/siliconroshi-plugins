---
name: srlink
description: SRlink, SiliconRoshi's member network, from Claude Code. Log in once; publish posts to YouTube, Rednote and X through Claude in Chrome (or let the user's own posting skill do it); register every published post on SRlink; read the SRfeed with AI comment drafts and help the user comment; monitor the user's own posts to verify who supported them. Use for "SRlink", "srpost", "发帖", "post to YouTube / Rednote", "share to SRlink", "SRfeed", "check comments", or right after the user publishes a post anywhere.
---

# SRlink

Script: `node "${CLAUDE_PLUGIN_ROOT}/skills/srlink/scripts/srlink.cjs" <command>` (below: `srlink <command>`). Claude Code fills in `${CLAUDE_PLUGIN_ROOT}` when it loads this skill; if you see the literal text `${CLAUDE_PLUGIN_ROOT}`, find the installed plugin folder with `claude plugin list` (or look under `~/.claude/plugins/`) and use that path.

## Ground rules

- Act only in the user's own logged-in browser and only when the user asks. Never store social-platform passwords, cookies or tokens (the only thing kept is the SRlink token in `~/.srlink/config.json`); stop and ask at any login, 2FA, captcha or rate-limit prompt, and never retry around a platform block.
- Every publish needs an explicit "发布" from the user for that one post. Show the exact final text, title, platform and media first; re-show after any edit. No batch publishing, no unattended publishing.
- Comments and likes: the user decides and posts each one. Help click only when the user asks for that specific comment, after they approve its final text. Like only when the user approves the like for that post (default yes, shown next to the comment preview); never like comments; skip if already liked.
- Share only the user's own posts to SRlink. Never print the token or `~/.srlink/config.json`.
- Dates and times: when telling the user a date or time, use the local value the CLI printed (`created_at_local` in `feed`/`mine`, or `status`'s plain text) — never UTC and never a raw ISO string. A `--publish-at` with no timezone offset is read as the user's own local time and sent to the server as an absolute UTC instant.

## Setup (once per computer)

1. `srlink login` — prints a link and a code and opens the browser; the user signs in to siliconroshi.ai and clicks 授权. (`--url <site>` logs in to a test site instead of production.)
2. `srlink handles --rednote <name> --youtube @<name> [--linkedin <name>] [--x <name>]` — the user's own account names, so other members' monitoring can verify their support. Also editable on SRlink → 我的.
3. Auto-share is on by default once the user is logged in: the plugin's PostToolUse hook registers posts the user publishes with any skill. Tell the user once that it is on and that `srlink auto-share off` turns it off.
4. `srlink status` to confirm.

## 1. Publish

**If the user has their own posting skill (ytupload, a Rednote skill, anything): use it.** Do not re-post.

**If not, use the built-in flow (YouTube, Rednote, X):**
1. Collect platform(s), title, body, media paths, and a publish time if scheduled.
2. Load the Chrome tools in one ToolSearch call (tabs_context, tabs_create, navigate, computer, find, form_input, read_page, get_page_text).
3. Per platform, in a new tab: YouTube Studio (studio.youtube.com → Create → Upload), Rednote creator center (creator.rednote.com or creator.xiaohongshu.com → 发布笔记), or X (x.com/compose/post; to attach someone else's video with credit, end the text with their `.../status/<id>/video/1` link). Fill the fields, screenshot the final state, show it, wait for "发布", then click publish.
4. Read the resulting post URL from the page (YouTube: the video link in the done dialog; Rednote: the note in 笔记管理; X: the newest post's timestamp link on x.com/<handle>).

**Last step of every publish, whichever skill or tool posted it: register on SRlink.** If a hook note "Registered on SRlink: ..." already appeared for that URL, just relay it. Otherwise run `srlink share` (section 2) yourself with the title just published, then `srlink mine` to confirm the card, and report the post URL and the SRlink result. A publish is not done until this step is.

## 2. Register on SRlink

`srlink share --title "<title>" [--summary "<one line>"] [--publish-at <WHEN>] --link rednote=<url> [--link youtube=<url> ...]`
- Same title within 7 days adds the platform to the existing card. Scheduled posts: pass `--publish-at`; SRfeed shows them from then. `<WHEN>` can be plain local time ("2026-11-01T19:00:00", no offset) — read as the user's own timezone and converted to UTC before sending — or an ISO string that already carries an offset/`Z`.
- Free users: 1 share a month (on `monthly_limit`, say so and mention 升级会员). Members: no limit.
- Hook notes: "Registered on SRlink: ..." → tell the user in one line. "New post link(s) ..." → share only if the user just published it, with the title just used; ignore links you only opened.
- The hook (on by default; off after `srlink auto-share off`) runs after Bash and every MCP tool, Claude in Chrome included. On Chrome pages it also spots bare X paths like `/<handle>/status/<id>`, but only for the user's own X handle saved via `srlink handles` (re-run `srlink handles` once to cache it locally).

## 3. Comment on members' posts

1. `srlink feed` → posts of the last 10 days with `links`, `drafts`, `commented`, `liked`, `mine`.
2. Show the user posts that are not `mine` and not commented, with their drafts.
3. The user picks or edits a draft and posts it (or asks you to post that one comment, per the ground rules).
4. After they confirm: `srlink mark <postId> commented` / `liked`; `mark <postId> skipped` hides an irrelevant post.

## 4. Monitor my posts (verify support)

Run when the user asks ("check comments", "看看谁支持了我"), or daily if they set up a schedule.
1. `srlink mine` → the user's posts of the last 10 days with their links.
2. For each link, open it in Chrome and read the commenters' account names (and likers, where the platform lists them), with times if shown.
3. Report per link: `srlink observed --url <link> --platform <rednote|youtube|linkedin|x> --comment "<name>@<ISO time>" ... --like "<name>" ...`
4. Tell the user who was verified (`matched`) and how many other commenters there were. Suggest replies to new comments if they want.

Privacy: the server keeps only commenters who are SRlink members (matched by their account names); everyone else is counted and dropped. Do not keep comment text or other people's names anywhere else.

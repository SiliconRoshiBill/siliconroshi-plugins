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
- Dates and times: when telling the user a date or time, use the local value the CLI printed (`posted_at_local` in `feed`/`mine`: when the post went public on its platform, or `status`'s plain text) — never UTC and never a raw ISO string. A `--publish-at` with no timezone offset is read as the user's own local time and sent to the server as an absolute UTC instant.

## Setup (once per computer)

1. `srlink login` — prints a link and a code and opens the browser; the user signs in to siliconroshi.ai and clicks 授权. (`--url <site>` logs in to a test site instead of production.)
2. `srlink handles --rednote <name> --youtube @<name> [--linkedin <name>] [--x <name>]` — the user's own account names, so other members' monitoring can verify their support. Also editable on SRlink → 我的.
3. Auto-share is on by default once the user is logged in: the plugin's PostToolUse hook registers posts the user publishes with any skill. Tell the user once that it is on and that `srlink auto-share off` turns it off.
4. Ask the user once: 「要在后台定时（默认每小时）检查你的 YouTube 新视频，直接登记到 SRlink 吗？多久查一次？（1–24 小时）」 On yes: `srlink schedule on [H]` (every H hours, default 1; macOS launchd / Linux crontab). `srlink schedule on 3` changes it to every 3 hours, `srlink schedule status` shows it, `srlink schedule off` stops it. It runs without Claude open and only reads the channel's public feed.
5. Ask the user once: 「同一个后台检查里，也扫一遍你这台电脑上的 Claude 会话记录，找出你发过的帖子来登记吗？只在本机读，只取帖子链接。」 On yes: `srlink scan on` (it runs inside the background check, so `schedule on` must be on too). YouTube posts are checked and registered without a browser; Rednote, LinkedIn and X ones are handed to Claude at the next session start (see section 5).
6. `srlink status` to confirm.

## 1. Publish

**If the user has their own posting skill (ytupload, a Rednote skill, anything): use it.** Do not re-post.

**If not, use the built-in flow (YouTube, Rednote, X):**
1. Collect platform(s), title, body, media paths, and a publish time if scheduled.
2. Load the Chrome tools in one ToolSearch call (tabs_context, tabs_create, navigate, computer, find, form_input, read_page, get_page_text).
3. Per platform, in a new tab: YouTube Studio (studio.youtube.com → Create → Upload), Rednote creator center (creator.rednote.com or creator.xiaohongshu.com → 发布笔记), or X (x.com/compose/post; to attach someone else's video with credit, end the text with their `.../status/<id>/video/1` link). Fill the fields, screenshot the final state, show it, wait for "发布", then click publish.
4. Read the resulting post URL from the page (YouTube: the video link in the done dialog; Rednote: the note in 笔记管理; X: the newest post's timestamp link on x.com/<handle>).

**Last step of every publish, whichever skill or tool posted it: register on SRlink.** If a hook note "Registered on SRlink: ..." already appeared for that URL, just relay it. Otherwise run `srlink share` (section 2) yourself with the title just published, then `srlink mine` to confirm the card, and report the post URL and the SRlink result. A publish is not done until this step is.

## 2. Register on SRlink

`srlink share --title "<title>" --summary "<3-5 sentences>" [--publish-at <WHEN>] --link rednote=<url> [--link youtube=<url> ...]`
- Summary: always 3-5 sentences, written from the post's own text (description, caption, script): what it covers, who it is for, what a reader takes away. Never invent facts that are not in the post. Other members' AI comment drafts are written from it.
- Rednote links: register the note's share link, never a bare `.../explore/<id>` or `.../discovery/item/<id>` (blocked for other viewers). In Chrome: open the note from the user's profile, click the share arrow, click Copy Link, read it with `pbpaste` (a `rednote.com/discovery/item/<id>?...xsec_token=...` URL). In the App: 分享 → 复制链接 (an `xhslink.com/...` link).
- Same title within 7 days adds the platform to the existing card. Always pass `--publish-at` with the time the post went (or goes) public on its platform: a future time schedules it (SRfeed shows it from then); a past time is the date its card shows. Registering an older post without it makes the card show today's date. Read the time from the platform (YouTube: the watch page's publish date; Rednote: 笔记管理 shows Beijing time). `<WHEN>` can be plain local time ("2026-11-01T19:00:00", no offset) — read as the user's own timezone and converted to UTC before sending — or an ISO string that already carries an offset/`Z`.
- Free users: 1 share a month (on `monthly_limit`, say so and mention 升级会员). Members: no limit.
- Hook notes: "Registered on SRlink: ..." → tell the user in one line. "New post link(s) ..." → share only if the user just published it, with the title just used; ignore links you only opened.
- The hook (on by default; off after `srlink auto-share off`) runs after Bash and every MCP tool, Claude in Chrome included. On Chrome pages it also spots bare X paths like `/<handle>/status/<id>`, but only for the user's own X handle saved via `srlink handles` (re-run `srlink handles` once to cache it locally).

## 3. Comment on members' posts

1. `srlink feed` → the 10 newest posts you have not commented on, with `links`, `drafts`, `liked`, `mine`.
2. Show the user posts that are not `mine` and not commented, with their drafts. Each draft is one or two sentences.
   Posts that are `mine` carry drafts too: a pinned first comment for the author (a question that invites replies, or one tip). Offer them right after a publish; never `mark` your own post.
3. The user picks a draft (edited or not). Right away, without asking the user to confirm anything: `srlink mark <postId> commented --text "<the final comment>"` and `srlink mark <postId> liked`, the same as clicking a draft on the website. Then the user posts it on the original post, or asks you to post that one comment in Chrome (per the ground rules). Never ask the user to report back that they posted it.
4. `mark <postId> skipped` hides an irrelevant post when the user says to skip it. If the user changes their mind, `mark <postId> commented --off`.

## 4. Monitor my posts (verify support)

Run when the user asks ("check comments", "看看谁支持了我"), or daily if they set up a schedule.
1. `srlink mine` → the user's posts of the last 10 days with their links.
2. For each link, open it in Chrome and read the commenters' account names (and likers, where the platform lists them), with times if shown.
3. Report per link: `srlink observed --url <link> --platform <rednote|youtube|linkedin|x> --comment "<name>@<ISO time>" ... --like "<name>" ...`
4. Tell the user who was verified (`matched`) and how many other commenters there were. Suggest replies to new comments if they want.

Privacy: the server keeps only commenters who are SRlink members (matched by their account names); everyone else is counted and dropped. Do not keep comment text or other people's names anywhere else.

## 5. My new posts (automatic for YouTube)

- `srlink sync` registers the newest (up to 10, last 30 days) videos of the user's YouTube channel that SRlink has not seen: title without hashtags, a 3-5 sentence summary from the description, the YouTube publish time. `srlink schedule on [H]` runs it in the background every H hours (1-24, default 1). A video already registered, or one the user deleted on SRlink, is never registered again.
- Rednote, LinkedIn and X have no public feed. When the user asks (「同步一下我的帖子」), open their profile in Chrome, take the newest posts, and register the ones not in `srlink mine` with `srlink share` (Rednote: the Copy Link share URL, see section 2).
- Session scan (`srlink scan on`): each background run also reads this computer's Claude Code session files changed since the last run (the first run: the past 24 hours) for post links (local only; nothing but the links leaves). A YouTube video is checked with YouTube's public oEmbed: the user's own, published in the last 30 days -> registered. Rednote / LinkedIn / X links wait as candidates (`srlink scan list`); at session start the plugin asks Claude to open each in Chrome, check the author, and either register it (`srlink share`, then `srlink scan mark <url> registered`) or `srlink scan mark <url> not-mine|old`.
- Missing handles (`srlink match`, also in each background run): when a member comments on the user's post through the SRlink feed, SRlink keeps that comment's text. If the member has no account name on that platform, YouTube comments are read without a browser, the matching comment's writer is reported (`srlink claim <postId> <personId> <platform> <handle>`), and the member's handle is filled in and the comment marked verified. Rednote / LinkedIn / X ones are handed to Claude at session start to find in Chrome. The server refuses a handle someone already uses; never claim the user's own account for a member.


# SRlink: publish and register

Read when the user wants to publish a post, register one on SRlink, or a hook note mentions a post link. Commands below are `srlink <command>` = `node <skill folder>/scripts/srlink.cjs <command>`.

## Publish

**If the user has their own posting skill (ytupload, a Rednote skill, anything): use it.** Do not re-post.

**If not, use the built-in flow (YouTube, Rednote, X, TikTok, Instagram, Reddit):**
1. Collect platform(s), title, body, media paths, and a publish time if scheduled.
2. Open the user's own logged-in Chrome. Claude Code: load the Claude in Chrome tools in one ToolSearch call (tabs_context, tabs_create, navigate, computer, find, form_input, read_page, get_page_text). Codex: the Chrome plugin. Any other AI: its own tool that drives the user's Chrome; if it has none, say so and stop here (the user can publish by hand, then you register it).
3. Per platform, in a new tab: YouTube Studio (studio.youtube.com → Create → Upload), Rednote creator center (creator.rednote.com or creator.xiaohongshu.com → Publish Note), X (x.com/compose/post; to attach someone else's video with credit, end the text with their `.../status/<id>/video/1` link), TikTok (tiktok.com/tiktokstudio/upload), Instagram (instagram.com → Create → Post), or Reddit (reddit.com/submit; ask which subreddit, and follow that subreddit's rules). Fill the fields, screenshot the final state, show it, wait for the user's "publish", then click publish.
4. Read the resulting post URL from the page (YouTube: the video link in the done dialog; Rednote: the note in Note Management; X: the newest post's timestamp link on x.com/<handle>; TikTok: the newest video on tiktok.com/@<handle>; Instagram: the newest post or reel on instagram.com/<handle>; Reddit: the post's own page right after submitting, reddit.com/r/<sub>/comments/<id>/...).

**Last step of every publish, whichever skill or tool posted it: register on SRlink.** If a hook note "Registered on SRlink: ..." already appeared for that URL, just relay it. Otherwise run `srlink share` (section 2) yourself with the title just published, then `srlink mine` to confirm the card, and report the post URL and the SRlink result. A publish is not done until this step is.

## Register on SRlink

`srlink share --title "<title>" --summary "<3-5 sentences>" [--publish-at <WHEN>] --link rednote=<url> [--link youtube=<url> ...]`
- Summary: always 3-5 sentences, written from the post's own text (description, caption, script): what it covers, who it is for, what a reader takes away. Never invent facts that are not in the post. Other members' AI comment drafts are written from it.
- Rednote links: register the note's share link, never a bare `.../explore/<id>` or `.../discovery/item/<id>` (blocked for other viewers). In Chrome: open the note from the user's profile, click the share arrow, click Copy Link, read it with `srlink clipboard` (works on macOS, Windows and Linux; a `rednote.com/discovery/item/<id>?...xsec_token=...` URL). In the app: Share → Copy Link (an `xhslink.com/...` link).
- Same title within 7 days adds the platform to the existing card. Always pass `--publish-at` with the time the post went (or goes) public on its platform: a future time schedules it (SRfeed shows it from then); a past time is the date its card shows. Registering an older post without it makes the card show today's date. Read the time from the platform (YouTube: the watch page's publish date; Rednote: Note Management shows Beijing time). `<WHEN>` can be plain local time ("2026-11-01T19:00:00", no offset) — read as the user's own timezone and converted to UTC before sending — or an ISO string that already carries an offset/`Z`.
- Read the reply, do not assume: `{"id":N}` = new card; `"merged":true` = added to an existing card; `"existing":true` = already on SRlink, nothing added; `"existing":true,"deleted":true` = the user deleted it from SRlink earlier, NOT registered. Then `srlink mine` to confirm.
- Free users: 1 share a month (on `monthly_limit`, say so and mention upgrading to a membership). Members: no limit.
- Hook notes: "Registered on SRlink: ..." → tell the user in one line. "New post link(s) ..." → share only if the user just published it, with the title just used; ignore links you only opened.
- The hook (on by default; off after `srlink auto-share off`) runs after shell commands and every MCP tool, browser tools included (Claude Code and Codex: `hooks/hooks.json`; Gemini CLI: the extension's own `hooks/hooks.json`). AIs that load only the skill (Cursor, Copilot, WorkBuddy, Grok and others set up by `srlink setup`) have no hook and get no hook notes: there, `srlink share` as the last publish step is the only way a post reaches SRlink. On Chrome pages it also spots bare X paths like `/<handle>/status/<id>`, but only for the user's own X handle saved via `srlink handles` (re-run `srlink handles` once to cache it locally).

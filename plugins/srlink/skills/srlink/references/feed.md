# SRlink: SRfeed and support

Read when the user wants to read the SRfeed, comment on members' posts, or check who supported their own posts. Commands below are `srlink <command>` = `node <skill folder>/scripts/srlink.cjs <command>`.

SRlink counts comments only: each comment is 1 point in SRscore, and likes are not tracked, marked or reported.

## Comment on members' posts

1. `srlink feed` → the 10 newest posts you have not commented on, with `links`, `drafts`, `mine`.
2. Show the user posts that are not `mine` and not commented, with their drafts. Each draft is one or two sentences.
   Posts that are `mine` carry drafts too: a pinned first comment for the author (a question that invites replies, or one tip). Offer them right after a publish; never `mark` your own post.
3. The user picks a draft (edited or not). Right away, without asking the user to confirm anything: `srlink mark <postId> commented --text "<the final comment>"`, the same as clicking a draft on the website. Then the user posts it on the original post, or asks you to post that one comment in Chrome (per the ground rules). Never ask the user to report back that they posted it.
4. `mark <postId> skipped` hides an irrelevant post when the user says to skip it. If the user changes their mind, `mark <postId> commented --off`.

## Monitor my posts (verify support)

Run when the user asks ("check comments", "who supported me"), or daily if they set up a schedule.
1. `srlink mine` → the user's posts of the last 10 days with their links.
2. For each link, open it in Chrome and read the commenters' account names, with times if shown.
3. Report per link: `srlink observed --url <link> --platform <rednote|youtube|linkedin|x|tiktok|instagram|reddit> --comment "<name>@<ISO time>" ...`
4. Tell the user who was verified (`matched`) and how many other commenters there were. Suggest replies to new comments if they want.

Privacy: the server keeps only commenters who are SRlink members (matched by their account names); everyone else is counted and dropped. Do not keep comment text or other people's names anywhere else.

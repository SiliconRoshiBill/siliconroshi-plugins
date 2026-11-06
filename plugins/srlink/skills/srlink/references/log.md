# SRlink: the request log

Read when the user asks whether a post reached SRlink, or reports a problem. Commands below are `srlink <command>` = `node <skill folder>/scripts/srlink.cjs <command>`.

## Did it reach SRlink? (the log)

Every request to the SRlink server is written to `~/.srlink/logs/YYYY-MM-DD.jsonl` (kept 14 days; tokens never written): when, which entry point (`srlink share`, `hook`, `run-sync`...), what was sent, the status and the reply. `srlink log [N]` prints the last N in plain words.

- Never tell the user a post is on SRlink from memory or from a hook note alone: `srlink mine` must show the card. If it does not, `srlink log 20` shows whether the share was ever sent and what the server answered; show the user that row.
- When the user reports a problem to SiliconRoshi, the request id in brackets (`[c10d8658]`) is what the server's logs are searched by.

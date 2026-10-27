# SiliconRoshi Plugins

One plugin marketplace for every SiliconRoshi plugin. Add it once, then install any plugin from it by name. It works in Claude Code and Codex; `srlink` also installs in Gemini CLI.

Site: https://www.siliconroshi.ai

## Install

Inside a Claude Code session:

```
/plugin marketplace add SiliconRoshiBill/siliconroshi-plugins
/plugin install heropedia@siliconroshi
/plugin install srlink@siliconroshi
```

Or from your terminal:

```bash
claude plugin marketplace add SiliconRoshiBill/siliconroshi-plugins
claude plugin install heropedia@siliconroshi
claude plugin install srlink@siliconroshi
```

Install only the plugins you want. Open a new Claude Code session afterwards.

### Codex

Codex reads this same marketplace:

```bash
codex plugin marketplace add SiliconRoshiBill/siliconroshi-plugins
codex plugin add srlink@siliconroshi
```

Open a new Codex session afterwards.

### Gemini CLI (srlink)

```bash
gemini extensions install https://github.com/SiliconRoshiBill/siliconroshi-plugins
```

This installs the `srlink` extension (`gemini-extension.json`, `hooks/` and `skills/` at the repo root). Open a new Gemini CLI session afterwards.

## Plugins

| Plugin | What it does | Source |
| --- | --- | --- |
| `heropedia` | Ask 324+ expert personas (Warren Buffett, Steve Jobs, Charlie Munger, ...) through the Heropedia MCP server. | [SiliconRoshiBill/heropedia-plugin](https://github.com/SiliconRoshiBill/heropedia-plugin) |
| `srlink` | SRlink, SiliconRoshi's member network: register your posts, read the SRfeed, see who supported you. | [plugins/srlink](plugins/srlink) |

## Update

```
/plugin marketplace update siliconroshi
```

Terminal: `claude plugin marketplace update siliconroshi`, then `claude plugin update <name>@siliconroshi`. Codex: `codex plugin marketplace upgrade siliconroshi`. Gemini CLI: `gemini extensions update srlink`.

## Already using Heropedia?

If you installed Heropedia from its own marketplace (`claude plugin install heropedia@heropedia`), nothing changes: that marketplace stays live and keeps working. You can keep it, or switch to `heropedia@siliconroshi` to get all our plugins from one place. Both point at the same plugin, so enable only one of them.

## Development

```bash
bash scripts/validate.sh   # strict manifest checks, plugin lint, tests, secret/path greps
npm test                   # node tests for vendored plugins
```

`heropedia` lives in its own repository and is referenced by an HTTPS git source (no SSH key needed). `srlink` is vendored under `plugins/srlink` (its earlier history is merged in).

The Gemini CLI extension at the repo root carries a copy of `plugins/srlink/skills/srlink`. After changing the skill, run `bash scripts/sync-gemini.sh`; `validate.sh` fails while the copies differ.

## License

MIT

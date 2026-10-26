# SiliconRoshi Plugins for Claude Code

One Claude Code plugin marketplace for every SiliconRoshi plugin. Add it once, then install any plugin from it by name.

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

## Plugins

| Plugin | What it does | Source |
| --- | --- | --- |
| `heropedia` | Ask 324+ expert personas (Warren Buffett, Steve Jobs, Charlie Munger, ...) through the Heropedia MCP server. | [SiliconRoshiBill/heropedia-plugin](https://github.com/SiliconRoshiBill/heropedia-plugin) |
| `srlink` | SRlink, SiliconRoshi's member network: register your posts, read the SRfeed, see who supported you. | [plugins/srlink](plugins/srlink) |

## Update

```
/plugin marketplace update siliconroshi
```

Terminal: `claude plugin marketplace update siliconroshi`, then `claude plugin update <name>@siliconroshi`.

## Already using Heropedia?

If you installed Heropedia from its own marketplace (`claude plugin install heropedia@heropedia`), nothing changes: that marketplace stays live and keeps working. You can keep it, or switch to `heropedia@siliconroshi` to get all our plugins from one place. Both point at the same plugin, so enable only one of them.

## Development

```bash
bash scripts/validate.sh   # strict manifest checks, plugin lint, tests, secret/path greps
npm test                   # node tests for vendored plugins
```

`heropedia` lives in its own repository and is referenced by an HTTPS git source (no SSH key needed). `srlink` is vendored under `plugins/srlink` (its earlier history is merged in).

## License

MIT

---

## 中文

这是 SiliconRoshi 所有 Claude Code 插件的统一插件市场。加一次市场,以后装哪个插件都只要一行。

**安装**

在 Claude Code 会话里:

```
/plugin marketplace add SiliconRoshiBill/siliconroshi-plugins
/plugin install heropedia@siliconroshi
/plugin install srlink@siliconroshi
```

或在终端里:

```bash
claude plugin marketplace add SiliconRoshiBill/siliconroshi-plugins
claude plugin install heropedia@siliconroshi
claude plugin install srlink@siliconroshi
```

需要哪个装哪个。装完开一个新的 Claude Code 会话。

**插件**

| 插件 | 用途 |
| --- | --- |
| `heropedia` | 通过 Heropedia MCP 服务器,请 324 位以上的专家人物(巴菲特、乔布斯、芒格……)当参谋。 |
| `srlink` | SRlink,SiliconRoshi 的会员网络:登记你发的帖子,看 SRfeed,看谁支持了你。 |

**更新**

```
/plugin marketplace update siliconroshi
```

**已经装过 Heropedia?**

从 Heropedia 自己的市场装的(`heropedia@heropedia`)照常能用,那个市场继续保留。想统一管理可以改装 `heropedia@siliconroshi`;两个是同一个插件,只启用其中一个即可。

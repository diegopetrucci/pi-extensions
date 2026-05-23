# librarian

A pi GitHub research scout inspired by `pi-librarian`, with a local checkout cache enabled by default.

When the `librarian` tool runs, it can cache/reuse repository checkouts locally. Use `/librarian-cache off` to force GitHub API/search and temporary fetched files only, or `/librarian-cache on` to re-enable cached local checkouts.

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-librarian
```

### Collection package

```bash
pi install npm:@diegopetrucci/pi-extensions
```

### GitHub package

```bash
pi install git:github.com/diegopetrucci/pi-extensions
```

Then reload pi:

```text
/reload
```

## Behavior

- Tool name: `librarian`
- Uses a restricted subagent with `bash` and `read`
- Uses `gh` for GitHub search/API access
- Uses cached local checkouts by default
- Toggle cache behavior for future calls with `/librarian-cache on | off | toggle | status`
- Cached repos are removed lazily after 7 days without use

## Commands

```text
/librarian-cache status
/librarian-cache off
/librarian-cache on
/librarian-cache toggle
```

The command works in interactive mode, RPC mode, and print/JSON mode. It writes a global preference to `~/.pi/agent/extensions/librarian.json`, so separate non-UI invocations use the same setting. In non-UI modes, command feedback is written to stderr so stdout remains usable for normal output or JSON events.

## Cache location

macOS:

```text
~/Library/Caches/pi-librarian/repos/github.com/<owner>/<repo>
```

Linux:

```text
${XDG_CACHE_HOME:-~/.cache}/pi-librarian/repos/github.com/<owner>/<repo>
```

Windows:

```text
%LOCALAPPDATA%\pi-librarian\repos\github.com\<owner>\<repo>
```

Override the cache root if needed:

```bash
export PI_LIBRARIAN_CACHE_ROOT="$HOME/Library/Caches/pi-librarian/repos"
```

## Requirements

- GitHub CLI (`gh`) installed and authenticated for private repositories you want to inspect
- `git` for local checkout caching
- common shell tools such as `rg`, `jq`, and `base64` for best results

## Notes

Do not install this alongside another extension that registers a `librarian` tool unless you intentionally want duplicate/conflicting tool names.

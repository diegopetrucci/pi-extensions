# librarian

A pi GitHub research scout inspired by `pi-librarian`, with an opt-in local checkout cache.

When the `librarian` tool runs, it asks whether to cache/reuse repository checkouts locally. If you say no, cancel, time out, or run without UI, it uses GitHub API/search and temporary fetched files only.

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
- Asks on each call whether to use cached local checkouts
- Defaults to no checkout/cache
- Cached repos are removed lazily after 30 days without use

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

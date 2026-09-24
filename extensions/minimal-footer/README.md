# minimal-footer

A minimal custom footer for pi.

![minimal-footer preview](https://raw.githubusercontent.com/diegopetrucci/pi-extensions/main/assets/minimal-footer-preview.png)

It replaces pi's built-in footer with a cleaner two-line layout that focuses on the information I care about most:

- current git branch
- TLH-style git dirty counts, ahead/behind counts, and optional PR number
- current repo name
- current context percentage
- red `DUMB ZONE` indicator when context usage is above 200k tokens
- current model and thinking level
- OpenAI Codex usage windows, labeled from the durations reported by OpenAI
- `xp` marker when Pi experimental features are enabled

## Layout

On wide terminals it renders two lines:

```text
<git-branch> · <git-status>                          <repo-name>
<context-%>                                     <model> <thinking>
```

Example:

```text
fix/remove-detached-image-tasks                     SendItToMy
44.1%                                              gpt-5.4 high
```

When the project is trusted and the repo has local or remote git state, the top-left line includes the same cached summary as `git-footer`:

```text
main · +1 ~2 ?3 ↑1 • PR #42
```

The markers are `!` conflicts, `+` staged, `~` unstaged, `?` untracked, `↑` ahead, and `↓` behind. PR numbers are fetched best-effort with `gh pr view`. Git polling is skipped until Pi reports that the project is trusted, and `git status` is run with fsmonitor disabled.

When context usage is above 200k tokens, the bottom-left line includes a red warning:

```text
44.1% · DUMB ZONE
```

When using `openai-codex`, the bottom-left line also includes subscription usage. A typical account with both windows looks like:

```text
44.1% · 5h 12% · 7d 38%
```

Window labels come from OpenAI's reported durations, so an account that reports only a weekly primary window is shown correctly (for example, `7d 38%`) instead of being assumed to have a 5-hour window.

When `PI_EXPERIMENTAL=1`, the bottom-left line also includes an experimental marker:

```text
44.1% · xp
```

On narrow terminals it falls back to one item per line.

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-minimal-footer
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

## Configuration

Config files are merged, with project config overriding global config:

- `~/<pi-config-dir>/agent/extensions/minimal-footer.json`
- `<project>/<pi-config-dir>/minimal-footer.json`

Here `<pi-config-dir>` is Pi's runtime config directory name (`CONFIG_DIR_NAME`; `.pi` by default). Project config is only read after Pi reports that the project is trusted.

A ready-to-copy sample file is included at [`minimal-footer.example.json`](./minimal-footer.example.json).

Example:

```json
{
  "context": {
    "showPercent": true,
    "dumbZone": {
      "enabled": true,
      "thresholdTokens": 200000,
      "label": "DUMB ZONE",
      "color": "error"
    }
  },
  "codexUsage": {
    "enabled": true,
    "cacheTtlMs": 300000,
    "requestTimeoutMs": 10000,
    "windows": {
      "primary": {
        "enabled": true,
        "label": "auto"
      },
      "secondary": {
        "enabled": true,
        "label": "auto"
      }
    }
  },
  "experimentalMarker": {
    "enabled": true,
    "label": "xp",
    "color": "warning"
  },
  "gitStatus": {
    "enabled": true,
    "refreshIntervalMs": 8000,
    "gitTimeoutMs": 1500,
    "ghTimeoutMs": 3000
  }
}
```

Disable `DUMB ZONE`:

```json
{
  "context": {
    "dumbZone": {
      "enabled": false
    }
  }
}
```

Disable OpenAI Codex session-limit usage entirely:

```json
{
  "codexUsage": {
    "enabled": false
  }
}
```

Disable one session-limit window:

```json
{
  "codexUsage": {
    "windows": {
      "secondary": {
        "enabled": false
      }
    }
  }
}
```

Disable the experimental-features marker:

```json
{
  "experimentalMarker": {
    "enabled": false
  }
}
```

Disable git dirty/ahead/PR status:

```json
{
  "gitStatus": {
    "enabled": false
  }
}
```

### Config fields

- `context.showPercent`: show the context percentage
- `context.dumbZone.enabled`: show `DUMB ZONE` when context tokens exceed the threshold
- `context.dumbZone.thresholdTokens`: token threshold for `DUMB ZONE`
- `context.dumbZone.label`: warning text
- `context.dumbZone.color`: theme color for the warning (`error`, `warning`, `accent`, `text`, or `dim`)
- `codexUsage.enabled`: show OpenAI Codex session-limit usage when using `openai-codex`
- `codexUsage.cacheTtlMs`: in-memory usage cache duration
- `codexUsage.requestTimeoutMs`: usage request timeout
- `codexUsage.windows.primary.enabled`: show the primary usage window
- `codexUsage.windows.primary.label`: `"auto"` derives the primary label from OpenAI's reported duration; any other value overrides it
- `codexUsage.windows.secondary.enabled`: show the secondary usage window
- `codexUsage.windows.secondary.label`: `"auto"` derives the secondary label from OpenAI's reported duration; any other value overrides it
- `experimentalMarker.enabled`: show the marker when `PI_EXPERIMENTAL=1`
- `experimentalMarker.label`: marker text
- `experimentalMarker.color`: theme color for the marker (`error`, `warning`, `accent`, `text`, or `dim`)
- `gitStatus.enabled`: show cached git dirty counts, ahead/behind counts, and optional PR number for trusted projects
- `gitStatus.refreshIntervalMs`: background git status refresh interval
- `gitStatus.gitTimeoutMs`: timeout for `git status --porcelain=v2 --branch`
- `gitStatus.ghTimeoutMs`: timeout for best-effort `gh pr view`

## What it shows

- **Top left:** current git branch plus dirty/ahead/PR status when available
- **Top right:** current repo directory name
- **Bottom left:** current context usage percentage, plus red `DUMB ZONE` above 200k context tokens
- **Bottom left on `openai-codex`:** current context usage percentage plus the Codex usage windows reported for the account
- **Bottom left with `PI_EXPERIMENTAL=1`:** current context usage percentage plus `xp`
- **Bottom right:** model id and thinking level

## Publishing notes

This extension also lives inside the broader [`pi-extensions`](../../README.md) collection, but it is set up to be publishable as its own npm package too.

## Notes

- Replaces pi's built-in footer entirely.
- Uses pi footer data for git branch updates, plus background cached git/gh checks for dirty counts and PR number after project trust is granted.
- Shows only context percentage, not context window size.
- Shows `DUMB ZONE` only while context usage is above 200k tokens.
- Shows the model id rather than a provider-specific display label.
- Shows `xp` when `PI_EXPERIMENTAL=1`.
- For `openai-codex`, reads pi's stored OAuth login and fetches usage from ChatGPT's backend usage endpoint. Window labels are inferred from each window's reported duration; missing or unrecognized durations use neutral `usage` labels rather than guessing from window position.
- Usage is cached briefly in memory and refreshed after turns.

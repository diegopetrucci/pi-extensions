# notify

A pi extension that sends notifications when the agent has fully settled and is waiting for input.

This started from the original `notify.ts` example in [`earendil-works/pi`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/notify.ts), but now supports multiple notification channels and JSON configuration.

## Supported notification channels

### Terminal notifications

- OSC 777: Ghostty, iTerm2, WezTerm, rxvt-unicode
- OSC 99: Kitty

Both are wrapped in tmux's DCS passthrough automatically when `$TMUX` is set;
see [Running inside tmux](#running-inside-tmux).

### Desktop notifications

- macOS Notification Center via `osascript`
- Linux desktop notifications via `notify-send`
- Windows toast notifications via `powershell.exe` / Windows Terminal / WSL

### Bells and sounds

- terminal bell (`\a`)
- macOS sound playback via `afplay`
- Linux sound playback via `canberra-gtk-play` or `paplay`
- Windows beep via `powershell.exe`

By default, these channels are enabled:

- terminal notification
- desktop notification
- bell

Sound remains available as an opt-in option via config.

The extension automatically picks the appropriate backend for the current environment.

### Permission-prompt notifications

When [`@gotgenes/pi-permission-system`](https://www.npmjs.com/package/@gotgenes/pi-permission-system) is also installed, this extension can additionally notify right before that package shows an interactive permission prompt (bash/path/tool approval, etc.) — not just when the whole agent turn settles. This is off by default, since it fires mid-turn rather than only when Pi goes idle.

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-notify
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

- `~/<pi-config-dir>/agent/extensions/notify.json`
- `<project>/<pi-config-dir>/notify.json`

Here `<pi-config-dir>` is Pi's runtime config directory name (`CONFIG_DIR_NAME`; `.pi` by default). Project config is only read after Pi reports that the project is trusted.

A ready-to-copy sample file is included at [`notify.example.json`](./notify.example.json).

Example:

```json
{
  "enabled": true,
  "onlyWhenInteractive": true,
  "title": "Pi",
  "body": "Ready for input",
  "channels": {
    "terminal": true,
    "desktop": true,
    "bell": true,
    "sound": false
  },
  "terminal": {
    "backend": "auto",
    "tmuxPassthrough": "auto"
  },
  "desktop": {
    "backend": "auto"
  },
  "sound": {
    "backend": "auto",
    "name": "Glass",
    "linuxSoundId": "complete",
    "frequencyHz": 1000,
    "durationMs": 250,
    "command": ""
  },
  "permissionPrompt": {
    "enabled": false,
    "title": "Pi permission request",
    "body": "{surface}: {value}",
    "channels": {
      "terminal": false,
      "desktop": true,
      "bell": false,
      "sound": false
    }
  }
}
```

### Notify on permission prompts

Set `permissionPrompt.enabled` to `true` to also notify when [`@gotgenes/pi-permission-system`](https://www.npmjs.com/package/@gotgenes/pi-permission-system) is about to show an interactive prompt (its `permissions:ui_prompt` broadcast). This is independent of the top-level `channels`/`title`/`body` used for the settled notification — it has its own `channels`, `title`, and `body`, and reuses the same `terminal`/`desktop`/`sound` backend settings.

`title` and `body` support `{surface}`, `{value}`, and `{pattern}` placeholders, filled in from the prompt's normalized display projection (for example `surface: "bash"`, `value: "git push"`, `pattern: "git *"`). A placeholder resolves to an empty string when the underlying field isn't a string for that particular ask.

Minimal example (desktop + sound only, matching the top-level `notify.json` this repo ships by default):

```json
{
  "permissionPrompt": {
    "enabled": true,
    "channels": {
      "desktop": true,
      "sound": true
    }
  }
}
```

If `@gotgenes/pi-permission-system` isn't installed, this setting has no effect: the event it listens for is simply never emitted.

### Running inside tmux

Under tmux, terminal notifications need one line in your `tmux.conf`:

```tmux
set -g allow-passthrough all
```

Without it, notifications never reach your terminal. tmux is the terminal
emulator for the pane, so the escape sequence is delivered to tmux rather than
to the terminal that can act on it. tmux has no OSC 777 or OSC 99 handler
(checked in 3.7b, whose OSC dispatch covers 4/7/8/9;4/10/11/12/52/104/133) and
does not forward OSC codes it does not recognise, so the notification is parsed
and silently dropped. Desktop, bell, and sound channels are unaffected.

This extension therefore wraps terminal notifications in tmux's DCS passthrough
(`ESC P tmux ; … ESC \`), which asks tmux to forward the payload to the outer
terminal verbatim — but tmux only honours that when `allow-passthrough` is on.

Use `all` rather than `on`: under `on`, tmux only honours passthrough from panes
that are currently *visible*, which discards exactly the notification you want —
the one fired while you are looking at another window. The trade-off is that
`all` lets a program in any pane write bytes straight to the attached terminal;
notification sequences render nothing, but a malformed passthrough from a
background pane can garble the display, since those bytes bypass tmux's screen
model.

Set `terminal.tmuxPassthrough` to `never` to opt out of wrapping (for example if
your multiplexer forwards these codes itself), or `always` to force it when
`$TMUX` is not visible in the environment. Wrapping is safe to leave on `auto`:
with passthrough disabled in tmux, a wrapped sequence is dropped exactly like a
bare one, so nothing regresses.

### Enable sound

Minimal example:

```json
{
  "channels": {
    "sound": true
  }
}
```

You can also customize the sound backend and options if needed.

### Config fields

- `enabled`: master on/off switch
- `onlyWhenInteractive`: skip notifications in print / non-UI mode
- `title`: notification title
- `body`: notification body
- `channels.terminal`: enable terminal notification output
- `channels.desktop`: enable OS desktop notifications
- `channels.bell`: enable terminal bell
- `channels.sound`: enable sound playback
- `terminal.backend`: `auto`, `osc777`, `osc99`, `none`
- `terminal.tmuxPassthrough`: `auto` (wrap when `$TMUX` is set), `always`, `never`
- `desktop.backend`: `auto`, `macos`, `linux`, `windows-toast`, `none`
- `sound.backend`: `auto`, `macos`, `linux`, `windows-beep`, `command`, `none`
- `sound.name`: macOS system sound name, like `Glass` or `Hero`
- `sound.linuxSoundId`: freedesktop sound id, like `complete`
- `sound.frequencyHz`: Windows beep frequency
- `sound.durationMs`: Windows beep duration
- `sound.command`: custom shell command when `sound.backend` is `command`
- `permissionPrompt.enabled`: master on/off switch for permission-prompt notifications (default `false`)
- `permissionPrompt.title`: notification title template; supports `{surface}`, `{value}`, `{pattern}`
- `permissionPrompt.body`: notification body template; supports `{surface}`, `{value}`, `{pattern}`
- `permissionPrompt.channels.terminal` / `.desktop` / `.bell` / `.sound`: enable channels for the permission-prompt notification independently from the settled notification's `channels`

## Notes

- Hooks the `agent_settled` event so automatic retries, compaction retries, and queued follow-ups do not trigger intermediate notifications.
- Optionally also hooks the `permissions:ui_prompt` event broadcast by `@gotgenes/pi-permission-system` (when installed) to notify right before an interactive permission prompt is shown; see [Notify on permission prompts](#notify-on-permission-prompts). Disabled by default.
- Terminal notifications are wrapped for tmux when `$TMUX` is set, which also requires `set -g allow-passthrough all` in `tmux.conf`.
- Default message is `Pi` / `Ready for input`.
- Terminal, desktop, bell, and sound channels can be enabled independently.
- To opt into sound playback, set `channels.sound` to `true`.

# notify

A pi extension that sends notifications when the agent has fully settled and is waiting for input.

This started from the original `notify.ts` example in [`earendil-works/pi`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/notify.ts), but now supports multiple notification channels and JSON configuration.

## Supported notification channels

### Terminal notifications

- OSC 777: Ghostty, iTerm2, WezTerm, rxvt-unicode
- OSC 99: Kitty

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
    "backend": "auto"
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
  }
}
```

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
- `desktop.backend`: `auto`, `macos`, `linux`, `windows-toast`, `none`
- `sound.backend`: `auto`, `macos`, `linux`, `windows-beep`, `command`, `none`
- `sound.name`: macOS system sound name, like `Glass` or `Hero`
- `sound.linuxSoundId`: freedesktop sound id, like `complete`
- `sound.frequencyHz`: Windows beep frequency
- `sound.durationMs`: Windows beep duration
- `sound.command`: custom shell command when `sound.backend` is `command`

## Notes

- Hooks the `agent_settled` event so automatic retries, compaction retries, and queued follow-ups do not trigger intermediate notifications.
- Default message is `Pi` / `Ready for input`.
- Terminal, desktop, bell, and sound channels can be enabled independently.
- To opt into sound playback, set `channels.sound` to `true`.

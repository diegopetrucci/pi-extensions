# Release notes — v0.1.9

## Highlights

This release upgrades the `notify` extension with configurable multi-channel notifications.

## Changed

- `notify` now supports multiple notification channels at once:
  - terminal notifications
  - desktop notifications
  - terminal bell
  - sound playback
- all notification channels are enabled by default
- notification title and body are now configurable
- backends are now configurable per channel
- added merged JSON config support:
  - `~/.pi/agent/extensions/notify.json`
  - `<project>/.pi/notify.json`
- added a ready-to-copy sample config file:
  - `extensions/notify/notify.example.json`

## Backend support

- terminal:
  - OSC 777: Ghostty, iTerm2, WezTerm, rxvt-unicode
  - OSC 99: Kitty
- desktop:
  - macOS Notification Center via `osascript`
  - Linux desktop notifications via `notify-send`
  - Windows toast via `powershell.exe`
- sound:
  - macOS via `afplay`
  - Linux via `canberra-gtk-play` or `paplay`
  - Windows beep via `powershell.exe`

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.9`
- standalone notify package: `@diegopetrucci/pi-notify@0.1.1`

## Suggested release blurb

`v0.1.9 upgrades notify with configurable terminal, desktop, bell, and sound notifications, plus a sample config file and per-project overrides.`

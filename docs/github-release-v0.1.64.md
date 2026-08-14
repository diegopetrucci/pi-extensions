Terminal notifications now reach the outer terminal when Notify runs inside tmux, with configurable passthrough behavior.

## Highlights

- Forwards OSC 777 and OSC 99 terminal notifications through tmux's DCS passthrough when `$TMUX` is set.
- Supports `terminal.tmuxPassthrough` values `auto`, `always`, and `never`.
- tmux users should set `set -g allow-passthrough all` in `tmux.conf` so forwarded notifications reach the outer terminal.
- Leaves desktop, bell, and sound notification channels unchanged.

## Packages

- `@diegopetrucci/pi-notify@0.1.16`
- `@diegopetrucci/pi-extensions@0.1.64`

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
```

<!-- prepare-release:packages [["@diegopetrucci/pi-notify","0.1.16"],["@diegopetrucci/pi-extensions","0.1.64"]] -->

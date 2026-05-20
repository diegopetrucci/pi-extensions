# Announcement copy — v0.1.30

## Short post

Released `@diegopetrucci/pi-extensions@0.1.30` and `@diegopetrucci/pi-oracle@0.1.9`.

This release adds persisted `/oracle` defaults: set the Oracle model and thinking level once, and future automatic oracle calls respect them unless the agent passes a per-call override.

Install:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

or standalone:

```bash
pi install npm:@diegopetrucci/pi-oracle
```

Standalone package: `@diegopetrucci/pi-oracle@0.1.9`.

## X / Twitter version

Released `@diegopetrucci/pi-extensions@0.1.30` / `@diegopetrucci/pi-oracle@0.1.9`.

Adds persisted `/oracle` model and thinking defaults so automatic Oracle calls respect your preferred model/reasoning level unless a tool call overrides them.

## Very short version

Released `pi-oracle@0.1.9` / `pi-extensions` v0.1.30.

Adds persisted `/oracle` model + thinking defaults.

## Discord / forum version

`pi-oracle@0.1.9` / `pi-extensions@0.1.30` is out.

This release adds a `/oracle` configuration command for persisted Oracle defaults. You can set a default model with `/oracle model <provider/model>` and a default thinking level with `/oracle thinking high`; future automatic oracle tool calls use those defaults unless the agent passes an explicit per-call override.

Full collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone package:

```bash
pi install npm:@diegopetrucci/pi-oracle
```

The standalone package version is `@diegopetrucci/pi-oracle@0.1.9`.

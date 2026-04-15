# pi-extensions

A collection of [pi](https://github.com/badlogic/pi-mono) agent extensions I made.

## Included extensions

| Extension | Description |
|---|---|
| [`minimal-footer`](./extensions/minimal-footer) | Replaces pi's built-in footer with a minimal two-line layout: branch/repo on the first line, context/model on the second. |

## Install

### GitHub

Install the repo as a pi package:

```bash
pi install git:github.com/diegopetrucci/pi-extensions
```

Or pin to a tagged version:

```bash
pi install git:github.com/diegopetrucci/pi-extensions@v0.1.2
```

### npm

Install the full collection from npm:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Then reload pi:

```text
/reload
```

## Install only one extension

If you only want one extension, you have two options.

### Option 1: install the standalone npm package

```bash
pi install npm:@diegopetrucci/pi-minimal-footer
```

### Option 2: filter the repo package

If you prefer the collection package, you can filter it in your pi settings:

```json
{
  "packages": [
    {
      "source": "npm:@diegopetrucci/pi-extensions",
      "extensions": ["extensions/minimal-footer/index.ts"]
    }
  ]
}
```

## npm publishing

The repo is set up to support both:

- the collection package: `@diegopetrucci/pi-extensions`
- standalone extension packages like `@diegopetrucci/pi-minimal-footer`

## Repository structure

Each extension lives in its own subdirectory under [`extensions/`](./extensions). This keeps the repo easy to grow while still letting each extension carry its own package metadata and documentation.

## License

[MIT](./LICENSE)

# pi-extensions

A small collection of [pi](https://github.com/badlogic/pi-mono) extensions.

## Included extensions

| Extension | Description |
|---|---|
| [`minimal-footer`](./extensions/minimal-footer) | Replaces pi's built-in footer with a minimal two-line layout: branch/repo on the first line, context/model on the second. |

## Install

Install the repo as a pi package:

```bash
pi install git:github.com/diegopetrucci/pi-extensions
```

Then reload pi:

```text
/reload
```

## Enable only specific extensions

If you only want one extension from this repo, filter it in your pi settings:

```json
{
  "packages": [
    {
      "source": "git:github.com/diegopetrucci/pi-extensions",
      "extensions": ["extensions/minimal-footer/index.ts"]
    }
  ]
}
```

## Repository structure

Each extension lives in its own subdirectory under [`extensions/`](./extensions). This keeps the repo easy to grow while still letting each extension carry its own package metadata and documentation.

## License

[MIT](./LICENSE)

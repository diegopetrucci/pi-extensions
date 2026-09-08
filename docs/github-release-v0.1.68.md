Dynamic Context Pruning now uses a more conservative mid-loop pruning threshold to reduce prompt-cache invalidation while the agent iterates.

## Highlights

- **Conservative mid-loop pruning.** The default break-even threshold is now `mid_loop=1`, while `idle` remains `22`. This follows the measured corpus at `cachedPriceRatio=0.1`; it is not a claim that mid-loop pruning can never pay off.
- **Accurate status.** `/context-pruning status` shows both effective state thresholds, including custom overrides and fallback values.
- **Existing controls preserved.** Manual prunes and persisted decisions still bypass the gate. Set `gate.breakEvenThresholdByState.mid_loop` to `22` to restore the previous threshold. Existing saved overrides remain in effect.
- **Compatibility unchanged.** Fleet certification remains Pi 0.84.4; this release does not certify a new Pi version.

## Packages

- `pi-dynamic-context-pruning@0.1.9`
- `@diegopetrucci/pi-extensions@0.1.68`

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Or install the standalone extension:

```bash
pi install npm:pi-dynamic-context-pruning
```

Then run `/reload` in Pi.

<!-- prepare-release:packages [["pi-dynamic-context-pruning","0.1.9"],["@diegopetrucci/pi-extensions","0.1.68"]] -->

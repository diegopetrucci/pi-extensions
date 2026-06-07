# illustrations-to-explain-things

A pi skill for generating clean, absurd Xiaohei-style article illustrations, shot lists, image edits, and visual metaphors.

The skill helps the agent turn one key judgment, process, structure, state, or metaphor from source material into a sparse 16:9 hand-drawn explainer image with Xiaohei as the causal actor.

## Use cases

- Article and blog-post inline illustrations
- Shot lists for longer essays or Notion pages
- Visual metaphors for workflows, methods, structures, and states
- Focused image-generation prompts with style and QA constraints

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-illustrations-to-explain-things
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

## Usage

Ask pi for article illustrations or use the skill command directly:

```text
/illustrations-to-explain-things propose a shot list for @article.md
```

```text
Generate three Xiaohei-style illustrations for this workflow: ...
```

By default, response text, shot lists, and handwritten image labels are in English unless you explicitly ask for another language.

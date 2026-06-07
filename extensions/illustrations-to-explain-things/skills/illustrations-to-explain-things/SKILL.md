---
name: illustrations-to-explain-things
description: Generate clean, absurd article illustrations in Ian's Xiaohei style. Use this skill when the user wants inline illustrations, shot lists, image edits, or visual metaphors for articles, blog posts, Notion pages, workflows, methods, structures, states, or key ideas. Default all response text and handwritten image labels to English unless the user explicitly requests another language.
---

# Illustrations to Explain Things

## Core positioning

Design and generate 16:9 landscape article illustrations. The goal is not commercial illustration, formal PPT infographics, or cute cartoon art. The goal is to turn one key judgment, process, structure, state, or metaphor from the source material into a clean, strange, memorable hand-drawn explainer image.

The default recurring character is Xiaohei: a small solid-black figure with white dot eyes, tiny legs, and a blank serious expression, doing something absurd but functional. Xiaohei must perform the core action in the image rather than standing off to the side as decoration.

## Default language policy

- Default to **English** for response text, shot lists, and handwritten image labels.
- Switch to another language only if the user explicitly asks for it.
- If the user requests another language, keep that language consistent across both the written response and the image labels.

## Read these references as needed

Load only what is relevant to the current task instead of stuffing all references into context:

- `references/style-dna.md`: style DNA, color rules, label rules, and anti-patterns.
- `references/xiaohei-ip.md`: Xiaohei character design, personality, action library, and prohibitions.
- `references/composition-patterns.md`: structure types, metaphor-invention method, and anti-copy rules.
- `references/prompt-template.md`: single-image generation prompt template.
- `references/qa-checklist.md`: post-generation review and iteration rules.
- `assets/examples/`: low-frequency visual calibration only. Do not copy these example compositions, objects, or labels.

## Workflow

### 1. Digest the source material

Read the article, link, Notion page, Markdown file, screenshot, or topic the user provided. Extract:

- the core claim
- the paragraphs that carry the cognitive turning points
- the ideas that truly benefit from illustration
- the parts that should stay as text and do not need images

Do not distribute illustrations evenly. Prefer cognitive anchors such as core judgments, breakpoints, input/output loops, splits, before/after contrasts, one-input-many-outputs patterns, handoff paths, common traps, or role-state changes.

### 2. Propose the illustration strategy first

If the user asks how to illustrate the piece, think through it first and output a shot list. For each image, specify:

- where it should appear
- the theme
- the core idea
- the structure type
- what Xiaohei is doing
- suggested elements
- suggested handwritten labels in English

Default to 4-8 images. For very short pieces, 1-3 may be enough. Even for long pieces, avoid going past 9 unless the user clearly needs more.

### 3. Generate single images

If the user clearly asks you to generate, output, or make images, do not pause for confirmation. Use the built-in `image_gen` tool and generate each image separately. Do not combine multiple concepts into one image.

Each image should express only one core structure. The prompt must include:

- 16:9 landscape article illustration
- pure white background
- black hand-drawn line art
- sparse red/orange/blue handwritten labels, in English by default
- lots of whitespace
- Xiaohei as the actor performing the core conceptual action
- prohibitions against PPT slides, commercial illustration, childish/cute styling, dense architecture diagrams, and top-left type titles

Do not copy older example compositions. Examples are only for line density, whitespace, restraint, and Xiaohei participation. Unless the user explicitly asks to imitate a specific example, invent a fresh metaphor for the current article.

### 4. Review and iterate

After generation, check the result against `references/qa-checklist.md`. If you see any of the following, regenerate or make a focused edit:

- Xiaohei is decorative instead of causal
- the canvas feels too full
- the result looks like a flowchart or PPT slide
- labels are too long or contain obvious errors
- the image has a top-left title such as "Workflow" or "Common traps"
- the style drifts into cute, childish, or stiff
- the background is not clean white

### 5. Save and deliver

If the user is working inside a writable workspace, copy the final images to:

```text
assets/<article-slug>-illustrations/
```

Name them in order:

```text
01-topic-name.png
02-topic-name.png
```

Keep original generated files rather than overwriting existing assets, unless the user explicitly asks to replace them.

## Delivery style

Keep planning outputs short and precise. After generating images, report:

- how many images were generated
- what each image is for
- where the files were saved
- which results are strongest and which are optional

Do not spend paragraphs explaining the style theory. Let the images do the work.

# QA Checklist

## Must-pass checks

- It is a 16:9 landscape image.
- The background is clean white.
- Xiaohei is present.
- Xiaohei performs the core action instead of acting as decoration.
- The composition is not a copy of an old example; it uses a new metaphor for the current article.
- The image feels strange, inventive, and interesting.
- The canvas stays clean and sparse, with the subject using no more than about 60% of the space.
- One image explains only one core structure.
- Handwritten labels are few, short, and legible.
- Orange is used only for the main path or arrows.
- Red is used only for key points, warnings, problems, or results.
- Blue is used only for supporting notes, feedback, or system state.
- Unless the user explicitly requested another language, the response text and handwritten image labels are in English.

## Failure signals

If any of these appear, regenerate or make a focused edit:

- There is a top-left title such as "Common traps," "Workflow," "System architecture," or "Route map."
- Xiaohei looks like a mascot, sticker, reaction image, or cute cartoon.
- The image looks like a PPT slide, courseware page, or formal flowchart.
- There are too many elements, arrows, or nodes.
- The labels turn into sentence-length explanations.
- The background contains paper texture, shadow, gradient, beige tint, or noise.
- The result contains realistic UI or glossy tech interfaces.
- Labels are unreadable or obviously incorrect.
- The image is stiff and lacks an absurd metaphor.
- The composition looks too similar to something in `assets/examples/`.

## Iteration moves

- Too ordinary: make Xiaohei the action engine and add one strange but believable metaphor.
- Too complex: remove nodes and keep one action plus 3-5 short labels.
- Too cute: emphasize deadpan, blank serious expression, not cute, not mascot.
- Too PPT: remove titles, frames, tidy grids, and extra arrows; turn it back into a hand-drawn scene.
- Too similar to an old case: keep the core idea and replace the main object plus Xiaohei's action.
- Text errors: prefer a local edit first; if there are many errors, regenerate with fewer labels.
- Wrong language: regenerate or edit so the default output is English unless the user asked for another language.

## Delivery bar

A high-quality image should make the reader think "that's a little weird" first, then understand the structure within one second.

If it looks like a tutorial page instead of an absurd product sketch on white paper, it is not ready.

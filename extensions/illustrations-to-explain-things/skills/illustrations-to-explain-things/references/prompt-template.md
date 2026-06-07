# Image Prompt Template

Generate each image separately. Replace the placeholders with details from the current article. Do not combine multiple images into one.

```text
Generate one standalone 16:9 horizontal article illustration.

Visual DNA:
Pure white background. Minimal black hand-drawn line art. Slightly wobbly pen lines. Lots of empty white space. Sparse red/orange/blue handwritten labels in English by default; switch languages only if the user explicitly asks. Clean absurd product-sketch feeling. No gradients, no shadows, no paper texture, no complex background, no commercial vector style, no PPT infographic look, no cute mascot poster, no children's illustration, no realistic UI.

Recurring IP character required:
Xiaohei, a small solid-black absurd creature with white dot eyes, tiny thin legs, blank serious expression, and a slightly uneven hand-drawn body shape. Xiaohei must perform the core conceptual action, not decorate the scene. Make Xiaohei serious, deadpan, and slightly bizarre, not cute.

Theme:
{illustration theme}

Structure type:
{Workflow / System slice / Before-after / Role state / Concept metaphor / Method layers / Route map / Comic beats}

Core idea:
{the core idea this image must explain}

Composition:
{where Xiaohei is, what Xiaohei is doing, what the main object is, and how information or motion flows}

Suggested elements:
{element 1} / {element 2} / {element 3} / {element 4}

Handwritten labels:
{label 1} / {label 2} / {label 3} / {label 4} / {optional label 5}

Color use:
Black for the main line art and Xiaohei. Orange for the main flow, path, or arrows. Red only for key warnings, problems, or outcomes. Blue only for secondary notes, feedback, or system state.

Constraints:
One image explains only one core structure. Keep the main subject around 40%-60% of the canvas. Preserve at least 35% blank white space. Use at most 5-8 short handwritten labels. Do not write a title in the top-left corner. Do not write the structure type on the image. Do not make it a formal diagram, course slide, or dense explainer. Do not copy prior examples or known case compositions unless the user explicitly requests it; invent a fresh visual metaphor for this specific article. The result should be clear but not over-instructional, interesting but not childish, and strange but clean.
```

## Image editing prompts

Remove a top-left title:

```text
Edit the provided image. Remove only the handwritten title "{text to remove}" and its underline from the top-left corner. Fill that area with the same clean white background, matching the surrounding blank paper. Preserve everything else exactly: characters, labels, paths, line style, composition, aspect ratio, and image quality. Do not add any new text or objects.
```

Make the image stranger while keeping the idea:

```text
Regenerate this illustration with the same core meaning and simple layout, but make Xiaohei more central to the conceptual action. Xiaohei should be doing the strange work that explains the idea, not standing beside the diagram. Keep it clean, sparse, hand-drawn, and not cute.
```

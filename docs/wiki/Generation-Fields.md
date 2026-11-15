# Generation fields

**Outcome:** understand every editable generation field, its validation, and the difference between changing a record and changing an image.

The browser, HTTP API, and MCP use these same 16 field keys. API examples use keys such as `cfgScale`; the UI uses friendly labels such as **CFG scale**.

## Complete field reference

| API key | UI label | Meaning and accepted value |
| --- | --- | --- |
| `positivePrompt` | Positive prompt | Desired generation text. Unicode and multiline text are supported. |
| `negativePrompt` | Negative prompt | Undesired generation text. An empty negative is a valid result. |
| `steps` | Steps | A non-negative whole number when supplied. |
| `seed` | Seed | Optional minus sign followed by digits. Send as a string in automation to preserve large integers. |
| `sampler` | Sampler | Sampler name as text; the editor does not execute or validate a sampler implementation. |
| `scheduler` | Scheduler | Scheduler/schedule name as text. |
| `cfgScale` | CFG scale | Finite, non-negative number when supplied. |
| `guidance` | Guidance | Finite, non-negative number for model-specific guidance settings. |
| `denoise` | Denoising strength | Number from 0 through 1 when supplied. |
| `clipSkip` | Clip skip | Non-negative whole number when supplied. |
| `width` | Width | Positive whole-number metadata width; initialized from actual image dimensions. |
| `height` | Height | Positive whole-number metadata height; initialized from actual image dimensions. |
| `modelName` | Primary model | Human-readable primary model label; a name alone is not verified identity. |
| `modelHash` | Primary model hash | Supported hexadecimal hash value, 8, 10, 12, or 64 characters. |
| `vaeName` | VAE | Human-readable VAE label. |
| `vaeHash` | VAE hash | Supported hexadecimal hash value, 8, 10, 12, or 64 characters. |

Blank values are permitted where information is absent. Invalid values are marked and prevent saving until corrected. Sampler names and other descriptive text are not a catalog of supported generation engines; the app edits metadata rather than generating images.

## Dimensions start from objective evidence

Suppose a PNG actually contains 1088×1856 pixels but its old settings say 1024×1024. The editable fields begin at **1088×1856**. Conflicting embedded values remain available for review.

You may deliberately write different dimension metadata. This does not stretch, crop, upscale, or re-encode the image. The image facts and encoded-payload integrity check still use the actual source dimensions. On reopening, the true dimensions again take priority over embedded generation settings.

## Seeds are text for a reason

JavaScript cannot represent every 64-bit integer exactly as a number. For example, use:

```json
{"fields":{"seed":"18446744073709551615"},"expectedRevision":0}
```

Do not convert the seed to a floating-point number before sending it. Digit validation preserves text, not a promise that a particular image generator accepts that seed range.

## CFG and guidance are not interchangeable

Different model families use different control names and conventions. Keep the value actually reported by the generating tool rather than inventing a conversion. The A1111 compatibility projection has its own conventional rendering behavior; the canonical record retains separate fields.

## Source labels and conflicts

Below a field, the UI explains whether it came from the image header, structured metadata, A1111/EXIF, the active ComfyUI graph, Civitai image import, exact API enrichment, or a manual edit. A source label is provenance—not a certification that the value was historically used.

Conflicts should be resolved deliberately. A prompt imported from a public Civitai image must not silently replace a different existing prompt. See [Conflicts and provenance](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Conflicts-and-Provenance).

## Primary model and VAE synchronization

Primary name/hash fields are linked to corresponding resource records. Editing their identity evidence invalidates old verification proof. Removing a primary resource hash through its editor clears the linked generation-field projection too. More complex resource edits belong in the **Resources** tab.

The strongest canonical hash may differ from the short AutoV2 value rendered for A1111 compatibility. That is intentional; do not replace a full hash simply to make the two displays look identical.

**Related:** [Resources and identity](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Resources-and-Identity) · [AIR and hashes](https://github.com/chriscollins500/civitai-metadata-studio/wiki/AIR-and-Hashes)

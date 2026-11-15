# Save a better record, not a recompressed image

**Outcome:** export a new same-format file and understand exactly what the integrity proof protects.

Studio rewrites supported metadata around the original encoded image/animation payload. It does not render through a canvas, change the compression quality, resize pixels, or regenerate frames.

## Everyday save checklist

1. Finish inspection, verification, and hashing. Queued or busy items can block saving, even for a current-image-only save.
2. Fix validation errors and review conflicts.
3. Choose the supported metadata you want to preserve.
4. Leave **Verify pixel integrity** enabled.
5. Choose the current-image or batch save action and a suffix.
6. Reopen the downloaded copy and inspect it.

The default suffix is `_metadata`. JPEG output uses `.jpg`. Duplicate output names are disambiguated rather than intentionally targeting your source file. Multiple-image output is packaged in a ZIP named `civitai-metadata-edited-YYYY-MM-DD.zip`.

Saving does not empty the queue or create a new clean editing baseline. Use **Remove**, **Clear**, or **Clear all** when finished. Your originals remain unchanged.

## What is compared

The default browser check, and every companion export, reopens the proposed output and compares a streaming SHA-256 of the protected encoded payload with the source. It also checks actual dimensions.

| Format | Protected content |
| --- | --- |
| PNG / APNG | Image structure/data, palette/transparency, and animation chunks: `IHDR`, `IDAT`, `PLTE`, `tRNS`, `acTL`, `fcTL`, `fdAT`. |
| JPEG | Relevant non-metadata structure plus the complete original bytes from the start-of-scan segment onward. |
| WebP | Original `VP8 `, `VP8L`, `ALPH`, `ANIM`, and `ANMF` image/alpha/animation payloads. |

The proof means the selected encoded pixels/frames were retained. It is not a perceptual similarity score and does not rely on two previews looking alike.

## Why the whole-file hash changes

Editing metadata changes file bytes, so the complete file's SHA-256 normally changes. That is expected. The integrity proof hashes protected image data separately; a successful export can have a new whole-file hash and identical protected payload hashes.

The companion returns both the output's complete `sha256` and an `integrity` object containing `before`, `after`, `preserved`, format, and check time.

## What is rewritten or retained

The canonical record feeds the supported A1111/EXIF, Civitai, and other metadata projections. Verified, role-compatible resources qualify for parser-facing identity fields; unresolved claims remain available in structured metadata rather than being falsely advertised as verified.

Original ComfyUI prompt/workflow carriers are preserved unchanged. Therefore a historical graph and your newly edited recipe can intentionally differ. Supported technical metadata such as color profiles is preserved according to format rules and preservation choices; unsupported/private metadata is not a blanket copy-through.

## Browser versus companion

The browser creates Blob downloads. The browser's download settings decide where they go; it cannot silently edit the input `File`. You can turn off its extra integrity check, although leaving it enabled is recommended.

The companion writes only inside its configured existing write root, requires a plain same-format filename, uses exclusive creation, and refuses existing destinations. Its integrity verification is mandatory. It does not offer an overwrite switch.

## If saving fails

Check validation, active queue work, available memory/disk space, and download permissions. An integrity mismatch is a reason to stop and investigate—not disable the check to force an output. Record the format, app version, and a minimal reproducible fixture without exposing personal metadata.

**Related:** [Formats and limits](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Formats-and-Limits) · [Privacy and security](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Privacy-and-Security)

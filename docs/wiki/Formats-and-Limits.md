# Supported formats and practical limits

**Outcome:** know what you can open, what is preserved, and which bounds are intentional.

## File support

| Input | Read/edit/export | Important detail |
| --- | --- | --- |
| PNG | Yes | Supported text/EXIF generation metadata; original image-data payload retained. |
| APNG in a PNG container | Yes, supported animation chunks | Animation data is retained, not rendered into new frames. |
| JPEG / JPG | Yes | Supported EXIF/XMP/IPTC/parameter carriers; original scan bytes retained. |
| WebP, including supported animation | Yes | Supported EXIF/XMP and original image/alpha/animation payloads retained. |
| GIF, AVIF, HEIC, TIFF, video, audio | No general media editing support | TIFF structures are parsed inside EXIF; that does not make standalone TIFF an input format. |
| Model files | Local hash calculation only | Not a model editor, tensor loader, downloader, or generation engine. |
| Arbitrary JSON sidecars | Not a browser generation import | Studio identity JSON is a separate, schema-specific feature. |

Format detection checks file signatures, not just filename extensions. A renamed unsupported file is still unsupported.

## Resolution

8K is a supported design/test target, not an artificial maximum. Actual dimensions initialize the editable metadata fields. The parsers can inspect slices without decoding the entire preview, so a large image may be inspectable even if the browser cannot display it.

There is no credible “any size, every browser, unlimited memory” guarantee. Decode limits, available RAM, ZIP/output construction, metadata size, and browser implementation all matter. A synthetic 8192×8192 PNG test is not proof of every 8K JPEG/WebP/animation scenario.

## Defensive bounds

| Area | Current bound |
| --- | --- |
| Decoded metadata value | 16 MiB; compressed text is bounded while inflating. |
| Civitai response | 4 MiB. |
| Model hashing chunk | 8 MiB. |
| Identity JSON import | 4 MiB / 5,000 resources. |
| Edit history | 60 snapshots / 8 MiB combined. |
| IndexedDB cache | 16 MiB / 2,000 versions / 50,000 records. |
| Companion JSON body | 2 MiB. |
| Companion sessions | 32; 30-minute idle expiry. |
| Local HTTP work | 4 active operations / 120 authenticated requests per minute. |

These bounds protect a portable app from malformed or unexpectedly large inputs. An image's total byte size is not the same as one decoded metadata value's size.

## Browser and operating-system coverage

The product targets current browser standards with no legacy compatibility promise. The current release was exercised in Chrome and Edge on Windows; the browser suite uses the actual portable HTML. Node companion CI runs on Windows and Linux.

Those facts do **not** establish manual Safari/Firefox/macOS/mobile coverage or screen-reader certification. The app avoids an installer and OS-specific browser runtime, but portability design and verified platform coverage are different claims.

## Metadata is not the whole environment

A complete-looking recipe may omit custom-node versions, auxiliary inputs, implementation details, random-state behavior, or an unavailable resource. Studio can expose and correct a record; it cannot promise pixel-identical regeneration.

**Related:** [Saving and pixel integrity](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Saving-and-Pixel-Integrity) · [Capabilities and limitations](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Capabilities-and-Limitations)

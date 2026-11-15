# Conflicts are useful evidence

**Outcome:** make a deliberate choice when two sources disagree, without confusing a preferred value with historical proof.

An image may contain A1111 parameters, EXIF, a Civitai manifest, and a ComfyUI graph at the same time. Those sources can disagree. Studio keeps one canonical record, retains evidence, and exposes disagreements for review.

## How initial values are chosen

The source priority is an implementation rule for selecting an initial value—not a universal ranking of truth.

| Source key | Priority | Meaning |
| --- | ---: | --- |
| `manual` | 100 | Your explicit edit. |
| `image_header` | 95 | Actual encoded image dimensions. |
| `api_exact` | 90 | Exact resource enrichment from Civitai. |
| `civitai_manifest` | 80 | Structured Civitai/Studio manifest in the file. |
| `civitai_image` | 75 | Explicit public-image metadata import. |
| `exif` | 70 | Supported EXIF generation data. |
| `a1111` | 65 | Parsed A1111-style parameters. |
| `comfy_active` | 60 | Supported active ComfyUI graph interpretation. |
| `filename` | 10 | Weak descriptive clue, never identity verification. |
| `unknown` | 0 | No stronger source classification. |

This is why stale embedded dimensions cannot override the actual image size on opening, while you can still edit dimension metadata afterward.

## A practical review

1. Open **Review** and inspect unresolved conflicts.
2. Read both values and their source/evidence labels.
3. Choose the intended value using the available conflict controls or edit the field explicitly.
4. For a resource identity disagreement, inspect AIR, version, file, role, and hash evidence together.
5. Reverify identities after changing their identifying evidence.
6. Reopen the saved copy to check the record you actually produced.

Do not treat a green resource badge as approval of every generation field. Prompts and seeds are not independently proved by a model-version lookup.

## Different conflicts need different decisions

**Dimension mismatch:** a 1088×1856 image claims 1024×1024 in old parameters. The actual pixels initialize the fields. Retain another value only if you deliberately want different metadata.

**Prompt disagreement:** an imported public image has a different prompt. Verify that you selected the correct public image; do not assume its recipe belongs to your local file.

**Identity disagreement:** AIR says one version, while a full SHA-256 points elsewhere. A weaker short hash cannot silently erase that disagreement. Correct the evidence or leave the claim unresolved.

**Same name, different strength:** two LoRA entries may represent different operations. Compatible aliases help consolidate duplicated descriptions, but conflicting IDs, hashes, or strengths should not be collapsed into a misleading single entry.

## Three kinds of confidence

- **Observed:** actual dimensions or encoded bytes read from this file.
- **Claimed:** a prompt, resource, or setting recorded by another tool or person.
- **Verified identity:** exact public identifiers/hash evidence matched to a compatible Civitai resource.

None of these alone establishes authorship, consent, legal permission, or a complete reproducible generation environment.

## Reports are not automatically public-safe

The browser audit report includes the canonical record, changes, conflicts, and potentially full prompts. Inspect it before posting. API/MCP reads and reports omit prompt fields by default, but arbitrary resource or metadata text can still contain sensitive material.

**Related:** [Privacy and security](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Privacy-and-Security) · [Civitai verification](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Civitai-Verification)

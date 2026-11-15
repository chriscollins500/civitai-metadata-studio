# Import public Civitai image metadata

**Outcome:** explicitly retrieve a public image's generation metadata without uploading your local image or replacing existing values silently.

This is different from model verification. Model verification identifies a resource. Image import reads metadata attached to a public Civitai image ID you provide.

## Browser workflow

1. Open the local image you want to inspect or repair.
2. Select **Import image metadata**.
3. Enter a numeric Civitai image ID or a recognized `https://civitai.com/images/…` URL.
4. Import and inspect the result in Generation, Resources, and Review.

The request sends only the public image ID and metadata/content parameters. It does not upload the local picture, compute a reverse image search, or establish that your local file is the same image.

## What happens to existing values

| Incoming evidence | Result |
| --- | --- |
| Existing field is empty | A supported incoming value may fill it. |
| Existing field already matches | Matching evidence can confirm the value. |
| Incoming value differs | A review conflict is created; the existing selected value is not silently overwritten. |
| Resource claims are present | They are normalized into the record and may be verified separately. |
| The same public image was imported before | Import provenance avoids duplicate image-source entries. |

The image's actual pixel dimensions remain the initial size authority. Public recipe dimensions can disagree because of resizing, upscaling, cropping, or incorrect uploader metadata.

## Supported metadata and unknown keys

The importer normalizes known aliases for prompts, settings, dimensions, model/VAE details, and resource claims. It requests `withMeta=true` because the API does not otherwise guarantee complete public generation metadata. Its inclusive browsing setting does not override provider region or visibility rules.

Civitai `meta` is free-form, uploader/tool-supplied data. The editor does not promise an editable control or preservation path for every arbitrary API key. Unknown/private workflows or fields are not magically reconstructed. Root-level version-ID lists can provide resource claims, but do not alone prove which role each resource played.

Public image responses containing prompts are not stored in the persistent identity cache. Import results exist in the current record and may appear in an exported image or audit report.

## Automation

HTTP: `POST /v1/images/{imageId}/import`, with `expectedRevision` and `civitaiImageId`.

MCP: `import_civitai_metadata` with the local opaque `imageId`, current `expectedRevision`, and numeric public `civitaiImageId`.

Both require companion `--network`. The local session handle is not a public Civitai image ID. See [API cookbook](https://github.com/chriscollins500/civitai-metadata-studio/wiki/API-Cookbook).

## Failure cases

A missing result may mean no public metadata, a removed/unavailable image, content restrictions, an incorrect ID, or a provider problem. Do not keep substituting nearby numeric IDs. Do not add private cookies or account tokens to metadata or chat to work around visibility.

Use Undo to reverse an import, or Reset edits to return to the initially inspected state. Review conflicts before saving.

**Related:** [Conflicts and provenance](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Conflicts-and-Provenance) · [Privacy and security](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Privacy-and-Security)

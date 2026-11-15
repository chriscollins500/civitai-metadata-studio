# Resources and identity

**Outcome:** distinguish a resource claim from an exact Civitai identity, repair missing evidence, and interpret unresolved or conflicting results honestly.

A resource is a model-related component referenced by metadata: a checkpoint, LoRA, VAE, encoder, or another supported role. Its **role in a workflow** and **Civitai parent model type** are related but not identical. A checkpoint package can contain a VAE file; a diffusion loader may use a file whose parent model type is Checkpoint.

## Supported roles

| Role key | Interpretation |
| --- | --- |
| `checkpoint` | Checkpoint / primary model |
| `lora` | LoRA / LyCORIS-style adapter |
| `vae` | VAE |
| `embedding` | Embedding / textual inversion |
| `controlnet` | ControlNet |
| `ipadapter` | IPAdapter |
| `upscaler` | Upscaler |
| `clip` | CLIP / text encoder |
| `vision_encoder` | Vision encoder / CLIP Vision |
| `unet` | UNet / diffusion model |
| `refiner` | Refiner |
| `motion` | Motion module |
| `hypernetwork` | Hypernetwork |
| `other` | A resource whose role is not classified more specifically |

Role recognition does not imply that the editor can execute the component, load its weights, or support its media format as an image input.

## Reading a resource card

Cards show a label, role/type, verification state, and available identity evidence. Depending on the record, this includes AIR, model/version/file IDs, hashes, base-model family, version name, creator, license flags, and matching diagnostics.

A discovered Civitai resource title can open its exact model/version page in a new tab. The app constructs approved HTTPS Civitai links rather than trusting arbitrary metadata URLs. A link by itself is not proof of successful verification.

| State | What it means | Useful next action |
| --- | --- | --- |
| Verified | Exact API evidence resolved consistently with the claim and role. | Review the match scope and file evidence. |
| Unresolved | Not enough exact evidence, no public match, or no compatible candidate. | Supply an exact AIR/version/hash or hash the original model file. |
| Conflict | Identifiers, strongest hash, file scope, or compatible candidates disagree. | Review alternatives; do not choose by a similar name alone. |
| Hashing / checking | Work is in progress. | Wait or use the relevant stop control. |
| Error / attention | A request or processing step failed. | Read diagnostics and use troubleshooting rather than repeated retries. |

## Repair a resource

1. Open its **Edit** dialog.
2. Review the role, resource type, name, version, base model, AIR, IDs, source URL, hashes, and weight.
3. Add evidence you actually have. Do not invent an ID from a filename.
4. Apply the edit and verify again.

The dialog can refresh current Civitai type/family suggestions explicitly. Text remains editable; an enum list is guidance, not proof that a model was used.

If all you have is a name, use explicit Civitai search and inspect the precise returned version before choosing it. Search never silently makes the choice for you. Even an exact ID identifies a catalog entry, not a historical execution event.

## Local model hashing

Selecting a local model file streams its bytes and computes supported hashes without loading tensors or unpickling model objects. File bytes stay local. For safetensors, AutoV3 hashes the tensor payload rather than copying an untrusted embedded hash claim. BLAKE3 evidence can be imported, but the built-in local hash pass does not calculate it.

The UI can verify after this explicit hashing action. Turning automatic verification off is not a global ban on explicit network actions. To work completely offline, do not invoke Civitai verification/search/import.

## Duplicate-looking entries

The canonical merger consolidates compatible metadata aliases while preserving conflicting IDs, hashes, and distinct LoRA strengths. Identity-import matching is stricter: it requires compatible exact evidence rather than a matching name.

Two similar labels can legitimately represent different versions, files, roles, or strengths. Conversely, a verified identity plus a filename-only workflow alias may describe one resource. Inspect evidence before deleting an apparent duplicate. Removing a resource changes output metadata; it does not remove a model from disk or alter the original workflow graph.

## Verification is not licensing advice

Creator names and license flags are reference metadata returned by Civitai. Check the current model/version page and relevant license yourself. The Studio does not establish authorship, consent, training-data rights, or permission for a particular use.

**Related:** [AIR and hashes](https://github.com/chriscollins500/civitai-metadata-studio/wiki/AIR-and-Hashes) · [Civitai verification](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Civitai-Verification)

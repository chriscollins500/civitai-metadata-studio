# Workspace and keyboard

**Outcome:** move around the editor efficiently without losing track of the selected image or accidentally treating a batch save as a single-image save.

## The workspace at a glance

The welcome view becomes a compact editing workspace after files are opened. The main areas are image facts and queue, verification status/actions, edit-history controls, four editor tabs, and the persistent save area. On narrow screens the editor comes first and content scrolls vertically.

The save label reflects the number of prepared images. Always read it before clicking: **Save new copy** and **Save … new copies** have different scope. **Save this image** offers selected-image output in a batch. All outputs are new files.

## Navigation

| Control | Behavior |
| --- | --- |
| Add images / Add more images | Opens the file picker and appends to the queue. |
| Queue image | Selects that image's record; edits remain associated with it. |
| Remove image | Discards its queued in-memory work without deleting the original. |
| Clear / Clear all | Clears the entire queue and returns to the welcome view. |
| Generation / Resources / Other metadata / Review | Changes the visible editor panel. |
| Theme button | Switches light/dark appearance; the preference may be stored locally. |

The queue does not silently replace the current image whenever a new file is added. If the first queue item is malformed, select a valid later item to work with it.

## Keyboard reference

| Keys | Action / context |
| --- | --- |
| `Ctrl+K` / `Command+K` | Open searchable commands when another editor dialog is not active. |
| Arrow up/down in commands | Move among matching actions. |
| Enter in command search | Run the first matching action. |
| Escape | Close a native dialog or command palette. |
| `Ctrl+S` / `Command+S` | Save prepared copies when saving is available and no dialog is open. |
| `Ctrl+Z` / `Command+Z` outside text controls | Undo the last record edit. |
| Shift with the preceding undo shortcut | Redo a record edit. |
| Left/right arrows on editor tabs | Move between tabs. |
| Home/End on editor tabs | Move to the first/last tab. |
| Tab / Shift+Tab | Move through controls using normal browser focus navigation. |

Inside a text field, native text undo remains native. This is intentionally distinct from record-level Undo/Redo, which can restore resource evidence, conflicts, and preservation choices together.

## Commands

Search commands by what you want to do: open images, edit generation fields, find resources, review changes, verify identities, import a public recipe, save copies, switch theme, or learn about automation. A command does not bypass a disabled action or invalid field.

## Resource filters

In **Resources**, search by name, AIR, hash, and other displayed evidence. The verification filter narrows the local resource list. Filtering does not contact Civitai, modify identities, or remove hidden resources from export.

The **Search Civitai** action inside the resource dialog is different: it explicitly sends a name query. See [Civitai verification](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Civitai-Verification).

## Busy and edited states

Inspection, hashing, verification, and saving can temporarily disable conflicting actions. Use **Stop hashing** or the verification stop control when offered. Cancellation is not the same as clearing an image; its purpose is to stop work and retain a usable record.

“Edited · held in memory” compares the record with the original inspected state. It can remain after saving because saving does not reset the baseline or close the image.

**Related:** [Accessibility](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Accessibility) · [Batch and identity exchange](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Batch-and-Identity-Exchange)

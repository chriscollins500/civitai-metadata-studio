# Getting useful help without sharing private files

You are welcome to ask a basic question. A short explanation of what you expected and what happened is a great start—you do not need to upload your image to ask for help.

## Questions, bugs, ideas, and vulnerabilities

- **How do I…?** Ask in [Q&A](https://github.com/chriscollins500/civitai-metadata-studio/discussions/categories/q-a). A specific title makes answers easier for the next person to find.
- **Something is reproducibly wrong.** Use the [issue chooser](https://github.com/chriscollins500/civitai-metadata-studio/issues/new/choose). There is a dedicated metadata/identity form.
- **Could the tool work differently?** Start in [Ideas](https://github.com/chriscollins500/civitai-metadata-studio/discussions/categories/ideas), or use the feature form for a concrete proposal.
- **There may be a security vulnerability.** Use [private vulnerability reporting](https://github.com/chriscollins500/civitai-metadata-studio/security/advisories/new), not a public exploit report.

## What makes a report actionable?

Include app version, browser/OS or Node/MCP-host versions, format, smallest steps, expected/actual behavior, and safe warning codes. Say whether it occurs before verification, after import, or after export/reopen.

For a ComfyUI branch, useful details include node class, enabled state, switch value, and output path. Compare the graph embedded in the image, not only a workflow edited afterward. For identity resolution, exact public AIR/version/file IDs and hashes are useful; a similar name is not proof.

## Please review every attachment

The browser's audit JSON can contain full prompts and conflicts. Original ComfyUI graphs can include private paths and notes. Even an API report with prompt fields omitted can contain sensitive arbitrary text elsewhere.

Do not post private images, full workflows, identifying metadata, passwords, cookies, tokens, Authorization headers, or personal paths. Use a minimal synthetic fixture or a carefully redacted screenshot. If a private reproduction seems essential, ask about an appropriate channel before sending anything. Security advisories are not a general support-file inbox.

## A few common surprises

**Saving leaves the queue in place.** Remove/Clear discards in-memory work without deleting files.

**A blank negative prompt can be correct.** Empty/zero conditioning is not the same as its upstream positive text.

**The original workflow survives edits.** It is preserved historical evidence; Studio does not rewire it to match new field values.

**A 429 means wait.** Clearing the cache cannot bypass the shared cooldown, and repeatedly pressing Verify cannot resolve a provider limit.

Read [Troubleshooting](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Troubleshooting) and [Support](https://github.com/chriscollins500/civitai-metadata-studio/blob/main/SUPPORT.md) for more. There is no guaranteed response deadline; reproducible, public-safe evidence helps a community project the most.

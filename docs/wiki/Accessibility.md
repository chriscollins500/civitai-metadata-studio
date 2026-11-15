# A workspace you can navigate

**Outcome:** use the editor with a keyboard, a smaller viewport, or reduced motion—and know the current validation boundary.

Studio uses semantic controls, accessible names, visible focus, keyboard-operable tabs, and native dialogs. The design aims to keep image facts, navigation, and save controls available without turning every field into one long page.

## Keyboard essentials

| Action | Control |
| --- | --- |
| Move through interactive controls | Tab / Shift+Tab. |
| Change the selected section tab | Arrow keys; Home/End select the first/last tab. |
| Open the command palette | Ctrl+K, or Command+K on platforms using Meta. |
| Choose a palette result | Arrow keys and Enter. |
| Dismiss a palette/dialog | Escape where supported. |
| Save when available | Ctrl+S / Command+S when no dialog blocks the action. |
| Record undo / redo | Ctrl/Command+Z and Shift+Z outside text inputs. |

Inside a text field, the browser's native text-editing undo remains available. Record history and text-input history are related but not identical. The palette also provides a discoverable route to actions without memorizing every shortcut.

## Layout and display

The desktop workspace uses independently scrollable areas. On narrow screens, the editor takes priority and the layout reflows; a compact layout is not a promise that every screen can show all metadata without scrolling.

Use the light/dark appearance control and browser zoom as needed. Reduced-motion preferences are respected. A long model name, an exceptionally large prompt, or translated browser UI should not require hiding essential actions; report clipped controls with viewport and zoom details.

## Understand status without relying on color alone

Read the status text, source labels, warnings, and conflict descriptions. A green verified identity is not equivalent to a verified generation history. The resource evidence and **Review** tab explain what was actually checked.

## What has and has not been validated

Automated browser regressions exercise keyboard navigation, focus-sensitive controls, narrow/wide layouts, command-palette behavior, history, and actual downloads in Chrome/Edge. Layout investigations should combine screenshots with measured overflow/geometry checks.

There is no claim of complete WCAG conformance certification, exhaustive assistive-technology testing, or manual validation with every screen reader. Automated tests cannot replace those activities.

## Reporting an access problem

Include browser/OS, input method or assistive technology, viewport and zoom, the control's visible label, expected behavior, and what happened instead. A short keyboard-only reproduction is especially useful. Do not attach an unreviewed private image just to demonstrate a layout problem.

**Related:** [Workspace and keyboard](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Workspace-and-Keyboard) · [Support](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Contributing-and-Support)

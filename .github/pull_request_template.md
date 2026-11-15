## What improves for the user?

Describe the problem and outcome. Link a related issue or discussion when available.

## What changed?

Summarize the implementation boundary and any behavior, compatibility, privacy, or permission changes.

## Evidence

- Commands run and exact pass/fail counts:
- Built/exported artifact or browser checks, where relevant:
- Limitations and checks not run:

For a bug fix, explain the focused regression. For layout changes, include a public-safe screenshot and viewport/overflow evidence. A source test is not proof that a shipped artifact works.

## Review checklist

- [ ] I preserved unrelated work and used minimal, public-safe fixtures.
- [ ] No credentials, private media/prompts/workflows, personal paths, or identifying metadata are included.
- [ ] Shared canonical validation/projections remain authoritative; no parallel parser/model was introduced.
- [ ] Exact identity, original-file safety, encoded-payload preservation, and rate-limit boundaries remain intact.
- [ ] Accessibility and documentation are updated where affected.
- [ ] I clearly identified any new dependency, external transmission, installation, or publishing requirement.

Skip inapplicable checks with a short explanation; do not claim unrun tests passed. See [contribution guidance](https://github.com/chriscollins500/civitai-metadata-studio/blob/main/CONTRIBUTING.md).

# Verify your download

The app still works by opening one HTML file. Verification is optional for everyday use, but useful when you want cryptographic evidence of where a download came from.

## Check a release

Download the ZIP from the [official release page](https://github.com/chriscollins500/civitai-metadata-studio/releases/latest). For **1.0.2**, these pinned downloads match the [exact checksum and test record](releases/v1.0.2.md#validation-and-exact-files): [HTML](https://github.com/chriscollins500/civitai-metadata-studio/releases/download/v1.0.2/civitai-metadata-studio.html), [ZIP](https://github.com/chriscollins500/civitai-metadata-studio/releases/download/v1.0.2/civitai-metadata-studio.zip), and [SHA256SUMS.txt](https://github.com/chriscollins500/civitai-metadata-studio/releases/download/v1.0.2/SHA256SUMS.txt).

With a current GitHub CLI, verify that version's exact tag and expected signer workflow:

```powershell
gh attestation verify civitai-metadata-studio.zip --repo chriscollins500/civitai-metadata-studio --signer-workflow chriscollins500/civitai-metadata-studio/.github/workflows/ci.yml --source-ref refs/tags/v1.0.2 --deny-self-hosted-runners
```

You can verify the standalone HTML or `SHA256SUMS.txt` by substituting that filename. For an additional exact-commit constraint, add `--source-digest` followed by the source commit recorded on the [1.0.2 release page](https://github.com/chriscollins500/civitai-metadata-studio/releases/tag/v1.0.2). A successful result verifies the artifact digest, certificate, expected repository/workflow identity, source ref, and signed provenance. A changed file fails verification. When verifying a different release, use its recorded tag and commit; **latest** links may eventually serve a newer version.

The immutable **1.0.1** release remains unchanged. Its [tag CI](https://github.com/chriscollins500/civitai-metadata-studio/actions/runs/43697086790) and independent download checks verified all three assets before and after its **2026-11-15** publication. Its attested source is `88cf29a9d36009bac5b682336d65f8f7f16e0e48`; use `--source-ref refs/tags/v1.0.1 --source-digest 88cf29a9d36009bac5b682336d65f8f7f16e0e48` for those older files. The [wiki verification guide](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Release-and-Provenance) keeps historical hashes separate.

Checksums alone detect byte changes when compared with a trusted copy. Attestations add authenticated provenance. Neither is a malware-safety guarantee, Windows Authenticode signature, macOS notarization, or an automatic browser trust badge.

## What gets signed

- `civitai-metadata-studio.html`
- `civitai-metadata-studio.zip`
- `SHA256SUMS.txt`

No image, prompt, model file, workflow, credential, or local user path is sent for attestation. Sigstore stores the signing certificate and signed public artifact digests/provenance; the portable app's network policy does not change.

## Release workflow

The official [CI workflow](../.github/workflows/ci.yml) first builds and tests on Windows and Linux. A separate Ubuntu job downloads the tested Linux artifacts and rechecks the HTML, CSP, archive, and checksums. Only then does the pinned official `actions/attest` action create SLSA build-provenance attestations. The job also verifies its own signatures against the exact workflow and commit.

Attestations run automatically on version-tag pushes. They do not run on pull requests or ordinary branch pushes. Maintainers can also run CI manually on **main**, setting `release_tag` to an existing published version. This path additionally checks all three downloaded release files byte-for-byte against the newly tested build before signing. A mismatch is a failure, never an invitation to replace the release files.

The signing job has read-only repository contents, OIDC-token permission, and attestation-write permission. It has no release-upload permission, stored private signing key, or SignPath account. Action versions are pinned to immutable commit SHAs.

### The existing v1.0.0 release

Its tag and downloadable assets remain unchanged. Because v1.0.0 predates this workflow, its first attestation comes from a later CI rebuild that reproduces and checks the published bytes. The attestation identifies that rebuild's source commit, not the original tag's older commit. This distinction is intentional and visible in verification output.

### Reproducible dates

The portable build includes a UTC date. For an attested release, CI validates the version/date recorded in the committed HTML and exports its midnight Unix timestamp as `SOURCE_DATE_EPOCH`. The build honors that timestamp, so a later-day rebuild can reproduce the same bytes. Text inputs are normalized to LF so Windows checkout settings cannot change the output or CSP hash. Normal local builds still default to the current UTC date. Invalid timestamps, mismatched versions, invalid dates, and changed release bytes are rejected.

If the app's source changes after a release, a manual run targeting that older release will fail the byte comparison. Use the matching reviewed source and workflow for a new release; never retag an old version to manufacture a match.

## Offline verification

The GitHub CLI can download attestation bundles and trusted roots for offline checks. Online verification is the simplest default because GitHub can bind the repository name to its current repository identity. See the official [offline-verification guide](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/verify-attestations-offline).

Primary documentation: [GitHub artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations), [CLI verification options](https://cli.github.com/manual/gh_attestation_verify), and [draft-first release management](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository), checked **2026-11-17**. The [official action](https://github.com/actions/attest) was reviewed **2026-11-14**; its pinned version is unchanged.

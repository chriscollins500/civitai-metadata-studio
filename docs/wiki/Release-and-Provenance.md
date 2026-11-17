# Know where your download came from

**Outcome:** verify release bytes and authenticated build origin without installing a signing system into the app.

Download from the [official releases](https://github.com/chriscollins500/civitai-metadata-studio/releases). The portable ZIP contains one HTML file with the full MIT notice embedded. The standalone HTML, ZIP, and checksum manifest have GitHub/Sigstore build attestations.

## v1.0.2 release evidence

**[1.0.2](https://github.com/chriscollins500/civitai-metadata-studio/releases/tag/v1.0.2)** is the maintenance release for the wiki-checker/CodeQL and browser-test reliability fixes. The image-editing workflow and dependencies are unchanged; the app's reported version and build date are refreshed. The [versioned release record](https://github.com/chriscollins500/civitai-metadata-studio/blob/v1.0.2/docs/releases/v1.0.2.md) documents the scope, exact files, and verification limits.

| Download | Bytes | SHA-256 |
| --- | ---: | --- |
| [Standalone HTML](https://github.com/chriscollins500/civitai-metadata-studio/releases/download/v1.0.2/civitai-metadata-studio.html) | 401,007 | `62e35b46a75e6344d2827afd62934d70c43e7a185d70f5007cdd104e5e758cd9` |
| [Portable ZIP](https://github.com/chriscollins500/civitai-metadata-studio/releases/download/v1.0.2/civitai-metadata-studio.zip) | 89,711 | `bf0ca437e70979feb34c5e9bcad9a2aea02ac9b2c9d4ae3bcf8c33e1b2617cb2` |
| [SHA256SUMS.txt](https://github.com/chriscollins500/civitai-metadata-studio/releases/download/v1.0.2/SHA256SUMS.txt) | 189 | `2b9abb917158657b641d9d2690c3604f7351c8daf97adcd386342cdecd576109` |

Version **1.0.2**, UTC build date **2026-11-17**. The single HTML entry in the ZIP is byte-identical to the standalone file. The inline-script CSP digest is `QueFzdpDQsTl222v39gVPsbu9OjIXXJcD4Z1vYVDUC0=`. Publication requires Windows/Linux Node.js 24/26 suites, CodeQL, ZIP-extracted Chrome/Edge smoke checks, CI/draft byte comparisons, and all three GitHub/Sigstore signatures to pass. The release page records the final source commit and successful tag workflow.

For these files, use:

```powershell
gh attestation verify civitai-metadata-studio.zip --repo chriscollins500/civitai-metadata-studio --signer-workflow chriscollins500/civitai-metadata-studio/.github/workflows/ci.yml --source-ref refs/tags/v1.0.2 --deny-self-hosted-runners
```

Substitute the HTML or checksum filename for the other assets. Add `--source-digest` with the exact commit recorded on the release page for a commit-pinned check. [Testing scope](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Development-and-Testing#release-102--november-17-2026) distinguishes automated gates from untested platforms and real-provider behavior.

## v1.0.1 release evidence

**Historical [1.0.1 release](https://github.com/chriscollins500/civitai-metadata-studio/releases/tag/v1.0.1)**, published **2026-11-15 at 09:15:21 UTC**. GitHub reports it as immutable: the published assets and associated tag cannot be replaced. Its source commit is `88cf29a9d36009bac5b682336d65f8f7f16e0e48`; unlike the historical 1.0.0 rebuild below, its build attestations refer directly to this release tag and commit.

These links are pinned to **1.0.1**, so they continue to match this evidence after another release becomes latest:

| Download | Bytes | SHA-256 |
| --- | ---: | --- |
| [Standalone HTML](https://github.com/chriscollins500/civitai-metadata-studio/releases/download/v1.0.1/civitai-metadata-studio.html) | 401,007 | `5ea34399c41be1288d4d62ea8d00e0e08fb42da69228b4b76b69686cbf364b22` |
| [Portable ZIP](https://github.com/chriscollins500/civitai-metadata-studio/releases/download/v1.0.1/civitai-metadata-studio.zip) | 89,708 | `418f70d11041d4ff50aee0852f777e2012f962259dbfbf54424b281c1799b1e2` |
| [SHA256SUMS.txt](https://github.com/chriscollins500/civitai-metadata-studio/releases/download/v1.0.1/SHA256SUMS.txt) | 189 | `1bbed9e1002d738c90f85c646f34ba46f29ff3ac6d2d52e3c63e2d46136135ad` |

The HTML's version is **1.0.1**, with UTC build date **2026-11-15**. The ZIP contains exactly one HTML entry whose bytes equal the standalone file. Its verified inline-script CSP digest is `mmzTnzuqsEm5GddfL4gaF/gIBlYMUb4t1dbCSk4KBuY=`. Frozen local files, CI downloads, draft downloads, and the re-downloaded public assets matched these hashes; all three public build attestations verified against the exact tag, commit, and workflow. A modified-copy control was correctly rejected.

The [release CI](https://github.com/chriscollins500/civitai-metadata-studio/actions/runs/43697086790) passed **224 project tests + 36 Chrome/Edge checks per Windows/Linux × Node.js 24/26 configuration**. The ZIP-extracted app was also tested directly in Chrome and Edge. See [testing evidence and limits](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Development-and-Testing#released-101--november-15-2026) and the [versioned release notes](https://github.com/chriscollins500/civitai-metadata-studio/blob/v1.0.1/docs/releases/v1.0.1.md).

The dependency/native-SDK/reconnect fixes are in the companion's source, not new browser runtime dependencies. The portable editing workflow stays unchanged. Download the source-code archive on the release page for the optional companion; the portable ZIP is only the browser app.

## Verify the historical 1.0.1 files

For the **1.0.1** file above, use a current authenticated GitHub CLI in the download directory:

```powershell
gh attestation verify civitai-metadata-studio.zip --repo chriscollins500/civitai-metadata-studio --signer-workflow chriscollins500/civitai-metadata-studio/.github/workflows/ci.yml --source-ref refs/tags/v1.0.1 --source-digest 88cf29a9d36009bac5b682336d65f8f7f16e0e48 --deny-self-hosted-runners
```

Substitute `civitai-metadata-studio.html` or `SHA256SUMS.txt` to verify the other assets. This requires the exact 1.0.1 source ref and commit, not merely a signature from some build. If you download a later release through a **latest** link, use that release's documented ref/commit instead; do not compare it with 1.0.1 hashes.

Checksums detect byte changes against a trusted expected value. Attestations additionally bind the digest to authenticated provenance. Neither is a malware-safety guarantee, Windows Authenticode signature, macOS notarization, browser trust badge, or a claim of certified SLSA level.

## v1.0.0 evidence

**Historical only.** These are the published **2026-11-14** assets, not current-release checksums:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `civitai-metadata-studio.html` | 401,007 | `9edb05c5228d0c5e60bbee6f8a7f9795011e84fb15407f7ae3f825205b3905af` |
| `civitai-metadata-studio.zip` | 89,709 | `4faaa0ab5e0661f91a00ee172a68461bf3171d91b9120568b9560b6da068d495` |
| `SHA256SUMS.txt` | 189 | `7872b40e7d6efcc89b4e21b313b799fac156cbad833c3db0ec3b32373a92e8c9` |

The ZIP's single HTML entry matches the standalone HTML exactly. The recorded inline-script CSP digest is `loOEYMxXO/T8qrz0eUAndb7dF4NKNnUzPEfK7b13ZmU=`.

The original v1.0.0 source tag points to `09785c3bc971163e297339746d5fd9b2633ba25e`. Its first attestation instead comes from the later reviewed CI rebuild at `538977acba22e5834020752564d440ca6e8ffbd2`, which reproduced and compared the existing release bytes. The [successful attestation run](https://github.com/chriscollins500/civitai-metadata-studio/actions/runs/43654868713) records that distinction. The tag/assets were not moved or replaced to create the attestation.

## How signing is gated

1. Windows and Linux jobs build/test/package the project.
2. A separate Ubuntu job downloads the tested artifacts and checks HTML, CSP, ZIP, and checksums again.
3. For a manual existing-release run, all published assets must also match sizes, digests, and actual downloaded bytes.
4. The pinned official attestation action signs their digests using short-lived GitHub OIDC identity.
5. The job verifies all three attestations against its exact workflow and source commit.

Signing occurs on version-tag pushes or an explicit manual CI run on **main** with `release_tag`. Ordinary pushes and pull requests do not attest. The signing job has read-only contents, OIDC-token, and attestation-write permissions—not release-upload authority. There is no stored private signing key, new repository secret, or SignPath dependency.

## Dates and reproducibility

The repository enables immutable releases, and **v1.0.1 is published and immutable**. Prepare a draft, attach and verify all assets, then publish. Published immutable assets/tags cannot be modified. This does not retroactively make the existing v1.0.0 release immutable, and it is not a reason to recreate it. Version-tag rules independently prevent moves/deletion. See [repository operations](https://github.com/chriscollins500/civitai-metadata-studio/blob/main/docs/repository-operations.md).

CI derives `SOURCE_DATE_EPOCH` from the reviewed committed release date/version, and build inputs are LF-normalized. A later rebuild can therefore reproduce the published date rather than silently changing bytes. A mismatch fails signing; it is never an instruction to replace old release assets.

An application source change may intentionally prevent reproducing an older release. Make a new version through the normal review/release process; do not retag an old one to manufacture a match. Publishing a wiki is not a new application release.

## Cost and scope

GitHub artifact attestations are available without a separate signing subscription for public repositories. Runner/storage choices can still have their own billing rules. No user image, prompt, workflow, model bytes, or local path is submitted for artifact attestation; public artifact digests and build provenance are signed.

Primary documentation checked **2026-11-14**: [GitHub attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations), [official action](https://github.com/actions/attest), [CLI verification](https://cli.github.com/manual/gh_attestation_verify), [offline verification](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/verify-attestations-offline). See the [repository provenance guide](https://github.com/chriscollins500/civitai-metadata-studio/blob/main/docs/provenance.md) for maintained implementation notes.

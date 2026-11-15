# Know where your download came from

**Outcome:** verify release bytes and authenticated build origin without installing a signing system into the app.

Download from the [official releases](https://github.com/chriscollins500/civitai-metadata-studio/releases). The portable ZIP contains one HTML file with the full MIT notice embedded. The standalone HTML, ZIP, and checksum manifest have GitHub/Sigstore build attestations.

## Verify with GitHub CLI

With a current authenticated GitHub CLI and the downloaded file in your working directory:

```powershell
gh attestation verify civitai-metadata-studio.zip --repo chriscollins500/civitai-metadata-studio --signer-workflow chriscollins500/civitai-metadata-studio/.github/workflows/ci.yml --deny-self-hosted-runners
```

Substitute `civitai-metadata-studio.html` or `SHA256SUMS.txt` to verify the other assets. Advanced consumers can add `--source-digest <full-commit-sha>` to pin a reviewed build source. Verify the repository/workflow identity as well as the digest; “some signature exists” is not enough.

Checksums detect byte changes against a trusted expected value. Attestations additionally bind the digest to authenticated provenance. Neither is a malware-safety guarantee, Windows Authenticode signature, macOS notarization, browser trust badge, or a claim of certified SLSA level.

## v1.0.1 maintenance release

The maintenance release contains the reviewed dependency/native-SDK/reconnect fixes and keeps the browser workflow unchanged. Its final HTML/ZIP, source-tag provenance, exact hashes, and validation limits are recorded in the [versioned release notes](https://github.com/chriscollins500/civitai-metadata-studio/blob/v1.0.1/docs/releases/v1.0.1.md). Verify against `--source-ref refs/tags/v1.0.1` to require that release's source reference. Historical 1.0.0 hashes below do not apply to 1.0.1.

## v1.0.0 evidence

These are the published **2026-11-14** assets, not hashes for every future build:

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

The repository enables immutable **future** releases: prepare a draft, attach and verify all assets, then publish. Published immutable assets/tags cannot be modified. This does not retroactively make the existing v1.0.0 release immutable, and it is not a reason to recreate it. Version-tag rules independently prevent moves/deletion. See [repository operations](https://github.com/chriscollins500/civitai-metadata-studio/blob/main/docs/repository-operations.md).

CI derives `SOURCE_DATE_EPOCH` from the reviewed committed release date/version, and build inputs are LF-normalized. A later rebuild can therefore reproduce the published date rather than silently changing bytes. A mismatch fails signing; it is never an instruction to replace old release assets.

An application source change may intentionally prevent reproducing an older release. Make a new version through the normal review/release process; do not retag an old one to manufacture a match. Publishing a wiki is not a new application release.

## Cost and scope

GitHub artifact attestations are available without a separate signing subscription for public repositories. Runner/storage choices can still have their own billing rules. No user image, prompt, workflow, model bytes, or local path is submitted for artifact attestation; public artifact digests and build provenance are signed.

Primary documentation checked **2026-11-14**: [GitHub attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations), [official action](https://github.com/actions/attest), [CLI verification](https://cli.github.com/manual/gh_attestation_verify), [offline verification](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/verify-attestations-offline). See the [repository provenance guide](https://github.com/chriscollins500/civitai-metadata-studio/blob/main/docs/provenance.md) for maintained implementation notes.

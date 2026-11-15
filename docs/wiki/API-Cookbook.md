# API cookbook: inspect → edit → prove → export

These examples use a running local companion and synthetic paths. Replace the paths with permitted files, and keep the temporary token local. See [setup](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Automation-Setup) first.

## A complete PowerShell session

Use a client shell that has the same temporary token through your local credential mechanism. This example does not print prompts or the token.

```powershell
$studioBase = "http://127.0.0.1:4318"
$studioHeaders = @{ Authorization = "Bearer $env:STUDIO_API_TOKEN" }

$image = Invoke-RestMethod "$studioBase/v1/images" -Method Post -Headers $studioHeaders -ContentType "application/json" -Body (@{ path = "C:\Images\example.png" } | ConvertTo-Json)
$imageUrl = "$studioBase/v1/images/$($image.imageId)"

try {
    $edit = @{ expectedRevision = $image.revision; fields = @{ steps = 12; seed = "18446744073709551615" } }
    $image = Invoke-RestMethod $imageUrl -Method Patch -Headers $studioHeaders -ContentType "application/json" -Body ($edit | ConvertTo-Json -Depth 10)

    $exportHeaders = $studioHeaders.Clone()
    $exportHeaders["Idempotency-Key"] = [Guid]::NewGuid().ToString()
    $saved = Invoke-RestMethod "$imageUrl/export" -Method Post -Headers $exportHeaders -ContentType "application/json" -Body (@{ expectedRevision = $image.revision; filename = "example_reviewed.png" } | ConvertTo-Json)
    $saved | Select-Object filename, bytes, sha256, originalUnchanged
    $saved.integrity
} finally {
    Invoke-RestMethod $imageUrl -Method Delete -Headers $studioHeaders | Out-Null
}
```

The output folder must already exist and be granted at startup. The destination must not exist. A JPEG source needs a JPEG filename; requesting `.png` does not convert it. The edited seed is a string to avoid integer rounding.

## Verify without uploading the image

Before exporting, optionally call verification using the current revision:

```powershell
$image = Invoke-RestMethod "$imageUrl/verify" -Method Post -Headers $studioHeaders -ContentType "application/json" -Body (@{ expectedRevision = $image.revision } | ConvertTo-Json)
$image.verification
```

This requires `--network`. Only exact identity data leaves the process. Always use the returned revision for the next operation—even if no resource was newly resolved. An unresolved resource is not a license to accept a name-only match.

## Read prompts only when needed

```powershell
$privateRecord = Invoke-RestMethod "${imageUrl}?includePrompts=true" -Headers $studioHeaders
$privateReport = Invoke-RestMethod "$imageUrl/report?includePrompts=true" -Headers $studioHeaders
```

Treat these variables as potentially sensitive. A default report also deserves review: hiding two prompt fields does not sanitize all arbitrary resource text.

## Change a resource or preservation choice

Read the current record and use its actual resource key. Send only intended values:

```json
{
  "expectedRevision": 1,
  "resources": [{"key": "key-from-current-record", "values": {"role": "lora", "weight": 0.75}}]
}
```

For preservation, use IDs from `preservedMetadata` and respect `preserveSupported`. For new identity evidence, use exact known AIR/version/hash values; do not construct numeric IDs from a search result's position or a filename. Identity-changing edits clear old proof.

## Search and hash are separate actions

`POST /v1/resources/search` with `{"query":"example model"}` is an explicit public text search. It returns candidates but does not silently attach one to an image.

`POST /v1/models/hash` with a permitted `path` streams local bytes to calculate supported hashes. It neither loads tensors nor uploads the model. Apply the relevant exact evidence deliberately, then verify separately if desired.

## A safe batch pattern

There is no bulk endpoint. Iterate explicit input paths: open → inspect/edit → export → close. Keep at most four operations active and no more than 32 sessions. Sequential processing is the simplest default. On any error, close the session in a `finally` block where possible and record only the minimal non-sensitive diagnostic.

Do not blindly retry a revision conflict. Read the current record and decide whether your edit still applies. For an uncertain export response, retry with the **same** idempotency key/arguments while its five-minute window remains valid. A different key is a new operation and may correctly fail because the output now exists.

Never retry a Civitai 429 to force verification. The shared cooldown must be respected.

**Related:** [HTTP reference](https://github.com/chriscollins500/civitai-metadata-studio/wiki/HTTP-API-Reference) · [Saving and pixel integrity](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Saving-and-Pixel-Integrity)

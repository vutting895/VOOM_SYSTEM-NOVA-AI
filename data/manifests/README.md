# Dataset Manifests

A manifest is immutable metadata for one exact object snapshot. The schema is `../schemas/dataset-manifest.schema.json`.

## Rules
- Generate `dataset_id` once and never reuse it for changed bytes.
- Compute SHA-256 from the final uploaded object bytes; never trust a client-provided hash alone.
- Keep source/provider symbol distinct from NOVA's canonical instrument.
- Use `quarantined` or `pending_review` until all quality and provenance checks pass.
- `approved` is a human/data-governance state, not merely a successful upload.
- New data or changed processing creates a new dataset ID and manifest; never overwrite an approved snapshot.

# NOVA R2 Setup — Phase B

## Current account state
R2 API access currently returns Cloudflare error 10042: "Please enable R2 through the Cloudflare Dashboard." No bucket has been created by this change.

## One-time account action
1. Open Cloudflare Dashboard: https://dash.cloudflare.com/?to=/:account/r2/overview
2. Enable/subscribe to R2 for the connected account and review billing terms.
3. Do not enable public bucket access.
4. After R2 is enabled, the implementation operator can create the private bucket `nova-data-artifacts` in the account.
5. Bind the bucket to the NOVA ingestion Worker as `NOVA_DATA_BUCKET`; do not put S3 credentials in the browser or repository.

## Object layout
- `raw/{provider}/{instrument}/{timeframe}/{date}/...`
- `processed/{instrument}/{timeframe}/{date}/...`
- `features/{feature_set_version}/{instrument}/{timeframe}/...`
- `datasets/{dataset_id}/...`
- `quarantine/{ingestion_job_id}/...`
- `manifests/{dataset_id}.json`
- `quality-reports/{dataset_id}.json`
- `checkpoints/{run_id}/...`
- `models/{model_family}/{model_version}/...`

## Security and integrity
- Bucket remains private; no public URL or public custom domain.
- Worker endpoints must authenticate and authorize before object operations.
- Only approved roots are accepted by `r2_storage.mjs`; path traversal is rejected.
- Writes are create-only using R2 conditional `onlyIf.etagDoesNotMatch = "*"`.
- SHA-256 is calculated by the Worker and checked after read.
- No delete operation is exposed by the adapter.
- Keep R2 API credentials and Supabase service-role key in Worker secrets only.

## Cost guard
Cloudflare's current published R2 free tier includes 10 GB-month storage, 1 million Class A operations, and 10 million Class B operations per month; usage above included amounts is billed. Monitor actual account pricing and usage before bulk import. Do not assume unlimited free storage.

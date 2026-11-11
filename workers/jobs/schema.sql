-- Apply only through a separately reviewed NOVA database migration.
-- No broker credentials, execution permissions, or user tokens belong in this queue.
CREATE TABLE IF NOT EXISTS nova_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type text NOT NULL CHECK (job_type IN (
        'dataset.validate',
        'dataset.manifest',
        'research.backtest'
    )),
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    idempotency_key varchar(200) NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'retry', 'succeeded', 'dead')),
    priority smallint NOT NULL DEFAULT 0 CHECK (priority BETWEEN -10 AND 10),
    attempts smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts smallint NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
    available_at timestamptz NOT NULL DEFAULT now(),
    worker_id varchar(128),
    lease_expires_at timestamptz,
    last_error_code varchar(64),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (status = 'running' AND worker_id IS NOT NULL AND lease_expires_at IS NOT NULL)
        OR
        (status <> 'running' AND worker_id IS NULL AND lease_expires_at IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS nova_jobs_claim_idx
    ON nova_jobs (priority DESC, available_at, created_at)
    WHERE status IN ('queued', 'retry');

CREATE INDEX IF NOT EXISTS nova_jobs_expired_lease_idx
    ON nova_jobs (lease_expires_at)
    WHERE status = 'running';

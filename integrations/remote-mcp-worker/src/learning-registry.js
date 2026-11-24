const TABLES = {
  datasets: "nova_dataset_registry",
  models: "nova_model_registry",
  runs: "nova_learning_runs"
};

async function readRows(table, request, env, query) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) throw new Error("Supabase runtime is not configured");
  const url = new URL(env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + table);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  const response = await fetch(url, {
    method: "GET",
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: request.headers.get("Authorization") || "",
      Accept: "application/json"
    },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(6000)
  });
  if (!response.ok) throw new Error("Registry read failed (" + response.status + "); verify migration, grants and owner RLS");
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Registry returned an invalid response");
  return rows;
}

function boundedLimit(value, fallback = 25) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new Error("limit must be an integer from 1 to 100");
  return n;
}

function safeId(value, label) {
  const id = String(value || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(label + " must be a UUID");
  }
  return id;
}

export async function listDatasetRegistry(args, request, env) {
  const limit = boundedLimit(args.limit);
  const query = { select: "id,dataset_key,source,symbol,timeframe,row_count,start_at,end_at,sha256,quality_status,validation_status,created_at", order: "created_at.desc", limit };
  if (args.symbol) query.symbol = "eq." + String(args.symbol).toUpperCase();
  if (args.timeframe) query.timeframe = "eq." + String(args.timeframe).toUpperCase();
  if (args.validation_status) query.validation_status = "eq." + String(args.validation_status);
  const rows = await readRows(TABLES.datasets, request, env, query);
  return { count: rows.length, datasets: rows, registry: "nova_dataset_registry", readOnly: true };
}

export async function getDatasetRecord(args, request, env) {
  const id = safeId(args.dataset_id, "dataset_id");
  const rows = await readRows(TABLES.datasets, request, env, {
    select: "id,dataset_key,source,symbol,timeframe,row_count,start_at,end_at,sha256,storage_uri,quality_status,validation_status,manifest,coverage_report,created_at,updated_at",
    id: "eq." + id,
    limit: 1
  });
  if (!rows.length) throw new Error("Dataset not found in this user's registry");
  return { dataset: rows[0], readOnly: true };
}

export async function listModelRegistry(args, request, env) {
  const limit = boundedLimit(args.limit);
  const query = { select: "id,model_key,model_version,architecture,dataset_id,dataset_sha256,feature_schema_sha256,artifact_sha256,lifecycle_status,training_mode,metrics,evaluation,oos_start_at,oos_closed_trades,walk_forward_status,approved_at,created_at", order: "created_at.desc", limit };
  if (args.architecture) query.architecture = "eq." + String(args.architecture);
  if (args.lifecycle_status) query.lifecycle_status = "eq." + String(args.lifecycle_status);
  const rows = await readRows(TABLES.models, request, env, query);
  return { count: rows.length, models: rows, registry: "nova_model_registry", readOnly: true };
}

export async function getModelRecord(args, request, env) {
  const id = safeId(args.model_id, "model_id");
  const rows = await readRows(TABLES.models, request, env, {
    select: "id,model_key,model_version,architecture,dataset_id,dataset_sha256,feature_schema_sha256,code_revision,artifact_uri,artifact_sha256,lifecycle_status,training_mode,metrics,evaluation,oos_start_at,oos_closed_trades,walk_forward_status,approved_at,approved_by,rollback_model_id,created_at,updated_at",
    id: "eq." + id,
    limit: 1
  });
  if (!rows.length) throw new Error("Model not found in this user's registry");
  return { model: rows[0], readOnly: true };
}

export async function listLearningRuns(args, request, env) {
  const limit = boundedLimit(args.limit);
  const query = { select: "id,run_key,run_type,status,dataset_id,model_id,metrics,evidence,error_code,started_at,finished_at,created_at,updated_at", order: "created_at.desc", limit };
  if (args.status) query.status = "eq." + String(args.status);
  if (args.run_type) query.run_type = "eq." + String(args.run_type);
  const rows = await readRows(TABLES.runs, request, env, query);
  return { count: rows.length, runs: rows, registry: "nova_learning_runs", readOnly: true };
}

export async function getLearningRun(args, request, env) {
  const id = safeId(args.run_id, "run_id");
  const rows = await readRows(TABLES.runs, request, env, {
    select: "id,run_key,run_type,status,dataset_id,model_id,config,metrics,evidence,error_code,started_at,finished_at,created_at,updated_at",
    id: "eq." + id,
    limit: 1
  });
  if (!rows.length) throw new Error("Learning run not found in this user's registry");
  return { run: rows[0], readOnly: true };
}

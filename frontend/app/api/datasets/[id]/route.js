import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { authenticateAgentRequest, agentApiJson } from "../../../../lib/agent-approval-server.js";
import { isUuid } from "../../../../lib/agent-approval-server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const auth = await authenticateAgentRequest(request);
  if (!auth.ok) return auth.response;
  const resolved = await params;
  const id = resolved?.id;
  if (!isUuid(id)) return agentApiJson({ error: "dataset_not_found" }, 404);

  // RLS filters by the authenticated owner. A foreign tenant and an unknown ID
  // intentionally produce the same response.
  const { data: manifest, error } = await auth.supabase
    .from("nova_market_datasets")
    .select("id,symbol,timeframe,provider,range_start,range_end,row_count,numeric_encoding,compression,content_sha256,storage_path,revoked_at,created_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !manifest || manifest.revoked_at) {
    return agentApiJson({ error: "dataset_not_found" }, 404);
  }
  if (manifest.compression !== "gzip" || manifest.numeric_encoding !== "decimal-string"
    || !manifest.storage_path.startsWith(auth.user.id + "/")) {
    return agentApiJson({ error: "dataset_manifest_invalid" }, 409);
  }

  const { data: object, error: downloadError } = await auth.supabase.storage
    .from("nova-datasets")
    .download(manifest.storage_path);
  if (downloadError || !object) return agentApiJson({ error: "dataset_object_unavailable" }, 503);

  try {
    const compressed = Buffer.from(await object.arrayBuffer());
    const digest = createHash("sha256").update(compressed).digest("hex");
    if (digest !== manifest.content_sha256) {
      return agentApiJson({ error: "dataset_integrity_check_failed" }, 409);
    }
    const decompressed = gunzipSync(compressed, { maxOutputLength: 16 * 1024 * 1024 }).toString("utf8");
    const candles = decompressed.trimEnd().split("\n").map((line) => JSON.parse(line));
    if (candles.length !== manifest.row_count
      || candles.some((candle) => !candle || ["open", "high", "low", "close", "volume"].some((key) => typeof candle[key] !== "string"))) {
      return agentApiJson({ error: "dataset_payload_invalid" }, 409);
    }
    return agentApiJson({
      dataset: {
        id: manifest.id,
        symbol: manifest.symbol,
        timeframe: manifest.timeframe,
        provider: manifest.provider,
        range_start: manifest.range_start,
        range_end: manifest.range_end,
        row_count: manifest.row_count,
        numeric_encoding: manifest.numeric_encoding,
        compression: manifest.compression,
        sha256: digest,
        created_at: manifest.created_at,
      },
      candles,
      integrity: "verified",
      executionEnabled: false,
      liveTradingEnabled: false,
    });
  } catch {
    return agentApiJson({ error: "dataset_decode_failed" }, 409);
  }
}

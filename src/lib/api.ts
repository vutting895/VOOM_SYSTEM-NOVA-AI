import { supabase } from "./supabase";
import { fetchWithBearer } from "./authenticated-fetch.js";

const SYSTEM_HUB_URL = "https://voom-system-hub.suwapat787.workers.dev";
const NOVA_AI_WORKER_URL = "https://voom-system-nova-ai.suwapat787.workers.dev";

export class ApiRequestError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

async function requestJson(baseUrl: string, path: string, init: RequestInit = {}) {
  if (!supabase) throw new ApiRequestError(503, "auth_not_configured");
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    throw new ApiRequestError(400, "invalid_api_path");
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw new ApiRequestError(401, "session_unavailable");

  const response = await fetchWithBearer(
    new URL(path, baseUrl).toString(),
    () => Promise.resolve(data.session?.access_token ?? null),
    init
  );

  const payload = await response.json().catch(() => null);
  if (response.status === 401) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
  if (!response.ok) {
    const code = payload && typeof payload.error === "string" ? payload.error : "request_failed";
    throw new ApiRequestError(response.status, code);
  }
  return payload;
}

export function requestSystemHub(path: string, init: RequestInit = {}) {
  return requestJson(SYSTEM_HUB_URL, path, init);
}

export function requestNovaAi(path: string, init: RequestInit = {}) {
  return requestJson(NOVA_AI_WORKER_URL, path, init);
}

export function toUserApiError(error: unknown, fallback: string) {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return "เซสชันหมดอายุหรือไม่ได้รับอนุญาต กรุณาเข้าสู่ระบบใหม่";
    if (error.status === 409) return "การเชื่อมต่อยังรอการจัดเตรียม ไม่สามารถยืนยันข้อมูลจริงได้";
    if (error.status === 503 || error.status >= 500) return "บริการ NOVA ยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง";
    if (error.status === 404) return "ไม่พบรายการเชื่อมต่อหรือบริการที่ร้องขอ";
    return "คำขอไม่สำเร็จ กรุณาตรวจสอบข้อมูลและลองอีกครั้ง";
  }
  return fallback;
}

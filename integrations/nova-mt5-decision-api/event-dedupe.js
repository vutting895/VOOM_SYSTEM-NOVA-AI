const PROCESSING_LEASE_MS = 90_000;
const COMPLETED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_KEY = "event_reservation";

const json = (body, status = 200) => Response.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
});

export class EventDedupe {
  constructor(ctx) {
    this.ctx = ctx;
    this.storage = ctx.storage;
  }

  async fetch(request) {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const url = new URL(request.url);
    if (!["/reserve", "/complete", "/release"].includes(url.pathname)) {
      return json({ error: "not_found" }, 404);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const eventId = body?.event_id;
    if (typeof eventId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(eventId)) {
      return json({ error: "invalid_event_id" }, 400);
    }

    if (url.pathname === "/reserve") {
      const claimId = body?.claim_id;
      const timestamp = body?.timestamp;
      if (typeof claimId !== "string" || !/^[A-Za-z0-9-]{16,64}$/.test(claimId) ||
          typeof timestamp !== "string" || !/^\d{10}$/.test(timestamp)) {
        return json({ error: "invalid_reservation" }, 400);
      }
      const now = Date.now();
      const decision = await this.storage.transaction(async (txn) => {
        const current = await txn.get(STORAGE_KEY);
        if (current && current.expires_at_ms > now) return { accepted: false };
        await txn.put(STORAGE_KEY, {
          event_id: eventId,
          claim_id: claimId,
          status: "processing",
          created_at_ms: now,
          expires_at_ms: now + PROCESSING_LEASE_MS,
        });
        return { accepted: true };
      });
      if (!decision.accepted) return json({ error: "duplicate_or_in_progress_event" }, 409);
      await this.storage.setAlarm(now + PROCESSING_LEASE_MS);
      return json({ reserved: true, status: "processing" }, 201);
    }

    const claimId = body?.claim_id;
    if (typeof claimId !== "string" || !/^[A-Za-z0-9-]{16,64}$/.test(claimId)) {
      return json({ error: "invalid_claim_id" }, 400);
    }
    const now = Date.now();
    if (url.pathname === "/complete") {
      const decision = await this.storage.transaction(async (txn) => {
        const current = await txn.get(STORAGE_KEY);
        if (!current || current.event_id !== eventId || current.claim_id !== claimId ||
            current.status !== "processing") return { completed: false };
        await txn.put(STORAGE_KEY, {
          ...current,
          status: "complete",
          completed_at_ms: now,
          expires_at_ms: now + COMPLETED_RETENTION_MS,
        });
        return { completed: true };
      });
      if (!decision.completed) return json({ error: "reservation_not_owned" }, 409);
      await this.storage.setAlarm(now + COMPLETED_RETENTION_MS);
      return json({ completed: true }, 200);
    }

    const decision = await this.storage.transaction(async (txn) => {
      const current = await txn.get(STORAGE_KEY);
      if (!current || current.event_id !== eventId || current.claim_id !== claimId ||
          current.status !== "processing") return { released: false };
      await txn.delete(STORAGE_KEY);
      return { released: true };
    });
    if (!decision.released) return json({ error: "reservation_not_owned" }, 409);
    return json({ released: true }, 200);
  }

  async alarm() {
    const now = Date.now();
    await this.storage.transaction(async (txn) => {
      const current = await txn.get(STORAGE_KEY);
      if (!current) return;
      if (current.expires_at_ms <= now) {
        await txn.delete(STORAGE_KEY);
      } else {
        await this.storage.setAlarm(current.expires_at_ms);
      }
    });
  }
}

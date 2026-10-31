const DEFAULT_MAX_BODY_BYTES = 16 * 1024;

/**
 * Read an untrusted request body without buffering more than maxBytes.
 * Content-Length is an early-rejection hint only; streamed bytes are always
 * counted independently because the header may be absent or inaccurate.
 */
export async function readBoundedRequestBody(request, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new TypeError('maxBytes must be a non-negative safe integer');
  }

  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    if (!/^\\d+$/.test(declaredLength)) {
      return { ok: false, status: 400, error: 'invalid_content_length' };
    }
    if (Number(declaredLength) > maxBytes) {
      return { ok: false, status: 413, error: 'request_too_large' };
    }
  }

  if (!request.body) return { ok: true, raw: '' };

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try { await reader.cancel(); } catch {}
        return { ok: false, status: 413, error: 'request_too_large' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: 'invalid_request_body' };
  } finally {
    try { reader.releaseLock(); } catch {}
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, raw: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, status: 400, error: 'invalid_request_body' };
  }
}

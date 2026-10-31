const DEFAULT_MAX_BYTES = 16 * 1024;
const KEY_NAME = /^[A-Za-z0-9_-]{1,64}$/;
const CIPHERTEXT = /^vault:v[1-9][0-9]*:[A-Za-z0-9+/=]+$/;

function toBytes(value, label) {
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") return new TextEncoder().encode(value);
  throw new TypeError(label + "_must_be_string_or_uint8array");
}
function encodeBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}
function decodeBase64(value) {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("openbao_invalid_response");
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function safeContext(context, maxBytes) {
  const bytes = toBytes(context, "context");
  if (bytes.length < 1 || bytes.length > maxBytes) throw new RangeError("openbao_context_size_invalid");
  return encodeBase64(bytes);
}
function responseData(response) {
  if (!response || typeof response !== "object" || !response.data || typeof response.data !== "object") {
    throw new Error("openbao_invalid_response");
  }
  return response.data;
}

/**
 * Creates a deliberately transport-agnostic OpenBao Transit client.
 * The caller must supply a private VPC/service-binding transport; this module
 * never creates a public URL or falls back to global fetch.
 */
export function createOpenBaoTransitClient({
  request,
  token,
  keyName,
  maxBytes = DEFAULT_MAX_BYTES
} = {}) {
  if (typeof request !== "function") throw new TypeError("openbao_private_transport_required");
  if (typeof token !== "string" || token.length < 1 || /\s/.test(token)) {
    throw new TypeError("openbao_machine_token_required");
  }
  if (typeof keyName !== "string" || !KEY_NAME.test(keyName)) throw new TypeError("openbao_key_name_invalid");
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 64 * 1024) {
    throw new RangeError("openbao_max_bytes_invalid");
  }

  async function post(operation, body) {
    let result;
    try {
      result = await request({
        method: "POST",
        path: "/v1/transit/" + operation + "/" + keyName,
        headers: {
          "Content-Type": "application/json",
          "X-Vault-Token": token
        },
        body
      });
    } catch {
      throw new Error("openbao_unavailable");
    }
    if (!result || result.ok !== true || !result.data || typeof result.data !== "object") {
      throw new Error("openbao_request_rejected");
    }
    return result.data;
  }

  return Object.freeze({
    async encrypt(plaintext, context) {
      const bytes = toBytes(plaintext, "plaintext");
      if (bytes.length < 1 || bytes.length > maxBytes) throw new RangeError("openbao_plaintext_size_invalid");
      const data = await post("encrypt", {
        plaintext: encodeBase64(bytes),
        context: safeContext(context, maxBytes)
      });
      if (typeof data.ciphertext !== "string" || !CIPHERTEXT.test(data.ciphertext)) {
        throw new Error("openbao_invalid_response");
      }
      return data.ciphertext;
    },

    async decrypt(ciphertext, context) {
      if (typeof ciphertext !== "string" || !CIPHERTEXT.test(ciphertext)) {
        throw new TypeError("openbao_ciphertext_invalid");
      }
      const data = await post("decrypt", {
        ciphertext,
        context: safeContext(context, maxBytes)
      });
      const plaintext = decodeBase64(data.plaintext);
      if (plaintext.length < 1 || plaintext.length > maxBytes) {
        throw new Error("openbao_plaintext_size_invalid");
      }
      return plaintext;
    }
  });
}

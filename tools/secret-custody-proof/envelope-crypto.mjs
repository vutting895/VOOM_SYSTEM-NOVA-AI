const encoder = new TextEncoder();
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

function bytes(value, name) {
  if (!(value instanceof Uint8Array)) throw new TypeError(name + " must be Uint8Array");
  return value;
}

function copy(value) {
  return new Uint8Array(value);
}

function concat(...parts) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function bindingFields(binding) {
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
    throw new TypeError("INVALID_CUSTODY_BINDING");
  }
  const required = ["bindingId", "ownerId", "connectionId", "provider", "environment", "credentialType"];
  const fields = [["domain", "NOVA-CUSTODY-AAD-V1"]];
  for (const name of required) {
    const value = binding[name];
    if (typeof value !== "string" || !value.trim() || value.length > 256) {
      throw new TypeError("INVALID_CUSTODY_BINDING");
    }
    fields.push([name, value]);
  }
  const tenant = binding.tenantId == null ? "NO_TENANT" : binding.tenantId;
  if (typeof tenant !== "string" || tenant.length > 256) throw new TypeError("INVALID_CUSTODY_BINDING");
  if (!Number.isSafeInteger(binding.generation) || binding.generation < 1) {
    throw new TypeError("INVALID_CUSTODY_BINDING");
  }
  fields.push(["tenantId", tenant], ["generation", String(binding.generation)]);
  return fields;
}

export function canonicalAad(binding) {
  const serialized = bindingFields(binding).map(([name, value]) => {
    const field = name + "=" + String(value);
    return encoder.encode(field).length + ":" + field;
  }).join("|");
  return encoder.encode(serialized);
}

export function canonicalWrapAad(binding) {
  return concat(encoder.encode("NOVA-DEK-WRAP-V1"), new Uint8Array([0]), canonicalAad(binding));
}

function validateRecord(record) {
  if (!record || record.algorithm !== "AES-256-GCM" ||
      typeof record.keyVersion !== "string" || !record.keyVersion ||
      !(record.nonce instanceof Uint8Array) || record.nonce.length !== NONCE_BYTES ||
      !(record.ciphertext instanceof Uint8Array) ||
      !(record.tag instanceof Uint8Array) || record.tag.length !== TAG_BYTES ||
      !(record.wrappedDek instanceof Uint8Array) || record.wrappedDek.length < 1) {
    throw new TypeError("INVALID_ENVELOPE_RECORD");
  }
}

function validateKeyProvider(keyProvider) {
  if (!keyProvider ||
      typeof keyProvider.generateDataKey !== "function" ||
      typeof keyProvider.unwrapDataKey !== "function" ||
      typeof keyProvider.rewrapDataKey !== "function") {
    throw new TypeError("INVALID_CUSTODY_KEY_PROVIDER");
  }
}

export function createEnvelopeCrypto({ keyProvider, cryptoImpl = globalThis.crypto } = {}) {
  validateKeyProvider(keyProvider);
  if (!cryptoImpl?.subtle || typeof cryptoImpl.getRandomValues !== "function") {
    throw new TypeError("WEBCRYPTO_UNAVAILABLE");
  }

  async function importDek(dek, usage) {
    bytes(dek, "DEK");
    if (dek.length !== KEY_BYTES) throw new TypeError("INVALID_DEK_LENGTH");
    return cryptoImpl.subtle.importKey("raw", dek, { name: "AES-GCM" }, false, [usage]);
  }

  async function encrypt(plaintext, binding) {
    const clear = typeof plaintext === "string" ? encoder.encode(plaintext) : copy(bytes(plaintext, "plaintext"));
    try {
      if (clear.length === 0) throw new TypeError("EMPTY_PLAINTEXT");
      const aad = canonicalAad(binding);
      const material = await keyProvider.generateDataKey({ binding: structuredClone(binding) });
      const dek = bytes(material?.plaintextKey, "plaintextKey");
      if (dek.length !== KEY_BYTES || !(material.wrappedKey instanceof Uint8Array) ||
          material.wrappedKey.length < 1 || typeof material.keyVersion !== "string" || !material.keyVersion) {
        dek.fill(0);
        throw new TypeError("INVALID_GENERATED_DATA_KEY");
      }
      try {
        const nonce = cryptoImpl.getRandomValues(new Uint8Array(NONCE_BYTES));
        const key = await importDek(dek, "encrypt");
        const sealed = new Uint8Array(await cryptoImpl.subtle.encrypt(
          { name: "AES-GCM", iv: nonce, additionalData: aad, tagLength: 128 },
          key,
          clear
        ));
        return {
          algorithm: "AES-256-GCM",
          keyVersion: material.keyVersion,
          nonce: copy(nonce),
          ciphertext: sealed.slice(0, -TAG_BYTES),
          tag: sealed.slice(-TAG_BYTES),
          wrappedDek: copy(material.wrappedKey)
        };
      } finally {
        dek.fill(0);
      }
    } finally {
      clear.fill(0);
    }
  }

  async function decrypt(record, binding) {
    validateRecord(record);
    const aad = canonicalAad(binding);
    const dek = bytes(await keyProvider.unwrapDataKey({
      wrappedKey: copy(record.wrappedDek),
      keyVersion: record.keyVersion,
      binding: structuredClone(binding)
    }), "unwrapped DEK");
    if (dek.length !== KEY_BYTES) {
      dek.fill(0);
      throw new TypeError("INVALID_DEK_LENGTH");
    }
    try {
      const key = await importDek(dek, "decrypt");
      const sealed = concat(record.ciphertext, record.tag);
      return new Uint8Array(await cryptoImpl.subtle.decrypt(
        { name: "AES-GCM", iv: record.nonce, additionalData: aad, tagLength: 128 },
        key,
        sealed
      ));
    } finally {
      dek.fill(0);
    }
  }

  async function rewrap(record, binding, targetKeyVersion) {
    validateRecord(record);
    if (typeof targetKeyVersion !== "string" || !targetKeyVersion || targetKeyVersion === record.keyVersion) {
      throw new TypeError("INVALID_TARGET_KEY_VERSION");
    }
    canonicalAad(binding);
    const result = await keyProvider.rewrapDataKey({
      wrappedKey: copy(record.wrappedDek),
      sourceKeyVersion: record.keyVersion,
      targetKeyVersion,
      binding: structuredClone(binding)
    });
    if (!result || result.keyVersion !== targetKeyVersion ||
        !(result.wrappedKey instanceof Uint8Array) || result.wrappedKey.length < 1) {
      throw new TypeError("INVALID_REWRAPPED_DATA_KEY");
    }
    return { ...record, keyVersion: result.keyVersion, wrappedDek: copy(result.wrappedKey) };
  }

  return {
    encrypt,
    decrypt,
    rewrap,
    async withPlaintext(record, binding, consumer) {
      if (typeof consumer !== "function") throw new TypeError("INVALID_PLAINTEXT_CONSUMER");
      const plaintext = await decrypt(record, binding);
      try { return await consumer(plaintext); }
      finally { plaintext.fill(0); }
    }
  };
}

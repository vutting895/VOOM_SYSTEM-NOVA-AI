const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /\bBasic\s+[A-Za-z0-9+/]+=*/gi,
  /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password)=)[^&#\s]+/gi,
  /((?:[A-Z0-9_]*(?:API[_-]?KEY|ACCESS[_-]?TOKEN|REFRESH[_-]?TOKEN|CLIENT[_-]?SECRET|PASSWORD|PASSWD|SECRET)|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|password|passwd|secret)\s*[:=]\s*)(["']?)([^"'\x60\s,;]{4,})\2/gi,
];

export function redactSensitiveText(value) {
  if (typeof value !== 'string') return '';
  return SECRET_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, (match, prefix) =>
      prefix ? prefix + '[REDACTED]' : '[REDACTED]'),
    value,
  );
}

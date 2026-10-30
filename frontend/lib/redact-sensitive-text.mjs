const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /\bBasic\s+[A-Za-z0-9+/]+={0,2}/gi,
  /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,})\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /((?:^|\n)\s*(?:cookie|set-cookie)\s*:\s*)[^\r\n]+/gim,
  /([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|sig)=)[^&#\s]+/gi,
  /((?:[A-Z0-9_]*(?:API[_-]?KEY|API[_-]?TOKEN|ACCESS[_-]?TOKEN|REFRESH[_-]?TOKEN|CLIENT[_-]?SECRET|SERVICE[_-]?ROLE[_-]?KEY|PRIVATE[_-]?KEY|SECRET[_-]?KEY|AUTH[_-]?TOKEN|SESSION[_-]?TOKEN|GITHUB[_-]?TOKEN|DATABASE_URL|PASSWORD|PASSWD|SECRET|COOKIE|TOKEN)|api[_ -]?key|api[_ -]?token|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|service[_ -]?role[_ -]?key|private[_ -]?key|secret[_ -]?key|auth[_ -]?token|session[_ -]?token|database[_ -]?url|password|passwd|secret|cookie)\s*[:=]\s*)(["']?)([^"'\x60\s,;]{4,})\2/gi,
];

export function redactSensitiveText(value) {
  if (typeof value !== 'string') return '';
  return SECRET_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, (...args) => {
      const prefix = typeof args[1] === 'string' ? args[1] : '';
      return prefix ? prefix + '[REDACTED]' : '[REDACTED]';
    }),
    value,
  );
}

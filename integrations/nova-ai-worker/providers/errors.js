export class ProviderError extends Error {
  constructor(provider, code, status = 503, retryable = false) {
    super(code);
    this.name = "ProviderError";
    this.provider = provider;
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export function classifyProviderFailure(provider, status) {
  if (status === 429) return new ProviderError(provider, "provider_rate_limited", status, true);
  if (status >= 500) return new ProviderError(provider, "provider_server_error", status, true);
  if (status === 401 || status === 403) return new ProviderError(provider, "provider_authentication_failed", status, false);
  if (status === 400) return new ProviderError(provider, "provider_request_rejected", status, false);
  return new ProviderError(provider, "provider_request_failed", status || 503, false);
}

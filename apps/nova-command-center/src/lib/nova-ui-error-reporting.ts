/** Local-only error reporting. No third-party telemetry or secrets are transmitted. */
export function reportNovaUiError(
  error: unknown,
  context: { boundary?: string } = {},
): void {
  const name = error instanceof Error ? error.name : "UnknownError";
  const boundary = context.boundary ?? "unknown";
  // Deliberately omit error messages and stack traces that may contain request data.
  console.error("[NOVA UI error]", { boundary, name });
}

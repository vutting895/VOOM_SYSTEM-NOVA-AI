function workspacePath(value, field) {
  if (typeof value !== "string" || value.length === 0 || value.length > 240) {
    throw new TypeError(`${field} must be a relative workspace path`);
  }
  if (value.startsWith("/") || value.includes("\\") || value.includes(":") || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new RangeError(`${field} contains an unsafe path character`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new RangeError(`${field} must not escape the isolated workspace`);
  }
  return value;
}

function finiteRange(value, field, min, max, exclusiveMin = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || (exclusiveMin ? value <= min : value < min) || value > max) {
    throw new RangeError(`${field} is outside the allowed range`);
  }
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

/** Build argv arrays for an isolated worker. Never pass these through a shell. */
export function buildFfmpegTrimArgs({ inputPath, outputPath, startSeconds, durationSeconds }) {
  const input = workspacePath(inputPath, "inputPath");
  const output = workspacePath(outputPath, "outputPath");
  const start = finiteRange(startSeconds, "startSeconds", 0, 86400);
  const duration = finiteRange(durationSeconds, "durationSeconds", 0, 3600, true);
  if (input === output) throw new RangeError("inputPath and outputPath must differ");

  return [
    "-nostdin", "-hide_banner", "-y",
    "-ss", start,
    "-i", input,
    "-t", duration,
    "-map", "0:v:0?",
    "-map", "0:a:0?",
    "-c:v", "libx264",
    "-c:a", "aac",
    "-movflags", "+faststart",
    output,
  ];
}

export function buildFfmpegConcatArgs({ manifestPath, outputPath }) {
  const manifest = workspacePath(manifestPath, "manifestPath");
  const output = workspacePath(outputPath, "outputPath");
  if (manifest === output) throw new RangeError("manifestPath and outputPath must differ");
  return [
    "-nostdin", "-hide_banner", "-y",
    "-f", "concat",
    "-safe", "1",
    "-i", manifest,
    "-c", "copy",
    output,
  ];
}

export function buildFfprobeArgs({ inputPath }) {
  const input = workspacePath(inputPath, "inputPath");
  return ["-v", "error", "-show_format", "-show_streams", "-of", "json", input];
}

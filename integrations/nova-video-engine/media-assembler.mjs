import { spawn } from "node:child_process";
import { access, mkdir, realpath, stat, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { resolveWithinRoot } from "./ffmpeg-renderer.mjs";
import { validateGeneratedAssets } from "./quality-control.mjs";

const VIDEO_EXTENSIONS = new Set([".mp4"]);
const AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg"]);
const OUTPUT_DIMENSIONS = Object.freeze({ "9:16": [704, 1280], "16:9": [1280, 704] });
const MAX_SUBTITLE_CUES = 120;
const MAX_STDOUT = 128_000;

function safeId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value)) throw new TypeError("invalid_assembly_job_id");
  return value;
}

function safeRelativePath(value, field, extensions) {
  if (typeof value !== "string" || !value.trim() || value.startsWith("/") || value.includes("\\") || value.split("/").some((part) => part === ".." || part === "." || !part)) throw new TypeError("invalid_" + field);
  if (!extensions.has(path.extname(value).toLowerCase())) throw new TypeError("unsupported_" + field + "_type");
  return value;
}

function subtitleTimestamp(seconds) {
  const totalMs = Math.round(seconds * 1000);
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const wholeSeconds = Math.floor((totalMs % 60_000) / 1000);
  const milliseconds = totalMs % 1000;
  return [String(hours).padStart(2, "0"), String(minutes).padStart(2, "0"), String(wholeSeconds).padStart(2, "0")].join(":") + "," + String(milliseconds).padStart(3, "0");
}

export function buildSrtSubtitles(cues, durationSeconds) {
  if (!Array.isArray(cues) || cues.length > MAX_SUBTITLE_CUES) throw new TypeError("invalid_subtitle_cues");
  const normalized = cues.map((cue, index) => {
    if (!cue || typeof cue !== "object") throw new TypeError("invalid_subtitle_cue_" + (index + 1));
    const start = Number(cue.startSeconds);
    const end = Number(cue.endSeconds);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > durationSeconds + 0.001) throw new RangeError("invalid_subtitle_timing_" + (index + 1));
    if (typeof cue.text !== "string" || !cue.text.trim() || cue.text.length > 180) throw new TypeError("invalid_subtitle_text_" + (index + 1));
    const text = cue.text.replace(/<[^>]*>/g, "").replace(/-->/g, "—›").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
    if (!text) throw new TypeError("empty_subtitle_text_" + (index + 1));
    return { start, end, text };
  }).sort((left, right) => left.start - right.start);
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index].start < normalized[index - 1].end - 0.001) throw new RangeError("overlapping_subtitle_cues");
  }
  return normalized.map((cue, index) => String(index + 1) + "\n" + subtitleTimestamp(cue.start) + " --> " + subtitleTimestamp(cue.end) + "\n" + cue.text + "\n").join("\n");
}

export function buildNOVAAssemblyCommand({ plan, assets, workspaceRoot, jobId, voiceoverPath = null, musicPath = null, subtitlePath = null, outputRelativePath = null, musicVolume = 0.18 }) {
  if (!plan || !Array.isArray(plan.scenes) || plan.scenes.length < 1 || plan.scenes.length > 12) throw new TypeError("assembly_plan_required");
  if (!OUTPUT_DIMENSIONS[plan.aspectRatio]) throw new TypeError("assembly_unsupported_aspect_ratio");
  if (plan.frameRate !== 24 || !Number.isFinite(plan.durationSeconds) || plan.durationSeconds <= 0) throw new TypeError("assembly_timeline_invalid");
  const assetCheck = validateGeneratedAssets(plan, assets);
  if (!assetCheck.valid) throw new Error("assembly_assets_invalid: " + assetCheck.issues.join(","));
  if (!Number.isFinite(musicVolume) || musicVolume < 0 || musicVolume > 0.5) throw new RangeError("invalid_music_volume");
  const [width, height] = OUTPUT_DIMENSIONS[plan.aspectRatio];
  const safeJobId = safeId(jobId);
  const args = ["-hide_banner", "-nostdin", "-n"];
  const sceneAssets = new Map(assets.map((asset) => [asset.sceneId, asset]));
  const filters = [];
  plan.scenes.forEach((scene, index) => {
    const asset = sceneAssets.get(scene.sceneId);
    const relative = safeRelativePath(asset.assetPath, "scene_asset", VIDEO_EXTENSIONS);
    args.push("-i", resolveWithinRoot(workspaceRoot, relative));
    filters.push("[" + index + ":v]scale=" + width + ":" + height + ":force_original_aspect_ratio=decrease,pad=" + width + ":" + height + ":(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=24,tpad=stop_mode=clone:stop_duration=0.2,trim=duration=" + scene.durationSeconds.toFixed(3) + ",setpts=PTS-STARTPTS,format=yuv420p[v" + index + "]");
  });
  const videoInputs = plan.scenes.map((_, index) => "[v" + index + "]").join("");
  filters.push(videoInputs + "concat=n=" + plan.scenes.length + ":v=1:a=0[vout]");
  let nextInput = plan.scenes.length;
  const audioInputs = [];
  if (voiceoverPath) {
    const relative = safeRelativePath(voiceoverPath, "voiceover", AUDIO_EXTENSIONS);
    args.push("-i", resolveWithinRoot(workspaceRoot, relative));
    audioInputs.push({ index: nextInput++, type: "voice" });
  }
  if (musicPath) {
    const relative = safeRelativePath(musicPath, "music", AUDIO_EXTENSIONS);
    args.push("-i", resolveWithinRoot(workspaceRoot, relative));
    audioInputs.push({ index: nextInput++, type: "music" });
  }
  let subtitleInput = null;
  if (subtitlePath) {
    args.push("-i", resolveWithinRoot(workspaceRoot, safeRelativePath(subtitlePath, "subtitle", new Set([".srt"]))));
    subtitleInput = nextInput++;
  }
  const audioDuration = plan.durationSeconds.toFixed(3);
  const voice = audioInputs.find((item) => item.type === "voice");
  const music = audioInputs.find((item) => item.type === "music");
  if (voice) filters.push("[" + voice.index + ":a:0]aresample=48000,asetpts=PTS-STARTPTS,apad=pad_dur=" + audioDuration + ",atrim=duration=" + audioDuration + "[voice]");
  if (music) filters.push("[" + music.index + ":a:0]aresample=48000,asetpts=PTS-STARTPTS,volume=" + musicVolume.toFixed(3) + ",afade=t=out:st=" + Math.max(0, plan.durationSeconds - 2).toFixed(3) + ":d=" + Math.min(2, plan.durationSeconds).toFixed(3) + ",apad=pad_dur=" + audioDuration + ",atrim=duration=" + audioDuration + "[music]");
  if (voice && music) filters.push("[voice][music]amix=inputs=2:duration=longest:dropout_transition=2,atrim=duration=" + audioDuration + "[aout]");
  else if (voice) filters.push("[voice]anull[aout]");
  else if (music) filters.push("[music]anull[aout]");
  args.push("-filter_complex", filters.join(";"), "-map", "[vout]");
  if (voice || music) args.push("-map", "[aout]", "-c:a", "aac", "-b:a", "192k");
  else args.push("-an");
  if (subtitleInput !== null) args.push("-map", String(subtitleInput) + ":s:0", "-c:s", "mov_text");
  args.push("-c:v", "libx264", "-preset", "veryfast", "-r", "24", "-pix_fmt", "yuv420p", "-t", audioDuration, "-metadata", "title=" + String(plan.title || "NOVA Video").slice(0, 120), "-movflags", "+faststart");
  const output = outputRelativePath || ("jobs/" + safeJobId + "/final.mp4");
  const outputPath = resolveWithinRoot(workspaceRoot, safeRelativePath(output, "output", VIDEO_EXTENSIONS));
  args.push(outputPath);
  return Object.freeze({ command: "ffmpeg", args: Object.freeze(args), outputPath, width, height, durationSeconds: plan.durationSeconds, audioIncluded: Boolean(voice || music), subtitlesIncluded: subtitleInput !== null });
}

function parseRate(value) {
  if (typeof value !== "string") return Number.NaN;
  const [n, d] = value.split("/").map(Number);
  return Number.isFinite(n) && Number.isFinite(d) && d !== 0 ? n / d : Number(value);
}

function run(command, args, cwd, timeoutMs, spawnImpl, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, { cwd, shell: false, stdio: ["ignore", capture ? "pipe" : "ignore", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => { child.kill("SIGTERM"); finish(new Error("video_assembly_timeout")); }, timeoutMs);
    child.stdout?.on("data", (chunk) => { stdout += chunk.toString("utf8"); if (stdout.length > MAX_STDOUT) { child.kill("SIGTERM"); finish(new Error("video_probe_output_too_large")); } });
    child.stderr?.on("data", (chunk) => { stderr = (stderr + chunk.toString("utf8")).slice(-4000); });
    child.once("error", (error) => finish(new Error("video_process_start_failed: " + error.message)));
    child.once("close", (code, signal) => code === 0 ? finish(null, { stdout, stderr }) : finish(new Error("video_process_failed: " + code + ":" + (signal || "none") + ":" + stderr.trim().slice(-1000))));
  });
}

async function probe(ffprobe, filePath, cwd, timeoutMs, spawnImpl) {
  const args = ["-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate,duration:format=format_name,duration", "-of", "json", filePath];
  const { stdout } = await run(ffprobe, args, cwd, timeoutMs, spawnImpl, true);
  let data;
  try { data = JSON.parse(stdout); } catch { throw new Error("invalid_ffprobe_json"); }
  const video = data.streams?.find((stream) => stream.codec_type === "video");
  if (!video || !String(data.format?.format_name || "").includes("mp4")) throw new Error("mp4_video_stream_required");
  return {
    contentType: "video/mp4", width: Number(video.width), height: Number(video.height),
    frameRate: parseRate(video.r_frame_rate), durationSeconds: Number(video.duration ?? data.format.duration),
    audioIncluded: data.streams.some((stream) => stream.codec_type === "audio"),
    subtitlesIncluded: data.streams.some((stream) => stream.codec_type === "subtitle"),
  };
}

export function createNOVAMediaAssembler(options = {}) {
  const workspaceRoot = options.workspaceRoot ? path.resolve(options.workspaceRoot) : "";
  const ffmpegBinary = options.ffmpegBinary || "ffmpeg";
  const ffprobeBinary = options.ffprobeBinary || "ffprobe";
  const executionEnabled = options.executionEnabled === true;
  const approvalGranted = options.approvalGranted === true;
  const timeoutMs = options.timeoutMs ?? 300_000;
  const spawnImpl = options.spawnImpl || spawn;
  const accessImpl = options.accessImpl || access;
  const realpathImpl = options.realpathImpl || realpath;
  const statImpl = options.statImpl || stat;
  const mkdirImpl = options.mkdirImpl || mkdir;
  const writeFileImpl = options.writeFileImpl || writeFile;
  const unlinkImpl = options.unlinkImpl || unlink;

  return Object.freeze({
    async assemble(input) {
      if (!executionEnabled) return { state: "blocked", reason: "media_assembly_disabled", executionEnabled: false };
      if (!approvalGranted) return { state: "blocked", reason: "human_approval_required", executionEnabled: false };
      if (!workspaceRoot) return { state: "blocked", reason: "media_workspace_not_configured", executionEnabled: false };
      const jobId = safeId(input?.jobId);
      const cues = input.subtitleCues ?? input.plan.scenes.filter((scene) => scene.caption).map((scene) => ({ startSeconds: scene.startSeconds, endSeconds: scene.endSeconds, text: scene.caption }));
      const srt = buildSrtSubtitles(cues, input.plan.durationSeconds);
      const subtitleRelative = srt ? "jobs/" + jobId + "/subtitles.srt" : null;
      const command = buildNOVAAssemblyCommand({ plan: input.plan, assets: input.assets, workspaceRoot, jobId, voiceoverPath: input.voiceoverPath, musicPath: input.musicPath, subtitlePath: subtitleRelative, outputRelativePath: input.outputRelativePath, musicVolume: input.musicVolume });
      let subtitlePath = null;
      let outputPath = null;
      try {
        await mkdirImpl(workspaceRoot, { recursive: true, mode: 0o700 });
        const rootReal = await realpathImpl(workspaceRoot);
        const inputPaths = command.args.filter((value, index) => value === "-i" && command.args[index + 1]).map((_, index) => null);
        const declaredInputs = command.args.reduce((list, value, index, args) => { if (value === "-i" && args[index + 1]) list.push(args[index + 1]); return list; }, []);
        for (const candidate of declaredInputs) {
          const resolved = await realpathImpl(candidate);
          if (!resolved.startsWith(rootReal + path.sep)) throw new Error("assembly_input_outside_workspace");
          await accessImpl(resolved);
        }
        const outputDir = path.dirname(command.outputPath);
        await mkdirImpl(outputDir, { recursive: true, mode: 0o700 });
        const outputDirReal = await realpathImpl(outputDir);
        if (!outputDirReal.startsWith(rootReal + path.sep)) throw new Error("assembly_output_outside_workspace");
        outputPath = path.join(outputDirReal, path.basename(command.outputPath));
        try { await accessImpl(outputPath); throw new Error("assembly_output_already_exists"); } catch (error) { if (error.message === "assembly_output_already_exists") throw error; if (error.code !== "ENOENT") throw error; }
        let actualSubtitlePath = null;
        if (subtitleRelative) {
          subtitlePath = resolveWithinRoot(rootReal, subtitleRelative);
          await mkdirImpl(path.dirname(subtitlePath), { recursive: true, mode: 0o700 });
          await writeFileImpl(subtitlePath, srt, { encoding: "utf8", mode: 0o600, flag: "wx" });
          actualSubtitlePath = subtitlePath;
        }
        const ffmpegArgs = [...command.args];
        const subtitleInputPosition = ffmpegArgs.findIndex((value, index) => value === "-i" && ffmpegArgs[index + 1] === resolveWithinRoot(workspaceRoot, subtitleRelative || ""));
        if (subtitleInputPosition >= 0 && actualSubtitlePath) ffmpegArgs[subtitleInputPosition + 1] = actualSubtitlePath;
        ffmpegArgs[ffmpegArgs.length - 1] = outputPath;
        for (const asset of input.assets) {
          const relative = safeRelativePath(asset.assetPath, "scene_asset", VIDEO_EXTENSIONS);
          const actual = await probe(ffprobeBinary, await realpathImpl(resolveWithinRoot(rootReal, relative)), rootReal, Math.min(timeoutMs, 30_000), spawnImpl);
          if (actual.width !== asset.width || actual.height !== asset.height || Math.abs(actual.frameRate - asset.frameRate) > 0.01 || Math.abs(actual.durationSeconds - asset.durationSeconds) > 0.1) throw new Error("assembly_source_metadata_mismatch:" + asset.sceneId);
        }
        await run(ffmpegBinary, ffmpegArgs, rootReal, timeoutMs, spawnImpl);
        const outputInfo = await statImpl(outputPath);
        if (!outputInfo.isFile() || outputInfo.size <= 0) throw new Error("assembly_output_missing_or_empty");
        const finalMeta = await probe(ffprobeBinary, outputPath, rootReal, Math.min(timeoutMs, 30_000), spawnImpl);
        const expected = OUTPUT_DIMENSIONS[input.plan.aspectRatio];
        if (finalMeta.width !== expected[0] || finalMeta.height !== expected[1] || Math.abs(finalMeta.frameRate - 24) > 0.01 || Math.abs(finalMeta.durationSeconds - input.plan.durationSeconds) > 0.15) throw new Error("assembly_output_metadata_mismatch");
        if (Boolean(input.voiceoverPath || input.musicPath) !== finalMeta.audioIncluded) throw new Error("assembly_output_audio_mismatch");
        if (Boolean(subtitleRelative) !== finalMeta.subtitlesIncluded) throw new Error("assembly_output_subtitle_mismatch");
        return { state: "assembled", asset: { assetPath: path.relative(rootReal, outputPath).split(path.sep).join("/"), ...finalMeta }, renderer: "ffmpeg-local", executionEnabled: true, estimatedCost: 0 };
      } catch (error) {
        if (outputPath) await unlinkImpl(outputPath).catch(() => {});
        return { state: "failed", reason: error instanceof Error ? error.message : "assembly_failed", executionEnabled: true, estimatedCost: 0 };
      } finally {
        if (subtitlePath) await unlinkImpl(subtitlePath).catch(() => {});
      }
    },
  });
}

import { spawn } from "node:child_process";
import { access, lstat, mkdir, stat, realpath } from "node:fs/promises";
import path from "node:path";
import { validateGeneratedClip } from "./generative-video.mjs";
import { resolveWithinRoot } from "./ffmpeg-renderer.mjs";

const MINIMUM_VRAM_GB = 24;
const MINIMUM_VRAM_MIB = MINIMUM_VRAM_GB * 1000;
// No resource-limited isolated process runner is implemented in this repository yet.
// Keep this immutable false so caller-supplied approval booleans cannot enable inference.
const WAN22_PROCESS_ISOLATION_IMPLEMENTED = false;
const OUTPUT_LIMIT = 128_000;

export function parseNvidiaSmiMemory(output) {
  if (typeof output !== "string" || !output.trim()) return [];
  return output.split(/\r?\n/).map((line) => {
    const match = /^\s*(\d+)\s*,\s*(\d+)\s*$/.exec(line);
    if (!match) return null;
    const totalVramMiB = Number(match[1]);
    const freeVramMiB = Number(match[2]);
    if (!Number.isSafeInteger(totalVramMiB) || !Number.isSafeInteger(freeVramMiB) || totalVramMiB <= 0 || freeVramMiB < 0 || freeVramMiB > totalVramMiB) return null;
    return { totalVramMiB, freeVramMiB };
  }).filter(Boolean);
}

function isWithinWorkspace(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

export async function ensureSafeOutputDirectory(workspaceRoot, outputDirectory, { lstatImpl, mkdirImpl, realpathImpl }) {
  if (!isWithinWorkspace(workspaceRoot, outputDirectory) || outputDirectory === workspaceRoot) {
    throw new Error("wan22_output_directory_outside_workspace");
  }

  const relative = path.relative(workspaceRoot, outputDirectory);
  let current = workspaceRoot;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    let info;
    try {
      info = await lstatImpl(current);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      try {
        // Create one component at a time. Never let recursive mkdir follow an
        // existing symlink in an untrusted job directory.
        await mkdirImpl(current, { mode: 0o700 });
      } catch (createError) {
        if (createError?.code !== "EEXIST") throw createError;
      }
      info = await lstatImpl(current);
    }

    if (info.isSymbolicLink()) throw new Error("wan22_output_directory_symlink_rejected");
    if (!info.isDirectory()) throw new Error("wan22_output_directory_not_directory");
    if (typeof info.mode === "number" && (info.mode & 0o022) !== 0) {
      throw new Error("wan22_output_directory_permissions_unsafe");
    }

    const resolved = await realpathImpl(current);
    if (!isWithinWorkspace(workspaceRoot, resolved)) {
      throw new Error("wan22_output_directory_outside_workspace");
    }
  }

  const resolvedDirectory = await realpathImpl(outputDirectory);
  if (!isWithinWorkspace(workspaceRoot, resolvedDirectory)) {
    throw new Error("wan22_output_directory_outside_workspace");
  }
  return resolvedDirectory;
}

function safeId(value, field) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value)) throw new TypeError("invalid_" + field);
  return value;
}

export function wan22FrameCount(durationSeconds) {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration < 1 || duration > 5.05) throw new RangeError("wan22_clip_duration_out_of_range");
  const frameCount = Math.max(25, Math.min(121, Math.round((duration * 24 - 1) / 4) * 4 + 1));
  return frameCount;
}

export function buildWan22Command({ task, repoRoot, checkpointDir, workspaceRoot, jobId, sceneId, pythonBinary = "python", resolvedImagePath = null }) {
  if (!task || task.modelId !== "Wan-AI/Wan2.2-TI2V-5B") throw new TypeError("wan22_task_required");
  const safeJobId = safeId(jobId, "job_id");
  const safeSceneId = safeId(sceneId, "scene_id");
  const dimensions = task.aspectRatio === "9:16" ? [704, 1280] : task.aspectRatio === "16:9" ? [1280, 704] : null;
  if (!dimensions || dimensions[0] !== task.width || dimensions[1] !== task.height) throw new TypeError("wan22_task_dimensions_invalid");
  const root = path.resolve(repoRoot);
  const ckpt = path.resolve(checkpointDir);
  const workspace = path.resolve(workspaceRoot);
  const outputRelativePath = "jobs/" + safeJobId + "/" + safeSceneId + ".mp4";
  const outputPath = resolveWithinRoot(workspace, outputRelativePath);
  const frameCount = wan22FrameCount(task.durationSeconds);
  const args = [
    "generate.py", "--task", "ti2v-5B", "--size", dimensions[0] + "*" + dimensions[1],
    "--ckpt_dir", ckpt, "--offload_model", "True", "--convert_model_dtype", "--t5_cpu",
    "--frame_num", String(frameCount), "--prompt", task.prompt, "--save_file", outputPath,
  ];
  if (task.imagePath) args.push("--image", resolvedImagePath || resolveWithinRoot(workspace, task.imagePath));
  return Object.freeze({ command: pythonBinary, args: Object.freeze(args), cwd: root, outputPath, outputRelativePath, frameCount });
}

function parseFrameRate(value) {
  if (typeof value !== "string") return Number.NaN;
  const [numerator, denominator] = value.split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return Number(value);
  return numerator / denominator;
}

function spawnProcess(command, args, options, { timeoutMs, captureStdout = false } = {}, spawnImpl = spawn) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, { ...options, shell: false, stdio: ["ignore", captureStdout ? "pipe" : "ignore", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new Error("wan22_process_timeout"));
    }, timeoutMs);
    if (captureStdout && child.stdout) child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > OUTPUT_LIMIT) { child.kill("SIGTERM"); finish(new Error("ffprobe_output_too_large")); }
    });
    if (child.stderr) child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString("utf8")).slice(-4000); });
    child.once("error", (error) => finish(new Error("wan22_process_start_failed: " + error.message)));
    child.once("close", (code, signal) => {
      if (code === 0) finish(null, { stdout, stderr });
      else finish(new Error("wan22_process_failed: exit=" + code + " signal=" + (signal || "none") + " " + stderr.trim().slice(-1000)));
    });
  });
}

async function inspectMp4(ffprobeBinary, outputPath, timeoutMs, spawnImpl = spawn) {
  const args = ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_type,width,height,r_frame_rate,duration:format=format_name,duration", "-of", "json", outputPath];
  const { stdout } = await spawnProcess(ffprobeBinary, args, { cwd: path.dirname(outputPath) }, { timeoutMs, captureStdout: true }, spawnImpl);
  let data;
  try { data = JSON.parse(stdout); } catch { throw new Error("ffprobe_invalid_json"); }
  const stream = Array.isArray(data.streams) ? data.streams.find((item) => item.codec_type === "video") : null;
  if (!stream || !data.format || !String(data.format.format_name || "").includes("mp4")) throw new Error("ffprobe_video_mp4_required");
  const durationSeconds = Number(stream.duration ?? data.format.duration);
  return {
    contentType: "video/mp4", width: Number(stream.width), height: Number(stream.height),
    frameRate: parseFrameRate(stream.r_frame_rate), durationSeconds,
  };
}

export function createWan22LocalRuntime(options = {}) {
  const repoRoot = options.repoRoot ? path.resolve(options.repoRoot) : "";
  const checkpointDir = options.checkpointDir ? path.resolve(options.checkpointDir) : "";
  const workspaceRoot = options.workspaceRoot ? path.resolve(options.workspaceRoot) : "";
  const pythonBinary = options.pythonBinary || "python";
  const ffprobeBinary = options.ffprobeBinary || "ffprobe";
  const executionEnabled = options.executionEnabled === true;
  const modelLicenseApproved = options.modelLicenseApproved === true;
  const securityReviewApproved = options.securityReviewApproved === true;
  const zeroCostComputeVerified = options.zeroCostComputeVerified === true;
  const modelRevision = options.modelRevision || "";
  const checkpointIntegrityVerified = options.checkpointIntegrityVerified === true;
  const nvidiaSmiBinary = options.nvidiaSmiBinary || "nvidia-smi";
  const hardwareProbe = options.hardwareProbe || (async () => {
    const result = await spawnProcess(nvidiaSmiBinary, ["--query-gpu=memory.total,memory.free", "--format=csv,noheader,nounits"], {}, { timeoutMs: 15_000, captureStdout: true }, spawnImpl);
    return parseNvidiaSmiMemory(result.stdout);
  });
  const generationTimeoutMs = options.generationTimeoutMs ?? 1_200_000;
  const probeTimeoutMs = options.probeTimeoutMs ?? 30_000;
  const spawnImpl = options.spawnImpl || spawn;
  const revisionVerifier = options.revisionVerifier || (async (repoPath, expectedRevision) => {
    const result = await spawnProcess("git", ["rev-parse", "HEAD"], { cwd: repoPath }, { timeoutMs: 15_000, captureStdout: true }, spawnImpl);
    return result.stdout.trim() === expectedRevision;
  });
  const accessImpl = options.accessImpl || access;
  const statImpl = options.statImpl || stat;
  const mkdirImpl = options.mkdirImpl || mkdir;
  const realpathImpl = options.realpathImpl || realpath;
  const lstatImpl = options.lstatImpl || lstat;

  async function preflight() {
    if (!executionEnabled) return { ready: false, reason: "wan22_execution_disabled" };
    if (!modelLicenseApproved) return { ready: false, reason: "model_license_review_required" };
    if (!securityReviewApproved) return { ready: false, reason: "runtime_security_review_required" };
    if (!zeroCostComputeVerified) return { ready: false, reason: "zero_cost_compute_not_verified" };
    if (!/^[a-f0-9]{40}$/i.test(modelRevision)) return { ready: false, reason: "wan22_upstream_revision_not_pinned" };
    if (!checkpointIntegrityVerified) return { ready: false, reason: "wan22_checkpoint_integrity_not_verified" };
    if (!repoRoot || !checkpointDir || !workspaceRoot) return { ready: false, reason: "wan22_local_paths_not_configured" };
    let detectedGpus;
    try { detectedGpus = await hardwareProbe(); } catch { return { ready: false, reason: "nvidia_gpu_probe_failed" }; }
    if (!Array.isArray(detectedGpus) || !detectedGpus.some((gpu) => Number.isFinite(Number(gpu?.freeVramMiB)) && Number(gpu.freeVramMiB) >= MINIMUM_VRAM_MIB)) return { ready: false, reason: "verified_24gb_vram_required", detectedGpuCount: Array.isArray(detectedGpus) ? detectedGpus.length : 0 };
    try {
      await accessImpl(path.join(repoRoot, "generate.py"));
      await accessImpl(checkpointDir);
      await mkdirImpl(workspaceRoot, { recursive: true });
      const [repoReal, checkpointReal, workspaceReal] = await Promise.all([realpathImpl(repoRoot), realpathImpl(checkpointDir), realpathImpl(workspaceRoot)]);
      const [repoInfo, checkpointInfo] = await Promise.all([statImpl(repoReal), statImpl(checkpointReal)]);
      if (!repoInfo.isDirectory() || !checkpointInfo.isDirectory()) return { ready: false, reason: "wan22_repo_or_checkpoint_not_directory" };
      const generateScript = await realpathImpl(path.join(repoReal, "generate.py"));
      if (!generateScript.startsWith(repoReal + path.sep)) return { ready: false, reason: "wan22_entrypoint_outside_pinned_repo" };
      if (!(await revisionVerifier(repoReal, modelRevision))) return { ready: false, reason: "wan22_upstream_revision_mismatch" };
      if (!WAN22_PROCESS_ISOLATION_IMPLEMENTED) {
        return {
          ready: false,
          reason: "wan22_process_isolation_not_implemented",
          minimumVramGB: MINIMUM_VRAM_GB,
          minimumFreeVramMiB: MINIMUM_VRAM_MIB,
          modelRevision,
        };
      }
      return { ready: true, repoRoot: repoReal, checkpointDir: checkpointReal, workspaceRoot: workspaceReal, generateScript, minimumVramGB: MINIMUM_VRAM_GB, minimumFreeVramMiB: MINIMUM_VRAM_MIB, modelRevision };
    } catch {
      return { ready: false, reason: "wan22_local_repo_or_checkpoint_unavailable" };
    }
  }

  return Object.freeze({
    modelId: "Wan-AI/Wan2.2-TI2V-5B",
    preflight,
    async render({ task, jobId, sceneId }) {
      const check = await preflight();
      if (!check.ready) return { state: "blocked", reason: check.reason, executionEnabled: false };
      let command;
      try {
        let resolvedImagePath = null;
        if (task.imagePath) {
          const inputPath = resolveWithinRoot(check.workspaceRoot, task.imagePath);
          const inputRealPath = await realpathImpl(inputPath);
          if (!inputRealPath.startsWith(check.workspaceRoot + path.sep)) return { state: "blocked", reason: "source_image_outside_workspace", executionEnabled: false };
          await accessImpl(inputRealPath);
          resolvedImagePath = inputRealPath;
        }
        command = buildWan22Command({ task, repoRoot: check.repoRoot, checkpointDir: check.checkpointDir, workspaceRoot: check.workspaceRoot, jobId, sceneId, pythonBinary, resolvedImagePath });
        let outputDirectoryReal;
        try {
          outputDirectoryReal = await ensureSafeOutputDirectory(check.workspaceRoot, path.dirname(command.outputPath), {
            lstatImpl, mkdirImpl, realpathImpl,
          });
        } catch (error) {
          return {
            state: "blocked",
            reason: error instanceof Error ? error.message : "wan22_output_directory_validation_failed",
            executionEnabled: false,
          };
        }
        const outputPath = path.join(outputDirectoryReal, path.basename(command.outputPath));
        if (!isWithinWorkspace(check.workspaceRoot, outputPath)) {
          return { state: "blocked", reason: "wan22_output_directory_outside_workspace", executionEnabled: false };
        }
        try { await accessImpl(outputPath); return { state: "blocked", reason: "wan22_output_already_exists", executionEnabled: false }; } catch (error) { if (error.code !== "ENOENT") throw error; }
        const safeArgs = [...command.args];
        const saveFileIndex = safeArgs.indexOf("--save_file");
        if (saveFileIndex < 0 || saveFileIndex + 1 >= safeArgs.length) throw new Error("wan22_output_argument_missing");
        safeArgs[saveFileIndex + 1] = outputPath;
        await spawnProcess(command.command, safeArgs, { cwd: command.cwd }, { timeoutMs: generationTimeoutMs, captureStdout: false }, spawnImpl);
        const outputRealPath = await realpathImpl(outputPath);
        if (!isWithinWorkspace(check.workspaceRoot, outputRealPath)) throw new Error("generated_output_outside_workspace");
        const outputStat = await statImpl(outputRealPath);
        if (!outputStat.isFile() || outputStat.size <= 0) throw new Error("wan22_output_file_missing_or_empty");
        const media = await inspectMp4(ffprobeBinary, outputRealPath, probeTimeoutMs, spawnImpl);
        const relativePath = path.relative(check.workspaceRoot, outputRealPath).split(path.sep).join("/");
        const asset = { ...validateGeneratedClip({ assetPath: relativePath, ...media }, task), bytes: outputStat.size };
        return { state: "generated", asset, executionEnabled: true, modelId: "Wan-AI/Wan2.2-TI2V-5B", costEvidence: "zero_cost_compute_verified_by_runtime_configuration" };
      } catch (error) {
        return { state: "failed", reason: error instanceof Error ? error.message : "wan22_runtime_failed", executionEnabled: true, modelId: "Wan-AI/Wan2.2-TI2V-5B" };
      }
    },
  });
}

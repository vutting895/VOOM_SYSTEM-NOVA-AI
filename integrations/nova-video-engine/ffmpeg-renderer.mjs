import { spawn } from "node:child_process";
import { access, mkdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const DIMENSIONS = Object.freeze({ "9:16": [1080, 1920], "16:9": [1920, 1080], "1:1": [1080, 1080] });

export function resolveWithinRoot(root, relativePath) {
  if (typeof relativePath !== "string" || !relativePath || relativePath.includes("\\") || relativePath.includes("\0") || path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) throw new TypeError("relative_media_path_required");
  if (relativePath.split("/").some((part) => part === "." || part === ".." || !part)) throw new TypeError("media_path_traversal_rejected");
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  const rootPrefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(rootPrefix)) throw new TypeError("media_path_outside_workspace");
  return resolvedPath;
}

function isWithinRoot(root, candidate) {
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  return candidate === root || candidate.startsWith(prefix);
}

export function buildFfmpegArgs(storyboard, workspaceRoot, outputRelativePath = "renders/video.mp4") {
  if (!storyboard || !Array.isArray(storyboard.scenes) || storyboard.scenes.length === 0) throw new TypeError("storyboard_required");
  const dimensions = DIMENSIONS[storyboard.aspectRatio];
  if (!dimensions) throw new TypeError("unsupported_aspect_ratio");
  const [width, height] = dimensions;
  const args = ["-hide_banner", "-nostdin", "-n"];
  const filters = [];
  storyboard.scenes.forEach((scene, index) => {
    if (!scene.imagePath) throw new TypeError("scene_image_required_" + (index + 1));
    if (!IMAGE_EXTENSIONS.has(path.extname(scene.imagePath).toLowerCase())) throw new TypeError("unsupported_scene_image_type");
    args.push("-loop", "1", "-framerate", String(storyboard.frameRate || 24), "-t", String(scene.durationSeconds), "-i", resolveWithinRoot(workspaceRoot, scene.imagePath));
    filters.push("[" + index + ":v]scale=" + width + ":" + height + ":force_original_aspect_ratio=decrease,pad=" + width + ":" + height + ":(ow-iw)/2:(oh-ih)/2,setsar=1,fps=" + (storyboard.frameRate || 24) + ",format=yuv420p[v" + index + "]");
  });
  const concatInputs = storyboard.scenes.map((_, index) => "[v" + index + "]").join("");
  filters.push(concatInputs + "concat=n=" + storyboard.scenes.length + ":v=1:a=0[outv]");
  const outputPath = resolveWithinRoot(workspaceRoot, outputRelativePath);
  args.push("-filter_complex", filters.join(";"), "-map", "[outv]", "-an", "-c:v", "libx264", "-preset", "veryfast", "-movflags", "+faststart", "-pix_fmt", "yuv420p", "-t", String(storyboard.durationSeconds), outputPath);
  return { args, outputPath };
}

export function createFfmpegRenderer({ workspaceRoot, binary = "ffmpeg", timeoutMs = 120_000, spawnImpl = spawn, accessImpl = access, mkdirImpl = mkdir, realpathImpl = realpath, statImpl = stat } = {}) {
  if (!workspaceRoot) throw new TypeError("workspace_root_required");
  return Object.freeze({
    async render(storyboard) {
      const rootReal = await realpathImpl(path.resolve(workspaceRoot));
      const { args, outputPath } = buildFfmpegArgs(storyboard, rootReal);
      for (const scene of storyboard.scenes) {
        const lexicalInput = resolveWithinRoot(rootReal, scene.imagePath);
        const inputReal = await realpathImpl(lexicalInput);
        if (!isWithinRoot(rootReal, inputReal)) throw new Error("media_input_symlink_outside_workspace");
        await accessImpl(inputReal);
        const inputFlag = args.findIndex((value, index) => value === "-i" && args[index + 1] === lexicalInput);
        if (inputFlag < 0) throw new Error("ffmpeg_scene_input_not_found");
        args[inputFlag + 1] = inputReal;
      }
      const outputDirectory = path.dirname(outputPath);
      await mkdirImpl(outputDirectory, { recursive: true, mode: 0o700 });
      const outputDirectoryReal = await realpathImpl(outputDirectory);
      if (!isWithinRoot(rootReal, outputDirectoryReal)) throw new Error("media_output_symlink_outside_workspace");
      const finalOutputPath = path.join(outputDirectoryReal, path.basename(outputPath));
      try {
        await accessImpl(finalOutputPath);
        throw new Error("ffmpeg_output_already_exists");
      } catch (error) {
        if (error?.message === "ffmpeg_output_already_exists") throw error;
        if (error?.code !== "ENOENT") throw error;
      }
      args[args.length - 1] = finalOutputPath;
      await new Promise((resolve, reject) => {
        const child = spawnImpl(binary, args, { cwd: rootReal, shell: false, stdio: ["ignore", "ignore", "pipe"] });
        let stderr = "";
        let settled = false;
        const finish = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          error ? reject(error) : resolve();
        };
        const timer = setTimeout(() => { child.kill("SIGKILL"); finish(new Error("ffmpeg_timeout")); }, timeoutMs);
        child.stderr?.setEncoding?.("utf8");
        child.stderr?.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4000); });
        child.once("error", (error) => finish(new Error("ffmpeg_start_failed: " + error.message)));
        child.once("close", (code) => code === 0 ? finish() : finish(new Error("ffmpeg_exit_" + code + ": " + stderr.trim().slice(-1000))));
      });
      const outputInfo = await statImpl(finalOutputPath);
      if (!outputInfo.isFile() || outputInfo.size <= 0) throw new Error("ffmpeg_output_missing_or_empty");
      return { outputPath: path.relative(rootReal, finalOutputPath).split(path.sep).join("/"), bytes: outputInfo.size, contentType: "video/mp4", format: "mp4", renderer: "ffmpeg", audioIncluded: false };
    },
  });
}

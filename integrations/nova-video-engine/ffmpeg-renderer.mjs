import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const DIMENSIONS = Object.freeze({ "9:16": [1080, 1920], "16:9": [1920, 1080], "1:1": [1080, 1080] });

export function resolveWithinRoot(root, relativePath) {
  if (typeof relativePath !== "string" || !relativePath || path.isAbsolute(relativePath)) throw new TypeError("relative_media_path_required");
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(resolvedRoot + path.sep)) throw new TypeError("media_path_outside_workspace");
  return resolvedPath;
}

export function buildFfmpegArgs(storyboard, workspaceRoot, outputRelativePath = "renders/video.mp4") {
  if (!storyboard || !Array.isArray(storyboard.scenes) || storyboard.scenes.length === 0) throw new TypeError("storyboard_required");
  const dimensions = DIMENSIONS[storyboard.aspectRatio];
  if (!dimensions) throw new TypeError("unsupported_aspect_ratio");
  const [width, height] = dimensions;
  const args = ["-hide_banner", "-nostdin", "-y"];
  const filters = [];
  storyboard.scenes.forEach((scene, index) => {
    if (!scene.imagePath) throw new TypeError(\`scene_image_required_\${index + 1}\`);
    if (!IMAGE_EXTENSIONS.has(path.extname(scene.imagePath).toLowerCase())) throw new TypeError("unsupported_scene_image_type");
    args.push("-loop", "1", "-framerate", String(storyboard.frameRate || 24), "-t", String(scene.durationSeconds), "-i",
      resolveWithinRoot(workspaceRoot, scene.imagePath));
    filters.push(\`[\${index}:v]scale=\${width}:\${height}:force_original_aspect_ratio=decrease,pad=\${width}:\${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=\${storyboard.frameRate || 24},format=yuv420p[v\${index}]\`);
  });
  const concatInputs = storyboard.scenes.map((_, index) => \`[v\${index}]\`).join("");
  filters.push(\`\${concatInputs}concat=n=\${storyboard.scenes.length}:v=1:a=0[outv]\`);
  const outputPath = resolveWithinRoot(workspaceRoot, outputRelativePath);
  args.push("-filter_complex", filters.join(";"), "-map", "[outv]", "-an", "-c:v", "libx264",
    "-preset", "veryfast", "-movflags", "+faststart", "-pix_fmt", "yuv420p",
    "-t", String(storyboard.durationSeconds), outputPath);
  return { args, outputPath };
}

export function createFfmpegRenderer({ workspaceRoot, binary = "ffmpeg", timeoutMs = 120_000 }) {
  if (!workspaceRoot) throw new TypeError("workspace_root_required");
  return Object.freeze({
    async render(storyboard) {
      const { args, outputPath } = buildFfmpegArgs(storyboard, workspaceRoot);
      for (const scene of storyboard.scenes) await access(resolveWithinRoot(workspaceRoot, scene.imagePath));
      await new Promise((resolve, reject) => {
        const child = spawn(binary, args, { cwd: path.resolve(workspaceRoot), stdio: ["ignore", "ignore", "pipe"] });
        let stderr = "";
        const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4000); });
        child.once("error", (error) => { clearTimeout(timer); reject(new Error(\`ffmpeg_start_failed: \${error.message}\`)); });
        child.once("close", (code) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else reject(new Error(\`ffmpeg_exit_\${code}: \${stderr.trim().slice(-1000)}\`));
        });
      });
      return { outputPath, format: "mp4", renderer: "ffmpeg", audioIncluded: false };
    },
  });
}

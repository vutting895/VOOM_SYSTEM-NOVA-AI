export const VIDEO_SKILL_REGISTRY_VERSION = "1.0.0";

const groups = [
  {
    id: "generation",
    name: "Video Generation",
    skills: [
      ["text_to_video","Text-to-Video","Generate video from a text prompt and shot brief.",["Wan 2.2 TI2V-5B","LTX-Video","CogVideoX","ComfyUI"],"gpu","blocked_no_free_compute","video_generation"],
      ["image_to_video","Image-to-Video","Animate an approved still image into a video.",["Wan 2.2 TI2V-5B","LTX-Video","CogVideoX","ComfyUI"],"gpu","blocked_no_free_compute","video_generation"],
      ["video_to_video","Video-to-Video","Transform an input clip while preserving selected content or motion.",["ComfyUI","Wan 2.2","LTX-Video"],"gpu","blocked_no_free_compute","video_generation"],
      ["storyboard_generation","Storyboard Generation","Turn a brief into ordered scenes, shot descriptions and prompts; no video rendering.",["NOVA deterministic planner","approved open text model"],"cpu_or_external_model","research","video_planning"],
    ],
  },
  {
    id: "analysis",
    name: "Video Analysis",
    skills: [
      ["scene_detection","Scene Detection","Detect shot boundaries and scene segments.",["PySceneDetect","FFmpeg"],"cpu","research","video_analysis"],
      ["object_detection","Object Detection","Detect and label objects in sampled frames.",["OpenCV","Qwen2.5-VL"],"cpu_or_gpu","blocked_license_review","video_analysis"],
      ["action_recognition","Action Recognition","Classify actions and temporal events across frames.",["Qwen2.5-VL","OpenCV-based pipeline"],"gpu_preferred","blocked_license_review","video_analysis"],
      ["ocr","OCR","Extract visible text from sampled frames.",["PaddleOCR"],"cpu","research","video_analysis"],
      ["speech_to_text","Speech-to-Text","Transcribe speech and produce timestamps.",["Whisper"],"cpu_or_gpu","blocked_license_review","video_analysis"],
      ["subtitles","Subtitle and Caption Generation","Generate timed captions from approved transcription.",["Whisper","FFmpeg"],"cpu","research","video_analysis"],
      ["video_summary","Video Summarization","Produce a concise, timestamp-grounded summary of a clip.",["Qwen2.5-VL","approved open text model"],"gpu_preferred","blocked_license_review","video_analysis"],
      ["video_qa","Video Q&A","Answer questions using evidence from sampled frames, transcript and timestamps.",["Qwen2.5-VL"],"gpu_preferred","blocked_license_review","video_analysis"],
    ],
  },
  {
    id: "editing",
    name: "Video Editing",
    skills: [
      ["auto_cut","Auto Cut and Transcoding","Trim, concatenate and transcode clips with validated FFmpeg operations.",["FFmpeg"],"cpu","research","video_edit_export"],
      ["smart_highlight","Smart Highlight","Select important segments using scene, speech and action signals.",["PySceneDetect","Whisper","approved vision model","FFmpeg"],"cpu_or_gpu","planned","video_edit_export"],
      ["audio_video_sync","Audio and Video Sync","Align audio tracks, voice-over and video timelines.",["FFmpeg"],"cpu","research","video_edit_export"],
      ["background_removal","Background Removal","Segment foreground subjects and remove or replace backgrounds.",["OpenCV","approved segmentation model"],"gpu_preferred","blocked_license_review","video_edit_export"],
      ["resolution_enhancement","Resolution Enhancement","Upscale frames and validate the resulting video.",["approved open video super-resolution model","FFmpeg"],"gpu","blocked_no_free_compute","video_edit_export"],
      ["export_validation","Export and Quality Validation","Validate container, codecs, duration, frame rate, resolution and audio streams.",["FFmpeg","ffprobe"],"cpu","research","video_edit_export"],
    ],
  },
  {
    id: "production",
    name: "Video Production",
    skills: [
      ["script_to_video","Script-to-Video Planning","Convert a script into scenes, shot list, narration and generation prompts; does not render video.",["NOVA deterministic planner","approved open text model"],"cpu_or_external_model","research","video_planning"],
      ["voiceover","Voice-over Generation","Generate narration audio from approved text and licensed voices.",["Piper"],"cpu","blocked_license_review","video_audio"],
      ["multilingual_subtitles","Multilingual Subtitles","Create translated subtitle tracks after transcription and translation quality checks.",["Whisper","approved open translation model","FFmpeg"],"cpu_or_gpu","planned","video_analysis"],
      ["social_formatting","Social Platform Formatting","Reframe and export approved clips to target aspect ratios and dimensions.",["FFmpeg","OpenCV"],"cpu","research","video_edit_export"],
    ],
  },
];

const statuses = ["planned","research","blocked_no_free_compute","blocked_license_review","blocked_runtime","implemented_metadata_only","staging_verified","production_enabled"];

export function getVideoSkillRegistry() {
  const skillGroups = groups.map((group) => ({
    id: group.id,
    name: group.name,
    skills: group.skills.map(([id,name,description,candidateEngines,computeLane,status,apiTaskType]) => ({
      id, name, description, candidateEngines, computeLane, status, apiTaskType,
      executionEnabled: false,
      estimatedCost: 0,
    })),
  }));
  return {
    schemaVersion: "1.0",
    registryVersion: VIDEO_SKILL_REGISTRY_VERSION,
    product: "NOVA AI Video Platform",
    deliveryModel: "api_only",
    policy: {
      costMode: "free_only",
      paidApiAllowed: false,
      paidGpuAllowed: false,
      trialCreditsQualifyAsFree: false,
      executionEnabled: false,
      productionActivationRequiresExplicitApproval: true,
    },
    statusVocabulary: statuses,
    skillCount: skillGroups.reduce((count, group) => count + group.skills.length, 0),
    skillGroups,
  };
}

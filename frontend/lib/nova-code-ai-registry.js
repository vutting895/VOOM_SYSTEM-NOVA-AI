export const NOVA_CODE_AI_REGISTRY_VERSION = "1.0.0";

const agents = [
  { id: "code_generator", name: "Code Generator", description: "Generate code changes, modules, tests and documentation from a validated task brief.", capabilities: ["implementation", "refactoring", "documentation"], inputSchema: "code_task.v1", requiredApprovals: ["repository_scope", "write_scope"], status: "blocked_runtime" },
  { id: "code_reviewer", name: "Code Reviewer", description: "Review diffs for correctness, maintainability, regressions and contract compatibility.", capabilities: ["diff_review", "architecture_review", "regression_review"], inputSchema: "review_task.v1", requiredApprovals: ["repository_read_access"], status: "blocked_runtime" },
  { id: "debugging_agent", name: "Debugging Agent", description: "Triage errors, trace likely causes and propose minimal, evidence-backed fixes.", capabilities: ["error_triage", "root_cause_analysis", "fix_proposal"], inputSchema: "debug_task.v1", requiredApprovals: ["repository_read_access"], status: "blocked_runtime" },
  { id: "testing_agent", name: "Testing Agent", description: "Design and run bounded unit, integration and regression tests in an isolated runtime.", capabilities: ["test_design", "test_execution", "coverage_review"], inputSchema: "test_task.v1", requiredApprovals: ["test_runtime"], status: "blocked_runtime" },
  { id: "security_agent", name: "Security Agent", description: "Inspect auth, authorization, tenant isolation, secrets, dependencies and risky code paths.", capabilities: ["static_security_review", "threat_model", "dependency_review"], inputSchema: "security_task.v1", requiredApprovals: ["repository_read_access"], status: "blocked_runtime" },
  { id: "devops_agent", name: "DevOps Agent", description: "Inspect CI/CD, build configuration, deployment readiness, health checks and rollback plans.", capabilities: ["ci_review", "build_diagnostics", "deployment_readiness"], inputSchema: "devops_task.v1", requiredApprovals: ["deployment_read_access"], status: "blocked_runtime" },
];

export function getNovaCodeAgents() {
  return {
    schemaVersion: "1.0",
    registryVersion: NOVA_CODE_AI_REGISTRY_VERSION,
    product: "NOVA CODE AI",
    agents: agents.map((agent) => ({
      ...agent,
      executionEnabled: false,
      estimatedCost: 0,
      mode: "metadata_only",
    })),
    agentCount: agents.length,
    policy: {
      costMode: "free_only",
      paidApiAllowed: false,
      paidGpuAllowed: false,
      trialCreditsQualifyAsFree: false,
      arbitraryShellExecution: false,
      automaticProductionDeployment: false,
      repositoryWritesRequireApproval: true,
      executionEnabled: false,
    },
  };
}

const video = [
  ["text_to_video","Text-to-Video","Generate video from a text prompt.","gpu","blocked_no_free_compute"],
  ["image_to_video","Image-to-Video","Animate an approved still image.","gpu","blocked_no_free_compute"],
  ["video_to_video","Video-to-Video","Transform an input clip.","gpu","blocked_no_free_compute"],
  ["storyboard_generation","Storyboard Generation","Create scenes, shot descriptions and prompts.","cpu_or_external_model","research"],
  ["scene_detection","Scene Detection","Detect shot boundaries and scene segments.","cpu","research"],
  ["object_detection","Object Detection","Detect and label objects in sampled frames.","cpu_or_gpu","blocked_license_review"],
  ["action_recognition","Action Recognition","Classify actions and temporal events.","gpu_preferred","blocked_license_review"],
  ["ocr","Video OCR","Extract visible text from sampled frames.","cpu","research"],
  ["speech_to_text","Speech-to-Text","Transcribe speech with timestamps.","cpu_or_gpu","blocked_license_review"],
  ["subtitles","Subtitle Generation","Generate timed captions from approved transcription.","cpu","research"],
  ["video_summary","Video Summarization","Create timestamp-grounded clip summaries.","gpu_preferred","blocked_license_review"],
  ["video_qa","Video Q&A","Answer questions using frame and transcript evidence.","gpu_preferred","blocked_license_review"],
  ["auto_cut","Auto Cut and Transcoding","Trim and transcode validated clips.","cpu","research"],
  ["smart_highlight","Smart Highlight","Select important segments from media signals.","cpu_or_gpu","planned"],
  ["audio_video_sync","Audio/Video Sync","Align audio tracks and video timelines.","cpu","research"],
  ["background_removal","Background Removal","Segment foreground and remove backgrounds.","gpu_preferred","blocked_license_review"],
  ["resolution_enhancement","Resolution Enhancement","Upscale frames and validate output.","gpu","blocked_no_free_compute"],
  ["export_validation","Export Validation","Validate codecs, duration, frame rate and streams.","cpu","research"],
  ["script_to_video","Script-to-Video Planning","Convert scripts into scenes and shot lists.","cpu","research"],
  ["voiceover","Voice-over Generation","Generate narration with licensed voices.","cpu","blocked_license_review"],
  ["multilingual_subtitles","Multilingual Subtitles","Create translated subtitle tracks.","cpu_or_gpu","planned"],
  ["social_formatting","Social Platform Formatting","Reframe clips to platform aspect ratios.","cpu","research"],
];

const affiliate = [
  ["affiliate_link_management","Affiliate Link Management","Create and validate affiliate tracking links."],
  ["campaign_management","Affiliate Campaign Management","Manage campaigns, creatives and attribution windows."],
  ["click_attribution","Click Attribution","Attribute clicks to approved campaigns and partners."],
  ["conversion_tracking","Conversion Tracking","Record and reconcile attributed conversions."],
  ["commission_calculation","Commission Calculation","Calculate commissions from approved rule sets."],
  ["partner_ranking","Partner Ranking","Rank partners using explainable performance metrics."],
  ["payout_reconciliation","Payout Reconciliation","Reconcile approved commission and payout records."],
  ["affiliate_compliance","Affiliate Compliance Review","Check disclosures, prohibited claims and policy rules."],
];

const api = [
  ["api_design","API Design","Design resource-oriented APIs and stable contracts."],
  ["openapi_generation","OpenAPI Generation","Generate and validate OpenAPI specifications."],
  ["api_authentication","API Authentication","Design bearer-token and OAuth authentication flows."],
  ["cors_policy","CORS Policy","Define exact-origin CORS and preflight behavior."],
  ["rate_limit_design","Rate Limit Design","Specify per-tenant quotas and abuse controls."],
  ["integration_adapter","Integration Adapter","Build typed adapters for approved external APIs."],
  ["webhook_management","Webhook Management","Validate signatures, replay windows and delivery retries."],
  ["api_observability","API Observability","Define request IDs, sanitized logs and health contracts."],
];

const social = [
  ["content_planning","Social Content Planning","Create channel-specific content plans."],
  ["post_generation","Social Post Generation","Draft posts from approved briefs and brand rules."],
  ["caption_hashtag","Caption and Hashtag","Generate captions and relevant hashtag sets."],
  ["content_calendar","Content Calendar","Schedule content concepts and publishing windows."],
  ["platform_adaptation","Platform Adaptation","Adapt copy and media specs per social platform."],
  ["creative_brief","Creative Brief","Prepare briefs for image and video assets."],
  ["moderation_review","Social Content Moderation","Review content for policy and brand safety."],
  ["social_analytics","Social Analytics","Summarize reach, engagement and conversion metrics."],
];

function group(id, name, entries, computeLane = "cpu") {
  return {
    id, name,
    skills: entries.map((entry) => ({
      id: entry[0],
      name: entry[1],
      description: entry[2],
      computeLane: entry[3] || computeLane,
      status: entry[4] || "research",
      executionEnabled: false,
      estimatedCost: 0,
    })),
  };
}

export function getNovaCodeSkillRegistry() {
  const groups = [
    group("video", "Video Skills", video),
    group("affiliate", "Affiliate Skills", affiliate),
    group("api", "API Skills", api),
    group("social_media", "Social Media Skills", social),
  ];
  return {
    schemaVersion: "1.0",
    registryVersion: NOVA_CODE_AI_REGISTRY_VERSION,
    product: "NOVA CODE AI",
    policy: {
      costMode: "free_only",
      paidApiAllowed: false,
      paidGpuAllowed: false,
      trialCreditsQualifyAsFree: false,
      executionEnabled: false,
      productionActivationRequiresExplicitApproval: true,
    },
    skillCount: groups.reduce((total, item) => total + item.skills.length, 0),
    groups,
  };
}

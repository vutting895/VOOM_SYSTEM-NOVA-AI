const SKILLS = Object.freeze([
  {
    id: "market_data_readonly",
    name: "Market Data Research",
    domain: "market_data",
    description: "Discover and inspect bounded public or owner-authorized market data with source and freshness metadata.",
    capabilities: ["ohlcv_read", "quote_read", "data_freshness", "source_provenance"],
    status: "catalog_only",
    executionEnabled: false,
    safetyMode: "read_only",
    requiresHumanReview: true
  },
  {
    id: "technical_analysis_smc",
    name: "Technical Analysis and SMC",
    domain: "trading_research",
    description: "Analyze indicators and confirmed market structure such as BOS, CHoCH, FVG and Order Blocks without creating executable orders.",
    capabilities: ["ema_rsi", "confirmed_swings", "bos_choch", "fvg", "order_block"],
    status: "catalog_only",
    executionEnabled: false,
    safetyMode: "research_only",
    requiresHumanReview: true
  },
  {
    id: "quant_walk_forward",
    name: "Quantitative and Walk-Forward Research",
    domain: "trading_research",
    description: "Design chronological validation, purged walk-forward evaluation, baselines, cost sensitivity and robustness checks.",
    capabilities: ["walk_forward", "purged_validation", "baseline_comparison", "cost_modeling", "regime_analysis"],
    status: "catalog_only",
    executionEnabled: false,
    safetyMode: "research_only",
    requiresHumanReview: true
  },
  {
    id: "neural_model_research",
    name: "Neural Network Model Research",
    domain: "trading_research",
    description: "Manage XGBoost and PyTorch LSTM research candidates with train-only preprocessing, provenance and untouched final OOS partitions.",
    capabilities: ["xgboost_research", "pytorch_lstm_research", "feature_provenance", "calibration_review", "final_oos_guard"],
    status: "catalog_only",
    executionEnabled: false,
    safetyMode: "research_only",
    requiresHumanReview: true
  },
  {
    id: "code_generation",
    name: "Code Generation",
    domain: "engineering",
    description: "Propose scoped implementation changes, tests and documentation on an isolated feature branch.",
    capabilities: ["implementation_plan", "scoped_patch", "documentation"],
    status: "catalog_only",
    executionEnabled: false,
    safetyMode: "branch_and_pr_only",
    requiresHumanReview: true
  },
  {
    id: "code_review_debug",
    name: "Code Review and Debugging",
    domain: "engineering",
    description: "Inspect diffs, diagnose defects and recommend minimal fixes with reproducible evidence.",
    capabilities: ["diff_review", "root_cause_analysis", "regression_analysis"],
    status: "catalog_only",
    executionEnabled: false,
    safetyMode: "read_only",
    requiresHumanReview: true
  },
  {
    id: "security_tenant_isolation",
    name: "Security and Tenant Isolation",
    domain: "security",
    description: "Review authentication, authorization, tenant ownership, CORS, secret boundaries and fail-closed behavior.",
    capabilities: ["authn_authz_review", "tenant_isolation", "cors_review", "secret_leak_review", "fail_closed_tests"],
    status: "catalog_only",
    executionEnabled: false,
    safetyMode: "read_only",
    requiresHumanReview: true
  },
  {
    id: "api_mcp_integration",
    name: "API and MCP Integration",
    domain: "platform",
    description: "Design typed, allowlisted API and MCP contracts with bounded read-only tools and protocol conformance tests.",
    capabilities: ["api_contracts", "mcp_tools", "schema_validation", "protocol_tests"],
    status: "catalog_only",
    executionEnabled: false,
    safetyMode: "allowlisted_tools_only",
    requiresHumanReview: true
  },
  {
    id: "frontend_generative_ui",
    name: "Frontend and Generative UI",
    domain: "frontend",
    description: "Build intent-driven workspaces using a fixed, validated component catalog; never render model-supplied executable markup.",
    capabilities: ["intent_routing", "fixed_component_catalog", "accessible_dashboard", "streaming_ui"],
    status: "catalog_only",
    executionEnabled: false,
    safetyMode: "validated_ui_schema_only",
    requiresHumanReview: true
  },
  {
    id: "cloudflare_devops",
    name: "Cloudflare and DevOps",
    domain: "operations",
    description: "Review Worker configuration, deployment workflows, observability and exact-commit release evidence.",
    capabilities: ["worker_best_practices", "ci_review", "deployment_evidence", "observability"],
    status: "catalog_only",
    executionEnabled: false,
    safetyMode: "no_production_mutation",
    requiresHumanReview: true
  },
  {
    id: "supabase_data_security",
    name: "Supabase and Data Security",
    domain: "security",
    description: "Review Supabase Auth, RLS, schema exposure and owner-scoped data access without changing hosted data.",
    capabilities: ["supabase_auth", "rls_review", "schema_grants", "owner_scoped_reads"],
    status: "catalog_only",
    executionEnabled: false,
    safetyMode: "read_only",
    requiresHumanReview: true
  }
]);

const DOMAINS = new Set(SKILLS.map((skill) => skill.domain));

function publicSkill(skill) {
  return {
    ...skill,
    capabilities: [...skill.capabilities]
  };
}

export function listNovaSkills(domain) {
  if (domain !== undefined && (typeof domain !== "string" || !DOMAINS.has(domain))) {
    throw new Error("nova_skill_domain_invalid");
  }
  const selected = domain ? SKILLS.filter((skill) => skill.domain === domain) : SKILLS;
  return {
    registryVersion: "1.0.0",
    count: selected.length,
    skills: selected.map(publicSkill),
    policy: {
      executionEnabled: false,
      mode: "catalog-only",
      note: "Catalog metadata does not grant runtime, repository, provider, or trading permissions."
    }
  };
}

export function getNovaSkill(skillId) {
  if (typeof skillId !== "string" || !/^[a-z0-9_]{3,64}$/.test(skillId)) {
    throw new Error("nova_skill_id_invalid");
  }
  const skill = SKILLS.find((item) => item.id === skillId);
  if (!skill) throw new Error("nova_skill_not_found");
  return publicSkill(skill);
}

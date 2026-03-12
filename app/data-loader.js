import { appState } from "./state.js";

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Failed to load ${path}: ${res.status}`);
  }
  return res.json();
}

export async function loadLibraryData() {
  const [
    policies,
    claimRequirements,
    claimTypes,
    claimPortalSchema,
    claimErrorRules,
    coverageGuide
  ] = await Promise.all([
    loadJson("./warranty_library/2026_hyundai_warranty_policies.json"),
    loadJson("./warranty_library/claimRequirements.json"),
    loadJson("./warranty_library/claimTypes.json"),
    loadJson("./warranty_library/claimPortalSchema.json"),
    loadJson("./warranty_library/claimErrorRules.json"),
    loadJson("./warranty_library/coverageGuide.json")
  ]);

  appState.policies = Array.isArray(policies) ? policies : [];
  appState.claimRequirements = claimRequirements?.warranty_claim_submission_requirements || null;
  appState.claimTypes = claimTypes?.claim_types || [];
  appState.claimPortalSchema = claimPortalSchema?.claim_portal_schema || {};
  appState.claimErrorRules = claimErrorRules?.claim_error_rules || [];
  appState.coverageGuide = coverageGuide || null;
  appState.filteredPolicies = appState.policies;
}

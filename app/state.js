export const APP_MODES = {
  POLICY: "policy",
  CHECKLIST: "checklist",
  CLAIM_TYPES: "claim_types",
  ENTRY_MAP: "entry_map",
  VALIDATOR: "validator",
  ERROR_FIX: "error_fix",
  COVERAGE: "coverage",
};

export const appState = {
  mode: APP_MODES.POLICY,

  selectedSectionId: null,
  selectedClaimType: "warranty",
  selectedChecklistGroup: null,
  selectedPortalSection: null,
  selectedErrorCode: null,

  searchTerm: "",

  policies: [],
  claimRequirements: null,
  claimTypes: [],
  claimPortalSchema: null,
  claimErrorRules: [],
  coverageGuide: null,

  filteredPolicies: [],

  claimDraft: {
    basic_information: {},
    op_code_information: [],
    part_information: [],
    attachments: [],
    details: {},
    summary: {}
  },

  validatorResults: [],
  uploadedClaimText: "",
  uploadedClaimMeta: null,
};

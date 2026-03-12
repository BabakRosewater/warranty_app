import { APP_MODES, appState } from "./state.js";
import { renderChecklistMode } from "./render/render-checklist.js";
import { renderClaimTypesMode } from "./render/render-claim-types.js";

function renderPlaceholder(title, message) {
  const left = document.getElementById("leftPanel");
  const center = document.getElementById("centerPanel");
  const right = document.getElementById("rightPanel");

  left.innerHTML = `
    <div class="p-4">
      <div class="text-xs font-bold uppercase tracking-wider text-slate-500">Navigation</div>
      <div class="mt-3 text-sm text-slate-700">${title}</div>
    </div>
  `;

  center.innerHTML = `
    <div class="p-6">
      <h2 class="text-xl font-bold text-slate-900">${title}</h2>
      <p class="mt-2 text-sm text-slate-600">${message}</p>
    </div>
  `;

  right.innerHTML = `
    <div class="p-4">
      <div class="text-xs font-bold uppercase tracking-wider text-slate-500">Assistant</div>
      <p class="mt-3 text-sm text-slate-600">Mode-aware assistant panel can be connected here.</p>
    </div>
  `;
}

export function setMode(mode) {
  appState.mode = mode;
  renderApp();
  syncWorkspaceTabs();
}

export function syncWorkspaceTabs() {
  document.querySelectorAll("[data-workspace-mode]").forEach((btn) => {
    const active = btn.dataset.workspaceMode === appState.mode;
    btn.classList.toggle("bg-blue-600", active);
    btn.classList.toggle("text-white", active);
    btn.classList.toggle("border-blue-600", active);
    btn.classList.toggle("bg-white", !active);
    btn.classList.toggle("text-slate-700", !active);
  });
}

export function renderApp() {
  switch (appState.mode) {
    case APP_MODES.CHECKLIST:
      renderChecklistMode();
      break;
    case APP_MODES.CLAIM_TYPES:
      renderClaimTypesMode();
      break;
    case APP_MODES.ENTRY_MAP:
      renderPlaceholder("Claim Entry Map", "Next mode to wire: claimPortalSchema.json driven field browser.");
      break;
    case APP_MODES.VALIDATOR:
      renderPlaceholder("Validator", "Next mode to wire: claimRequirements.json + claimPortalSchema.json validation.");
      break;
    case APP_MODES.ERROR_FIX:
      renderPlaceholder("Error Fix", "Next mode to wire: claimErrorRules.json driven error assistant.");
      break;
    case APP_MODES.COVERAGE:
      renderPlaceholder("Coverage Guide", "Next mode to wire: coverageGuide.json lookup.");
      break;
    case APP_MODES.POLICY:
    default:
      renderPlaceholder("Policy Library", "Keep your current policy browser here until we patch it into this router.");
      break;
  }
}

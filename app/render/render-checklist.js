import { appState } from "../state.js";

const CHECKLIST_GROUPS = [
  ["repair_order_required_fields", "Repair Order Required Fields"],
  ["repair_order_supporting_requirements", "Repair Order Supporting Requirements"],
  ["digital_attachments_required", "Digital Attachments Required"],
  ["digital_attachment_standards", "Digital Attachment Standards"],
  ["campaign_or_recall_minimums", "Campaign / Recall Minimums"],
  ["audit_support_documents", "Audit Support Documents"],
  ["minimum_submission_checklist", "Minimum Submission Checklist"],
];

function renderList(title, items) {
  if (!items?.length) {
    return `
      <div class="rounded-xl border border-slate-200 bg-white p-4">
        <div class="font-semibold text-slate-900">${title}</div>
        <div class="mt-2 text-sm text-slate-500">No items.</div>
      </div>
    `;
  }

  return `
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="font-semibold text-slate-900">${title}</div>
      <ul class="mt-3 space-y-2">
        ${items.map((item, i) => `
          <li class="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input type="checkbox" class="mt-1 h-4 w-4 rounded border-slate-300">
            <span>${item}</span>
          </li>
        `).join("")}
      </ul>
    </div>
  `;
}

function renderSpecialRequirements(special) {
  if (!special) return "";

  return `
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="font-semibold text-slate-900">Special Requirements</div>
      <div class="mt-4 space-y-4">
        ${Object.entries(special).map(([key, items]) => `
          <div>
            <div class="text-sm font-semibold text-slate-800">${key.replaceAll("_", " ")}</div>
            <ul class="mt-2 space-y-2">
              ${(items || []).map(item => `
                <li class="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">${item}</li>
              `).join("")}
            </ul>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

export function renderChecklistMode() {
  const left = document.getElementById("leftPanel");
  const center = document.getElementById("centerPanel");
  const right = document.getElementById("rightPanel");

  const checklist = appState.claimRequirements;

  left.innerHTML = `
    <div class="p-4">
      <div class="text-xs font-bold uppercase tracking-wider text-slate-500">Checklist Groups</div>
      <div class="mt-3 space-y-2">
        ${CHECKLIST_GROUPS.map(([key, label]) => `
          <button
            class="w-full rounded-lg border px-3 py-2 text-left text-sm ${appState.selectedChecklistGroup === key ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700"}"
            data-checklist-group="${key}"
          >
            ${label}
          </button>
        `).join("")}
        <button
          class="w-full rounded-lg border px-3 py-2 text-left text-sm ${appState.selectedChecklistGroup === "special_requirements" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700"}"
          data-checklist-group="special_requirements"
        >
          Special Requirements
        </button>
      </div>
    </div>
  `;

  const selectedKey = appState.selectedChecklistGroup || "minimum_submission_checklist";

  let mainHtml = "";
  if (selectedKey === "special_requirements") {
    mainHtml = renderSpecialRequirements(checklist?.special_requirements);
  } else {
    const selectedLabel = CHECKLIST_GROUPS.find(([k]) => k === selectedKey)?.[1] || "Checklist";
    mainHtml = renderList(selectedLabel, checklist?.[selectedKey] || []);
  }

  center.innerHTML = `<div class="p-6">${mainHtml}</div>`;

  const totalChecklistItems =
    CHECKLIST_GROUPS.reduce((sum, [key]) => sum + (checklist?.[key]?.length || 0), 0) +
    Object.values(checklist?.special_requirements || {}).reduce((sum, arr) => sum + (arr?.length || 0), 0);

  right.innerHTML = `
    <div class="p-4">
      <div class="text-xs font-bold uppercase tracking-wider text-slate-500">Checklist Summary</div>
      <div class="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <div class="text-sm text-slate-500">Source Sections</div>
        <div class="mt-1 text-sm font-semibold text-slate-900">${(checklist?.source_sections || []).join(", ")}</div>
      </div>
      <div class="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <div class="text-sm text-slate-500">Total Checklist Items</div>
        <div class="mt-1 text-2xl font-bold text-slate-900">${totalChecklistItems}</div>
      </div>
      <div class="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <div class="text-sm font-semibold text-slate-900">Use Case</div>
        <p class="mt-2 text-sm text-slate-600">Use this mode to review what must exist before submitting a Hyundai claim and what must be retained for audit support.</p>
      </div>
    </div>
  `;

  left.querySelectorAll("[data-checklist-group]").forEach((btn) => {
    btn.addEventListener("click", () => {
      appState.selectedChecklistGroup = btn.dataset.checklistGroup;
      renderChecklistMode();
    });
  });
}

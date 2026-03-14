
    const APP_MODES = {
      POLICY: "policy",
      CHECKLIST: "checklist",
      CLAIM_TYPES: "claim_types",
      ENTRY_MAP: "entry_map",
      VALIDATOR: "validator",
      ERROR_FIX: "error_fix",
      CLAIM_AUDIT: "claim_audit",
      COVERAGE: "coverage"
    };

    const state = {
      mode: APP_MODES.POLICY,
      compactView: "left",
      manualLoaded: false,
      sending: false,
      loadingLibraries: false,
      searchTerm: "",
      toastTimer: null,
      selectedSectionId: null,
      selectedClaimType: "warranty",
      selectedChecklistGroup: "minimum_submission_checklist",
      selectedPortalSection: "basic_information",
      selectedErrorCode: null,
      selectedCoverageCategory: null,
      policies: [],
      claimRequirements: null,
      claimTypes: [],
      claimPortalSchema: {},
      claimErrorRules: [],
      coverageGuide: null,
      claimAuditRules: null,
      claimAuditFieldMap: null,
      documentTypeSchema: null,
      auditOutcomeTemplates: null,
      claimAuditExamples: [],
      defaultStuiCsv: "",
      selectedAuditResult: null,
      validatorResult: null,
      auditInputs: {
        claimScreenText: "",
        repairOrderText: "",
        visText: "",
        stuiCsvText: "",
        partsText: ""
      },
      validatorInputs: {
        claimText: "",
        notesText: ""
      },
      chatHistory: [
        {
          role: "model",
          text: "Hello. I’m your Warranty assistant. I can help with policy, checklist, claim type, portal field, claim audit, and returned-claim questions once the libraries finish loading."
        }
      ]
    };

    const MATCH_STOP_WORDS = new Set(["a","an","the","about","tell","me","of","for","to","in","on","at","by","show","what","is","are","was","were","be","being","been","give","example","it","this","that","please","do","does","did","and","or","with","from","how","works","work","explain","policy","warranty","claim","claims"]);
    const CHECKLIST_GROUPS = [["repair_order_required_fields","Repair Order Required Fields"],["repair_order_supporting_requirements","Repair Order Supporting Requirements"],["digital_attachments_required","Digital Attachments Required"],["digital_attachment_standards","Digital Attachment Standards"],["campaign_or_recall_minimums","Campaign / Recall Minimums"],["audit_support_documents","Audit Support Documents"],["minimum_submission_checklist","Minimum Submission Checklist"],["special_requirements","Special Requirements"]];

    const els = {
      libraryStatusText: document.getElementById("library-status-text"),
      libraryStatusDot: document.getElementById("library-status-dot"),
      toast: document.getElementById("toast"),
      mobileTabBar: document.getElementById("mobile-tab-bar"),
      panelLeft: document.getElementById("panel-left"),
      panelCenter: document.getElementById("panel-center"),
      panelRight: document.getElementById("panel-right"),
      leftPanelHeader: document.getElementById("left-panel-header"),
      centerPanelHeader: document.getElementById("center-panel-header"),
      rightPanelHeader: document.getElementById("right-panel-header"),
      leftPanel: document.getElementById("leftPanel"),
      centerPanel: document.getElementById("centerPanel"),
      rightPanel: document.getElementById("rightPanel")
    };

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function normalizeText(value) { return String(value ?? "").trim(); }
    function normalizeArray(value) {
      if (Array.isArray(value)) return value;
      if (value === null || value === undefined || value === "") return [];
      return [value];
    }
    function normalizeForMatch(value) { return String(value ?? "").toLowerCase().replace(/[^a-z0-9\.]+/g, " ").trim(); }
    function tokenizeForMatch(value) {
      return normalizeForMatch(value).split(" ").map((token) => token.trim()).filter((token) => token.length > 1 && !MATCH_STOP_WORDS.has(token));
    }
    function normalizeVin(value) {
      const vin = String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : "";
    }

    function updateLibraryStatus(kind, text) {
      const colorMap = { loading: "bg-amber-300", ready: "bg-green-400", error: "bg-red-400" };
      els.libraryStatusDot.className = `h-2 w-2 rounded-full ${colorMap[kind] || "bg-slate-400"}`;
      els.libraryStatusText.textContent = text;
    }

    function showToast(message) {
      if (!message) return;
      if (state.toastTimer) clearTimeout(state.toastTimer);
      els.toast.textContent = message;
      els.toast.classList.remove("hidden");
      els.toast.classList.add("toast-show");
      state.toastTimer = setTimeout(() => {
        els.toast.classList.add("hidden");
        els.toast.classList.remove("toast-show");
      }, 1800);
    }

    async function copyTextToClipboard(text, successMessage = "Copied") {
      const value = normalizeText(text);
      if (!value) return;
      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(value);
          showToast(successMessage);
          return;
        } catch (_) {}
      }
      try {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.style.position = "fixed";
        textarea.style.top = "-9999px";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        showToast(successMessage);
      } catch (error) {
        console.error(error);
        showToast("Copy failed");
      }
    }

    async function loadJson(path, optional = false) {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) {
        if (optional) return null;
        throw new Error(`Failed to load ${path} (${response.status})`);
      }
      return response.json();
    }

    async function loadText(path, optional = false) {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) {
        if (optional) return "";
        throw new Error(`Failed to load ${path} (${response.status})`);
      }
      return response.text();
    }

    async function loadLibraries() {
      state.loadingLibraries = true;
      updateLibraryStatus("loading", "Loading libraries…");
      renderApp();
      try {
        const [
          policies,
          claimRequirements,
          claimTypes,
          claimPortalSchema,
          claimErrorRules,
          coverageGuide,
          claimAuditRules,
          claimAuditFieldMap,
          documentTypeSchema,
          auditOutcomeTemplates,
          claimAuditExamples,
          defaultStuiCsv
        ] = await Promise.all([
          loadJson("/warranty_library/2026_hyundai_warranty_policies.json"),
          loadJson("/warranty_library/claimRequirements.json"),
          loadJson("/warranty_library/claimTypes.json"),
          loadJson("/warranty_library/claimPortalSchema.json"),
          loadJson("/warranty_library/claimErrorRules.json"),
          loadJson("/warranty_library/coverageGuide.json", true),
          loadJson("/warranty_library/claimAuditRules.json", true),
          loadJson("/warranty_library/claimAuditFieldMap.json", true),
          loadJson("/warranty_library/documentTypeSchema.json", true),
          loadJson("/warranty_library/auditOutcomeTemplates.json", true),
          loadJson("/warranty_library/claimAuditExamples.json", true),
          loadText("/data/stui_portal.csv", true)
        ]);

        state.policies = Array.isArray(policies) ? policies : [];
        state.claimRequirements = claimRequirements?.warranty_claim_submission_requirements || null;
        state.claimTypes = claimTypes?.claim_types || [];
        state.claimPortalSchema = claimPortalSchema?.claim_portal_schema || {};
        state.claimErrorRules = claimErrorRules?.claim_error_rules || [];
        state.coverageGuide = coverageGuide?.coverage_guide || null;
        state.claimAuditRules = claimAuditRules || null;
        state.claimAuditFieldMap = claimAuditFieldMap || null;
        state.documentTypeSchema = documentTypeSchema || null;
        state.auditOutcomeTemplates = auditOutcomeTemplates || null;
        state.claimAuditExamples = claimAuditExamples?.claim_audit_examples || [];
        state.defaultStuiCsv = defaultStuiCsv || "";
        if (state.claimTypes.length && !state.claimTypes.find((item) => item.key === state.selectedClaimType)) {
          state.selectedClaimType = state.claimTypes[0].key;
        }
        if (state.coverageGuide?.coverage_categories?.length) {
          state.selectedCoverageCategory = state.coverageGuide.coverage_categories[0].key;
        }
        state.manualLoaded = true;
        updateLibraryStatus("ready", "Libraries loaded");
      } catch (error) {
        console.error(error);
        state.manualLoaded = false;
        updateLibraryStatus("error", "Library load failed");
        state.chatHistory.push({ role: "model", text: `⚠️ I could not load one or more JSON libraries. ${error.message}` });
      } finally {
        state.loadingLibraries = false;
        renderApp();
      }
    }

    function syncWorkspaceTabs() {
      document.querySelectorAll("[data-workspace-mode]").forEach((button) => {
        const active = button.dataset.workspaceMode === state.mode;
        button.className = `workspace-tab rounded-xl border px-3 py-2 text-sm font-medium transition ${active ? "border-[var(--brand)] bg-[var(--brand)] text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`;
      });
    }

    function setMode(mode) {
      state.mode = mode;
      syncWorkspaceTabs();
      renderApp();
      if (window.innerWidth < 1280) {
        state.compactView = "left";
        updateResponsivePanels();
      }
    }

    function setCompactView(view) {
      state.compactView = view;
      updateResponsivePanels();
    }

    function updateResponsivePanels() {
      const compact = window.innerWidth < 1280;
      if (!compact) {
        els.panelLeft.classList.remove("hidden"); els.panelLeft.classList.add("flex");
        els.panelCenter.classList.remove("hidden"); els.panelCenter.classList.add("flex");
        els.panelRight.classList.remove("hidden"); els.panelRight.classList.add("flex");
        els.mobileTabBar.classList.add("hidden");
        return;
      }
      els.mobileTabBar.classList.remove("hidden");
      const panelMap = { left: els.panelLeft, center: els.panelCenter, right: els.panelRight };
      Object.entries(panelMap).forEach(([name, panel]) => {
        const active = state.compactView === name;
        panel.classList.toggle("hidden", !active);
        panel.classList.toggle("flex", active);
      });
      document.querySelectorAll("[data-compact-view]").forEach((button) => {
        const active = button.dataset.compactView === state.compactView;
        button.className = `compact-tab rounded-xl border px-3 py-2 text-sm font-medium transition ${active ? "border-[var(--brand)] bg-[var(--brand)] text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;
      });
    }

    function formatInlineMarkdown(text) { return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"); }
    function sectionExists(sectionId) { return state.policies.some((sec) => String(sec.section_id) === String(sectionId)); }
    function getSectionById(sectionId) { return state.policies.find((sec) => String(sec.section_id) === String(sectionId)) || null; }
    function getSelectedSection() { return getSectionById(state.selectedSectionId); }
    function getSelectedClaimType() { return state.claimTypes.find((t) => t.key === state.selectedClaimType) || null; }
    function getSelectedPortalSchema() { return state.claimPortalSchema?.[state.selectedClaimType] || null; }
    function getSelectedErrorRule() { return state.claimErrorRules.find((r) => r.code === state.selectedErrorCode) || null; }
    function getSelectedChecklistContext() {
      const checklist = state.claimRequirements;
      if (!checklist) return null;
      const label = CHECKLIST_GROUPS.find(([key]) => key === state.selectedChecklistGroup)?.[1] || state.selectedChecklistGroup;
      return { key: state.selectedChecklistGroup, label, items: state.selectedChecklistGroup === "special_requirements" ? (checklist.special_requirements || {}) : (checklist[state.selectedChecklistGroup] || []) };
    }
    function getSelectedPortalSectionContext() {
      const schema = getSelectedPortalSchema();
      const section = schema?.sections?.[state.selectedPortalSection];
      return section ? { claim_type: state.selectedClaimType, section_key: state.selectedPortalSection, ...section } : null;
    }
    function getSelectedAuditContext() { return state.selectedAuditResult || null; }

    function linkSectionMentions(text) {
      return text.replace(/\b(?:Section|Sec\.?)\s+([1-9]\d*(?:\.\d+)*)\b/gi, (match, sectionId) => {
        if (!sectionExists(sectionId)) return match;
        return `<button type="button" data-select-section="${escapeHtml(sectionId)}" class="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-[var(--brand)] transition hover:bg-blue-100">Section ${escapeHtml(sectionId)}</button>`;
      });
    }

    function formatRichInline(text, role = "model") {
      let html = escapeHtml(text);
      html = formatInlineMarkdown(html);
      if (role === "model") html = linkSectionMentions(html);
      return html;
    }

    function renderMessageBody(text, role = "model") {
      const lines = String(text ?? "").split("\n");
      let html = "";
      let inList = false;
      let listType = "";
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
          if (inList) { html += `</${listType}>`; inList = false; }
          html += "<br>";
          continue;
        }
        const isBullet = /^[-*]\s+(.*)/.exec(line);
        const isNum = /^(\d+)\.\s+(.*)/.exec(line);
        if (isBullet) {
          if (!inList) { html += `<ul class="list-disc space-y-1 pl-5 mb-2 text-slate-700">`; inList = true; listType = "ul"; }
          else if (listType === "ol") { html += `</ol><ul class="list-disc space-y-1 pl-5 mb-2 text-slate-700">`; listType = "ul"; }
          html += `<li>${formatRichInline(isBullet[1], role)}</li>`;
        } else if (isNum) {
          if (!inList) { html += `<ol class="list-decimal space-y-1 pl-5 mb-2 text-slate-700">`; inList = true; listType = "ol"; }
          else if (listType === "ul") { html += `</ul><ol class="list-decimal space-y-1 pl-5 mb-2 text-slate-700">`; listType = "ol"; }
          html += `<li>${formatRichInline(isNum[2], role)}</li>`;
        } else {
          if (inList) { html += `</${listType}>`; inList = false; }
          html += `<p class="mb-2 text-slate-700">${formatRichInline(line, role)}</p>`;
        }
      }
      if (inList) html += `</${listType}>`;
      return html;
    }

    function renderPromptChips(containerId = "chat-prompts-inline") {
      const prompts = getPromptSuggestions();
      return `<div id="${containerId}" class="mt-3 flex flex-wrap gap-2">${prompts.map((prompt) => `<button type="button" data-prompt="${escapeHtml(prompt)}" class="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">${escapeHtml(prompt)}</button>`).join("")}</div>`;
    }

    function getPromptSuggestions() {
      switch (state.mode) {
        case APP_MODES.CHECKLIST:
          return ["What documents are required before submission?","What attachments are mandatory?","What do I need for a powertrain claim?","What records must be retained for audit?"];
        case APP_MODES.CLAIM_TYPES:
          return ["What claim type should I use for rental?","What is the difference between warranty and campaign?","When do I use a PDI claim?","What workflows are related to warranty claims?"];
        case APP_MODES.ENTRY_MAP:
          return ["Explain the Basic Information section","What belongs in OP Code Information?","How should attachments be categorized?","What does the summary section mean?"];
        case APP_MODES.VALIDATOR:
          return ["What looks missing from this claim?","What should I review before submitting?","What fields are likely weak?","What would you validate first?"];
        case APP_MODES.ERROR_FIX:
          return ["Explain code 306","What does invalid OP code mean?","How do I fix a returned claim?","When is dealer reply needed?"];
        case APP_MODES.CLAIM_AUDIT:
          return ["What is blocking this claim?","What should I fix first?","What does the mileage issue mean?","What documents still need review?"];
        case APP_MODES.COVERAGE:
          return ["What is covered for this component?","What are the time and mileage limits?","Is this covered for second owner?","What exclusions apply?"];
        case APP_MODES.POLICY:
        default:
          if (getSelectedSection()) return ["Summarize this policy","What are the time or mileage limits?","What is specifically excluded?","What actions must the dealer take?"];
          return ["How do I file a transportation claim?","What is the warranty on a 12V battery?","Explain the Pre-Delivery Inspection rules","What are the exclusions for paint defects?"];
      }
    }

    function renderChatPanel() {
      const modeLabelMap = {
        policy: "Policy Assistant",
        checklist: "Checklist Assistant",
        claim_types: "Claim Type Assistant",
        entry_map: "Entry Map Assistant",
        validator: "Validator Assistant",
        error_fix: "Error Fix Assistant",
        claim_audit: "Claim Audit Assistant",
        coverage: "Coverage Assistant"
      };
      const selectedSection = getSelectedSection();
      els.rightPanelHeader.innerHTML = `<div class="flex items-center justify-between gap-3"><div><h2 class="flex items-center gap-2 text-sm font-semibold text-slate-700"><svg class="h-4 w-4 text-[var(--brand)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M8 10h8M8 14h5m-8 7 3.5-3H19a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14l2-2Z" /></svg>${escapeHtml(modeLabelMap[state.mode] || "Warranty Assistant")}</h2><p class="mt-1 text-xs text-slate-500">Answers grounded in your loaded JSON libraries and current workspace context.</p></div><button id="clear-chat-btn" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50">Clear Chat</button></div>`;

      const isOnlyWelcome = state.chatHistory.length === 1 && state.chatHistory[0]?.role === "model";
      const introHtml = isOnlyWelcome ? `<div class="mb-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><div class="mb-3 flex items-start gap-3"><div class="rounded-2xl bg-blue-50 p-2 text-[var(--brand)]"><svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M8 10h8M8 14h5m-8 7 3.5-3H19a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14l2-2Z" /></svg></div><div><h3 class="text-sm font-semibold text-slate-800">How to use this workspace</h3><p class="mt-1 text-sm text-slate-600">Pick a workspace tab, review the details in the center panel, then ask questions in plain language.</p></div></div>${renderPromptChips("chat-intro-prompts")}</div>` : "";

      const messagesHtml = state.chatHistory.map((msg, index) => {
        const isUser = msg.role === "user";
        return `<div class="mb-4 flex ${isUser ? "justify-end" : "justify-start"}"><div class="group relative max-w-[92%] sm:max-w-[88%]"><div class="rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${isUser ? "rounded-tr-none bg-[var(--brand)] text-white" : "rounded-tl-none border border-slate-200 bg-white"}">${renderMessageBody(msg.text, msg.role)}</div><button type="button" data-copy-chat-index="${index}" class="absolute -bottom-2 ${isUser ? "left-2" : "right-2"} hidden rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-500 shadow-sm transition hover:text-[var(--brand)] group-hover:block">Copy</button></div></div>`;
      }).join("");

      const typingHtml = state.sending ? `<div class="mb-4 flex justify-start"><div class="inline-flex items-center gap-3 rounded-2xl rounded-tl-none border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm"><svg class="h-4 w-4 animate-spin-custom text-[var(--brand)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 1 1-6.2-8.56" /></svg><span>Checking the loaded libraries…</span></div></div>` : "";
      const enabled = state.manualLoaded && !state.sending;
      const chatStatus = !state.manualLoaded ? "Libraries required" : state.sending ? "Assistant is responding…" : selectedSection && state.mode === APP_MODES.POLICY ? `Using context: Section ${selectedSection.section_id}` : `Mode: ${state.mode.replaceAll("_", " ")}`;

      els.rightPanel.innerHTML = `<div id="chat-container" class="bg-grid min-h-0 flex-1 overflow-y-auto p-4">${introHtml}${messagesHtml}${typingHtml}</div><div class="shrink-0 border-t border-slate-200 bg-white p-4"><div class="rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-inner"><div class="mb-2 flex items-center justify-between gap-3"><p class="text-xs text-slate-500">Tip: in Claim Audit mode, run the audit first, then ask the assistant what matters most.</p><p id="chat-status" class="text-xs text-slate-400">${escapeHtml(chatStatus)}</p></div><div class="flex items-end gap-2"><textarea id="chat-input" rows="3" placeholder="Ask about a policy, checklist item, claim type, portal field, audit issue, or return error..." class="min-h-[72px] max-h-40 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-transparent focus:ring-2 focus:ring-[var(--brand)] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500" ${enabled ? "" : "disabled"}></textarea><button id="send-btn" class="inline-flex h-12 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] px-4 text-white transition hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50" ${enabled ? "" : "disabled"} aria-label="Send"><svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M22 2 11 13"></path><path stroke-linecap="round" stroke-linejoin="round" d="m22 2-7 20-4-9-9-4 20-7Z"></path></svg></button></div>${renderPromptChips("chat-prompts-inline")}</div></div>`;
      const chatContainer = document.getElementById("chat-container");
      if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
      const sendBtn = document.getElementById("send-btn");
      const chatInput = document.getElementById("chat-input");
      const clearChatBtn = document.getElementById("clear-chat-btn");
      if (sendBtn) sendBtn.addEventListener("click", sendMessage);
      if (clearChatBtn) clearChatBtn.addEventListener("click", clearChat);
      if (chatInput) chatInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); }
      });
    }

    function renderPlaceholderCard(title, message) {
      return `<div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft"><h3 class="text-lg font-semibold text-slate-800">${escapeHtml(title)}</h3><p class="mt-2 text-sm text-slate-600">${escapeHtml(message)}</p></div>`;
    }

    function renderGenericArray(items) {
      return `<ul class="space-y-2 text-sm text-slate-700">${items.map((item) => `<li>${formatRichInline(String(item), "model")}</li>`).join("")}</ul>`;
    }

    function renderPolicyMode() {
      const selectedSection = getSelectedSection();
      const term = state.searchTerm.toLowerCase().trim();
      const filtered = state.policies.filter((sec) => !term || [sec.section_id, sec.title, sec.raw_content].map((v) => String(v ?? "").toLowerCase()).join(" ").includes(term));
      els.leftPanelHeader.innerHTML = `<div class="mb-3 flex items-center justify-between gap-3"><h2 class="flex items-center gap-2 text-sm font-semibold text-slate-700"><svg class="h-4 w-4 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>Policy Index</h2><span class="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">${state.policies.length} loaded</span></div><div class="relative"><input id="policy-search-input" type="text" placeholder="Search section number or keyword..." value="${escapeHtml(state.searchTerm)}" class="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-16 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-transparent focus:ring-2 focus:ring-[var(--brand)] ${state.manualLoaded ? "" : "cursor-not-allowed bg-slate-50"}" ${state.manualLoaded ? "" : "disabled"}/><svg class="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"></circle><path stroke-linecap="round" stroke-linejoin="round" d="m20 20-3.5-3.5"></path></svg></div><div class="mt-2 flex items-center justify-between gap-3"><p class="text-xs text-slate-500">${state.manualLoaded ? `${filtered.length} of ${state.policies.length} sections shown` : "Waiting for data…"}</p><button id="clear-search-btn" type="button" class="${state.searchTerm ? "" : "hidden "+""}text-xs font-medium text-slate-400 transition hover:text-slate-600">Clear</button></div>`;
      if (!state.manualLoaded && state.loadingLibraries) {
        els.leftPanel.innerHTML = `<div class="flex h-full flex-col items-center justify-center px-6 text-center text-slate-400"><svg class="mb-3 h-8 w-8 animate-spin-custom text-[var(--brand)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 1 1-6.2-8.56" /></svg><p class="text-sm">Loading policy data…</p></div>`;
      } else if (!filtered.length) {
        els.leftPanel.innerHTML = `<div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">No sections found for that search.</div>`;
      } else {
        els.leftPanel.innerHTML = filtered.map((sec) => {
          const isSelected = selectedSection && String(selectedSection.section_id) === String(sec.section_id);
          return `<button type="button" data-section-id="${escapeHtml(sec.section_id)}" class="mb-2 flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left transition ${isSelected ? "border-[var(--brand)] bg-[var(--brand)] text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"}"><div class="min-w-0"><div class="truncate text-xs font-semibold uppercase tracking-wider ${isSelected ? "text-blue-200" : "text-slate-400"}">Section ${escapeHtml(sec.section_id || "—")}</div><div class="mt-1 truncate text-sm font-medium ${isSelected ? "text-white" : "text-slate-800"}">${escapeHtml(sec.title || "Untitled")}</div>${sec.is_structured ? `<div class="mt-1.5 inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700">Structured Reference</div>` : ""}</div><svg class="ml-3 h-4 w-4 shrink-0 ${isSelected ? "text-white" : "text-slate-300"}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m9 18 6-6-6-6" /></svg></button>`;
        }).join("");
      }
      els.centerPanelHeader.innerHTML = `<div class="flex items-center justify-between gap-3"><h2 class="text-sm font-semibold text-slate-700">Policy Details</h2><button id="copy-section-btn" type="button" class="${selectedSection ? "" : "hidden "+""}rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50">Copy Details</button></div>`;
      if (!selectedSection) {
        const popular = ["2.1.2","2.2.4","2.3.2","3.0.2","4.1.6","5.0.8"].map((id) => getSectionById(id)).filter(Boolean);
        els.centerPanel.innerHTML = `<div class="flex h-full flex-col px-5 py-6"><div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft"><div class="mb-4 flex items-start gap-3"><div class="rounded-2xl bg-blue-50 p-3 text-[var(--brand)]"><svg class="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg></div><div><h3 class="text-lg font-semibold text-slate-800">Choose a section to begin</h3><p class="mt-1 text-sm text-slate-600">Search the index on the left, open a policy, and use the assistant to ask for limits, exclusions, or procedures.</p></div></div>${popular.length ? `<div><p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Popular Policies</p><div class="flex flex-wrap gap-2">${popular.map((sec) => `<button type="button" data-select-section="${escapeHtml(sec.section_id)}" class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white">${escapeHtml(sec.section_id)} - ${escapeHtml(sec.title)}</button>`).join("")}</div></div>` : ""}</div></div>`;
      } else {
        const sectionCards = [];
        function addCard(title, value, tone = "slate") {
          const items = Array.isArray(value) ? value : value ? [value] : [];
          if (!items.length) return;
          const toneMap = { green: "border-green-200 bg-green-50/70 text-green-800", red: "border-red-200 bg-red-50/70 text-red-800", blue: "border-blue-200 bg-blue-50/70 text-blue-800", purple: "border-purple-200 bg-purple-50/70 text-purple-800", orange: "border-orange-200 bg-orange-50/70 text-orange-800", indigo: "border-indigo-200 bg-indigo-50/70 text-indigo-800", cyan: "border-cyan-200 bg-cyan-50/70 text-cyan-800", sky: "border-sky-200 bg-sky-50/70 text-sky-800", fuchsia: "border-fuchsia-200 bg-fuchsia-50/70 text-fuchsia-800", amber: "border-amber-200 bg-amber-50/70 text-amber-800", rose: "border-rose-200 bg-rose-50/70 text-rose-800", teal: "border-teal-200 bg-teal-50/70 text-teal-800", slate: "border-slate-200 bg-white text-slate-700" };
          const toneClass = toneMap[tone] || toneMap.slate;
          sectionCards.push(`<details open class="group rounded-2xl border ${toneClass} p-4 shadow-sm"><summary class="flex cursor-pointer list-none items-center justify-between gap-3"><span class="text-sm font-bold">${escapeHtml(title)}</span><span class="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition group-open:rotate-180"><svg class="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" /></svg></span></summary><div class="mt-4 border-t border-black/5 pt-3">${renderGenericArray(items)}</div></details>`);
        }
        if (selectedSection.is_structured) {
          addCard("Eligibility Conditions", normalizeArray(selectedSection.eligibility_conditions), "purple");
          addCard("Coverage & Reimbursement", normalizeArray(selectedSection.coverage_and_reimbursement || selectedSection.coverage_details), "green");
          addCard("Payment Limitations", normalizeArray(selectedSection.payment_limitations), "orange");
          addCard("Not Covered", normalizeArray(selectedSection.not_covered || selectedSection.exclusions), "red");
          addCard("Dealer Actions", normalizeArray(selectedSection.dealer_actions), "blue");
          addCard("Timing Rules", normalizeArray(selectedSection.timing_rules), "amber");
          addCard("Documents Required", normalizeArray(selectedSection.documents_required), "indigo");
          addCard("Systems", normalizeArray(selectedSection.systems || selectedSection.systems_referenced), "cyan");
          addCard("System Screens", normalizeArray(selectedSection.system_screens), "sky");
          addCard("Comment Requirements", normalizeArray(selectedSection.comment_requirements), "fuchsia");
          addCard("Claim Processing Risks", normalizeArray(selectedSection.claim_processing_risks), "rose");
          addCard("Roles Explicitly Mentioned", normalizeArray(selectedSection.roles_explicitly_mentioned), "teal");
        }
        els.centerPanel.innerHTML = `<div class="space-y-4 p-5"><div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div class="mb-3 inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[var(--brand)]">SECTION ${escapeHtml(selectedSection.section_id)}</div><div class="flex flex-wrap items-start justify-between gap-3"><div class="w-full text-xl font-bold text-slate-800 sm:w-auto">${escapeHtml(selectedSection.title || "Untitled")}</div><button type="button" data-copy-section="${escapeHtml(`Section ${selectedSection.section_id} - ${selectedSection.title}`)}" class="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50">Copy</button></div></div>${sectionCards.join("")}<details class="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><summary class="flex cursor-pointer list-none items-center justify-between gap-3"><span class="text-sm font-bold text-slate-700">Raw Policy Text</span><span class="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition group-open:rotate-180"><svg class="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" /></svg></span></summary><div class="mt-4 border-t border-black/5 pt-3"><p class="text-sm leading-relaxed text-slate-700">${escapeHtml(selectedSection.raw_content || "")}</p></div></details></div>`;
      }
      const policySearchInput = document.getElementById("policy-search-input");
      const clearSearchBtn = document.getElementById("clear-search-btn");
      if (policySearchInput) policySearchInput.addEventListener("input", (event) => { state.searchTerm = event.target.value || ""; renderPolicyMode(); renderChatPanel(); });
      if (clearSearchBtn) clearSearchBtn.addEventListener("click", () => { state.searchTerm = ""; renderPolicyMode(); renderChatPanel(); });
      els.leftPanel.querySelectorAll("[data-section-id]").forEach((button) => button.addEventListener("click", () => { state.selectedSectionId = button.dataset.sectionId; renderPolicyMode(); renderChatPanel(); if (window.innerWidth < 1280) setCompactView("center"); }));
      const copyBtn = document.getElementById("copy-section-btn");
      if (copyBtn && selectedSection) copyBtn.addEventListener("click", () => copyTextToClipboard(`Section ${selectedSection.section_id} - ${selectedSection.title}`, `Copied Section ${selectedSection.section_id}`));
    }

    function renderChecklistMode() {
      const checklist = state.claimRequirements;
      els.leftPanelHeader.innerHTML = `<div class="mb-3 flex items-center justify-between gap-3"><h2 class="text-sm font-semibold text-slate-700">Checklist Groups</h2><span class="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">${CHECKLIST_GROUPS.length} groups</span></div><p class="text-xs text-slate-500">Claim submission and audit-support requirements.</p>`;
      els.leftPanel.innerHTML = `<div class="space-y-2">${CHECKLIST_GROUPS.map(([key, label]) => `<button class="w-full rounded-lg border px-3 py-2 text-left text-sm ${state.selectedChecklistGroup === key ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}" data-checklist-group="${key}">${escapeHtml(label)}</button>`).join("")}</div>`;
      els.centerPanelHeader.innerHTML = `<div class="flex items-center justify-between gap-3"><h2 class="text-sm font-semibold text-slate-700">Checklist Details</h2><button id="copy-checklist-btn" type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50">Copy List</button></div>`;
      if (!checklist) {
        els.centerPanel.innerHTML = `<div class="p-5">${renderPlaceholderCard("Checklist not loaded", "claimRequirements.json is missing or could not be loaded.")}</div>`;
      } else if (state.selectedChecklistGroup === "special_requirements") {
        els.centerPanel.innerHTML = `<div class="space-y-4 p-5">${Object.entries(checklist.special_requirements || {}).map(([key, items]) => `<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm font-semibold text-slate-900">${escapeHtml(key.replaceAll("_", " "))}</div><ul class="mt-3 space-y-2">${(items || []).map((item) => `<li class="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"><input type="checkbox" class="mt-1 h-4 w-4 rounded border-slate-300" /><span>${escapeHtml(item)}</span></li>`).join("")}</ul></div>`).join("")}</div>`;
      } else {
        const label = CHECKLIST_GROUPS.find(([k]) => k === state.selectedChecklistGroup)?.[1] || "Checklist";
        const items = checklist[state.selectedChecklistGroup] || [];
        els.centerPanel.innerHTML = `<div class="p-5"><div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm font-semibold text-slate-900">${escapeHtml(label)}</div><ul class="mt-3 space-y-2">${items.map((item) => `<li class="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"><input type="checkbox" class="mt-1 h-4 w-4 rounded border-slate-300" /><span>${escapeHtml(item)}</span></li>`).join("")}</ul></div></div>`;
      }
      const totalChecklistItems = CHECKLIST_GROUPS.filter(([key]) => key !== "special_requirements").reduce((sum, [key]) => sum + ((checklist?.[key] || []).length), 0) + Object.values(checklist?.special_requirements || {}).reduce((sum, arr) => sum + ((arr || []).length), 0);
      els.leftPanel.querySelectorAll("[data-checklist-group]").forEach((button) => button.addEventListener("click", () => { state.selectedChecklistGroup = button.dataset.checklistGroup; renderChecklistMode(); renderChatPanel(); if (window.innerWidth < 1280) setCompactView("center"); }));
      els.centerPanel.querySelectorAll("#copy-checklist-btn").forEach((button) => button.addEventListener("click", () => {
        const items = state.selectedChecklistGroup === "special_requirements" ? Object.entries(checklist.special_requirements || {}).map(([k, arr]) => `${k}\n- ${(arr || []).join("\n- ")}`).join("\n\n") : (checklist[state.selectedChecklistGroup] || []).join("\n");
        copyTextToClipboard(items, "Checklist copied");
      }));
      els.rightPanelHeader.innerHTML = `<div class="flex items-center justify-between gap-3"><h2 class="text-sm font-semibold text-slate-700">Checklist Summary</h2></div>`;
      els.rightPanel.innerHTML = `<div class="space-y-4 p-4"><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm text-slate-500">Source Sections</div><div class="mt-1 text-sm font-semibold text-slate-900">${escapeHtml((checklist?.source_sections || []).join(", "))}</div></div><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm text-slate-500">Total Checklist Items</div><div class="mt-1 text-2xl font-bold text-slate-900">${totalChecklistItems}</div></div><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm font-semibold text-slate-900">Use Case</div><p class="mt-2 text-sm text-slate-600">Use this to confirm what must exist before submission and what must be retained for Hyundai review and audit.</p></div></div>`;
    }

    function renderClaimTypesMode() {
      const selected = getSelectedClaimType();
      els.leftPanelHeader.innerHTML = `<div class="mb-3 flex items-center justify-between gap-3"><h2 class="text-sm font-semibold text-slate-700">Claim Types</h2><span class="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">${state.claimTypes.length} loaded</span></div><p class="text-xs text-slate-500">Select the claim workflow you want to understand or validate.</p>`;
      els.leftPanel.innerHTML = state.claimTypes.map((type) => `<button class="mb-2 w-full rounded-xl border px-3 py-3 text-left ${type.key === selected?.key ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}" data-claim-type="${escapeHtml(type.key)}"><div class="font-semibold">${escapeHtml(type.label)}</div><div class="mt-1 text-xs opacity-80">${escapeHtml(type.category || "")}</div></button>`).join("");
      els.centerPanelHeader.innerHTML = `<div class="flex items-center justify-between gap-3"><h2 class="text-sm font-semibold text-slate-700">Claim Type Details</h2></div>`;
      if (!selected) {
        els.centerPanel.innerHTML = `<div class="p-5">${renderPlaceholderCard("No claim types loaded", "claimTypes.json is missing or empty.")}</div>`;
      } else {
        els.centerPanel.innerHTML = `<div class="p-5"><div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div class="text-sm text-slate-500">Selected Claim Type</div><h2 class="mt-1 text-2xl font-bold text-slate-900">${escapeHtml(selected.label)}</h2><p class="mt-3 text-sm text-slate-600">${escapeHtml(selected.description || "")}</p><div class="mt-5 grid gap-4 md:grid-cols-2"><div class="rounded-xl bg-slate-50 p-4"><div class="text-sm font-semibold text-slate-900">Portal Path</div><ul class="mt-2 space-y-1 text-sm text-slate-700">${(selected.portal_path || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div><div class="rounded-xl bg-slate-50 p-4"><div class="text-sm font-semibold text-slate-900">Required Groups</div><ul class="mt-2 space-y-1 text-sm text-slate-700">${(selected.required_groups || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div></div><div class="mt-4 grid gap-4 md:grid-cols-2"><div class="rounded-xl bg-slate-50 p-4"><div class="text-sm font-semibold text-slate-900">When To Use</div><ul class="mt-2 space-y-2 text-sm text-slate-700">${(selected.when_to_use || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div><div class="rounded-xl bg-slate-50 p-4"><div class="text-sm font-semibold text-slate-900">Audit Profile</div><ul class="mt-2 space-y-2 text-sm text-slate-700">${(selected.audit_profile?.common_failure_modes || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("") || '<li>No common failure modes listed yet.</li>'}</ul></div></div></div></div>`;
      }
      els.leftPanel.querySelectorAll("[data-claim-type]").forEach((button) => button.addEventListener("click", () => { state.selectedClaimType = button.dataset.claimType; state.selectedPortalSection = "basic_information"; renderClaimTypesMode(); renderChatPanel(); if (window.innerWidth < 1280) setCompactView("center"); }));
      els.rightPanelHeader.innerHTML = `<div class="flex items-center justify-between gap-3"><h2 class="text-sm font-semibold text-slate-700">Claim Type Summary</h2></div>`;
      els.rightPanel.innerHTML = selected ? `<div class="space-y-4 p-4"><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm text-slate-500">Key</div><div class="mt-1 text-sm font-semibold text-slate-900">${escapeHtml(selected.key)}</div></div><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm text-slate-500">Screen</div><div class="mt-1 text-sm font-semibold text-slate-900">${escapeHtml(selected.screen_name || "-")}</div></div><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm text-slate-500">Source Sections</div><div class="mt-1 text-sm font-semibold text-slate-900">${escapeHtml((selected.source_sections || []).join(", "))}</div></div></div>` : `<div class="p-5">${renderPlaceholderCard("No selection", "Select a claim type on the left.")}</div>`;
    }

    function renderEntryMapMode() {
      const selectedType = getSelectedClaimType();
      const schema = getSelectedPortalSchema();
      const sections = schema?.sections || {};
      const sectionKeys = Object.keys(sections);
      if (!sectionKeys.includes(state.selectedPortalSection)) state.selectedPortalSection = sectionKeys[0] || null;
      els.leftPanelHeader.innerHTML = `<div class="mb-3 flex items-center justify-between gap-3"><h2 class="text-sm font-semibold text-slate-700">Portal Sections</h2><span class="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">${selectedType ? selectedType.label : "No type"}</span></div><div class="relative"><select id="claim-type-select" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[var(--brand)]">${state.claimTypes.map((type) => `<option value="${escapeHtml(type.key)}" ${type.key === state.selectedClaimType ? "selected" : ""}>${escapeHtml(type.label)}</option>`).join("")}</select></div>`;
      els.leftPanel.innerHTML = sectionKeys.map((key) => { const sec = sections[key]; return `<button class="mb-2 w-full rounded-xl border px-3 py-3 text-left ${key === state.selectedPortalSection ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}" data-portal-section="${escapeHtml(key)}"><div class="font-semibold">${escapeHtml(sec.label || key)}</div><div class="mt-1 text-xs opacity-80">${sec.fields?.length || sec.row_schema?.length || 0} fields</div></button>`; }).join("");
      const activeSection = sections[state.selectedPortalSection];
      els.centerPanelHeader.innerHTML = `<div class="flex items-center justify-between gap-3"><h2 class="text-sm font-semibold text-slate-700">Claim Entry Map</h2><button id="copy-portal-section-btn" type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50">Copy Section</button></div>`;
      if (!activeSection) {
        els.centerPanel.innerHTML = `<div class="p-5">${renderPlaceholderCard("No portal schema", "claimPortalSchema.json is missing or no section is available for this claim type.")}</div>`;
      } else {
        els.centerPanel.innerHTML = `<div class="p-5"><div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div class="text-sm text-slate-500">Selected Portal Section</div><h2 class="mt-1 text-2xl font-bold text-slate-900">${escapeHtml(activeSection.label || state.selectedPortalSection)}</h2>${activeSection.repeatable ? `<div class="mt-2 text-xs text-slate-500">Repeatable section • max rows: ${activeSection.max_rows || activeSection.max_lines || "—"}</div>` : ""}${activeSection.max_file_size_mb ? `<div class="mt-2 text-xs text-slate-500">Max file size: ${activeSection.max_file_size_mb} MB</div>` : ""}${activeSection.restricted_characters_note ? `<div class="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">${escapeHtml(activeSection.restricted_characters_note)}</div>` : ""}<div class="mt-5 space-y-3">${(activeSection.fields || activeSection.row_schema || []).map((field) => `<div class="rounded-xl border border-slate-200 bg-slate-50 p-4"><div class="flex flex-wrap items-center gap-2"><div class="text-sm font-semibold text-slate-900">${escapeHtml(field.label)}</div><span class="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-500">${escapeHtml(field.type || "string")}</span>${field.required ? `<span class="rounded-full bg-red-100 px-2 py-0.5 text-[11px] text-red-700">required</span>` : `<span class="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-600">optional</span>`}${field.max_length ? `<span class="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700">max ${field.max_length}</span>` : ""}</div><div class="mt-2 text-xs text-slate-500">${escapeHtml(field.key)}</div></div>`).join("")}</div>${activeSection.allowed_categories ? `<div class="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"><div class="text-sm font-semibold text-slate-900">Allowed Categories</div><div class="mt-3 flex flex-wrap gap-2">${activeSection.allowed_categories.map((item) => `<span class="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">${escapeHtml(item)}</span>`).join("")}</div></div>` : ""}${activeSection.character_limits ? `<div class="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"><div class="text-sm font-semibold text-slate-900">Character Limits</div><ul class="mt-3 space-y-2 text-sm text-slate-700">${Object.entries(activeSection.character_limits).map(([key, value]) => `<li>${escapeHtml(key)}: ${escapeHtml(value)}</li>`).join("")}</ul></div>` : ""}</div></div>`;
      }
      els.leftPanel.querySelectorAll("[data-portal-section]").forEach((button) => button.addEventListener("click", () => { state.selectedPortalSection = button.dataset.portalSection; renderEntryMapMode(); renderChatPanel(); if (window.innerWidth < 1280) setCompactView("center"); }));
      const claimTypeSelect = document.getElementById("claim-type-select");
      if (claimTypeSelect) claimTypeSelect.addEventListener("change", (event) => { state.selectedClaimType = event.target.value; state.selectedPortalSection = "basic_information"; renderEntryMapMode(); renderChatPanel(); });
      const copyPortalSectionBtn = document.getElementById("copy-portal-section-btn");
      if (copyPortalSectionBtn && activeSection) copyPortalSectionBtn.addEventListener("click", () => copyTextToClipboard((activeSection.fields || activeSection.row_schema || []).map((f) => `${f.label} (${f.key})${f.required ? " [required]" : ""}`).join("\n"), "Portal section copied"));
      els.rightPanelHeader.innerHTML = `<div class="flex items-center justify-between gap-3"><h2 class="text-sm font-semibold text-slate-700">Context Panel</h2></div>`;
      els.rightPanel.innerHTML = `<div class="space-y-4 p-4"><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm font-semibold text-slate-900">Selected Claim Type</div><div class="mt-1 text-sm text-slate-600">${escapeHtml(selectedType?.label || "—")}</div></div><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm font-semibold text-slate-900">Portal Section</div><div class="mt-1 text-sm text-slate-600">${escapeHtml(activeSection?.label || "—")}</div></div><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm font-semibold text-slate-900">Why this matters</div><p class="mt-2 text-sm text-slate-600">Use this view as a map of the Hyundai portal so you know which field group to inspect before submission or resubmission.</p></div></div>`;
    }

    function renderValidatorMode() {
      els.leftPanelHeader.innerHTML = `<div class="mb-3 flex items-center justify-between gap-3"><h2 class="text-sm font-semibold text-slate-700">Validator Input</h2></div><p class="text-xs text-slate-500">Paste claim text or notes to compare against the selected claim workflow.</p>`;
      els.leftPanel.innerHTML = `<div class="space-y-4 p-2"><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><label class="mb-2 block text-sm font-semibold text-slate-900">Claim Type</label><select id="validator-claim-type" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[var(--brand)]">${state.claimTypes.map((type) => `<option value="${escapeHtml(type.key)}" ${type.key === state.selectedClaimType ? "selected" : ""}>${escapeHtml(type.label)}</option>`).join("")}</select></div><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><label class="mb-2 block text-sm font-semibold text-slate-900">Claim Text</label><textarea id="validator-text" rows="14" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[var(--brand)]" placeholder="Paste portal text, RO notes, or extracted claim content here...">${escapeHtml(state.validatorInputs.claimText)}</textarea><button id="run-validator-btn" class="mt-3 w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-900">Run Validator</button></div></div>`;
      els.centerPanelHeader.innerHTML = `<div class="flex items-center justify-between gap-3"><h2 class="text-sm font-semibold text-slate-700">Validation Results</h2></div>`;
      if (!state.validatorResult) {
        els.centerPanel.innerHTML = `<div class="p-5">${renderPlaceholderCard("Validator", "This version checks presence of core required fields using the selected claim type’s Basic Information schema.")}</div>`;
      } else {
        els.centerPanel.innerHTML = `<div class="p-5"><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm font-semibold text-slate-900">Basic Information Check</div><div class="mt-4 space-y-3">${state.validatorResult.map((item) => { const styles = item.status === "present" ? "border-green-200 bg-green-50 text-green-800" : item.status === "missing" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"; return `<div class="rounded-xl border p-3 ${styles}"><div class="flex items-center justify-between gap-3"><div class="font-semibold">${escapeHtml(item.label)}</div><div class="text-xs font-bold uppercase">${escapeHtml(item.status)}</div></div></div>`; }).join("")}</div></div></div>`;
      }
      const runBtn = document.getElementById("run-validator-btn");
      const textBox = document.getElementById("validator-text");
      const claimTypeSelect = document.getElementById("validator-claim-type");
      if (claimTypeSelect) claimTypeSelect.addEventListener("change", (event) => { state.selectedClaimType = event.target.value; renderValidatorMode(); renderChatPanel(); });
      if (runBtn && textBox) runBtn.addEventListener("click", () => { state.validatorInputs.claimText = textBox.value || ""; const schema = getSelectedPortalSchema(); const basicFields = schema?.sections?.basic_information?.fields || []; const text = normalizeForMatch(state.validatorInputs.claimText); state.validatorResult = basicFields.map((field) => { const labelNorm = normalizeForMatch(field.label).replace(/#/g, ""); const keyNorm = normalizeForMatch(field.key); const present = text.includes(labelNorm) || text.includes(keyNorm); return { label: field.label, required: !!field.required, status: present ? "present" : (field.required ? "missing" : "review") }; }); renderValidatorMode(); renderChatPanel(); if (window.innerWidth < 1280) setCompactView("center"); });
      els.rightPanelHeader.innerHTML = `<div class="flex items-center justify-between gap-3"><h2 class="text-sm font-semibold text-slate-700">How it works</h2></div>`;
      els.rightPanel.innerHTML = `<div class="space-y-4 p-4"><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm font-semibold text-slate-900">Validation Engine</div><p class="mt-2 text-sm text-slate-600">This checks for obvious presence or missing patterns against the selected claim type’s portal fields. Use Claim Audit for deeper cross-document comparison.</p></div></div>`;
    }

    function renderErrorFixMode() {
      const claimTypeFilteredRules = state.claimErrorRules.filter((rule) => !rule.claim_type || rule.claim_type === state.selectedClaimType || rule.claim_type === "general" || rule.claim_type === "warranty");
      const selectedRule = claimTypeFilteredRules.find((r) => r.code === state.selectedErrorCode) || claimTypeFilteredRules[0] || null;
      if (selectedRule && state.selectedErrorCode !== selectedRule.code) state.selectedErrorCode = selectedRule.code;
      els.leftPanelHeader.innerHTML = `<div class="mb-3 flex items-center justify-between gap-3"><h2 class="text-sm font-semibold text-slate-700">Error Rules</h2><span class="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">${claimTypeFilteredRules.length} rules</span></div><div class="relative"><select id="error-claim-type-select" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[var(--brand)]">${state.claimTypes.map((type) => `<option value="${escapeHtml(type.key)}" ${type.key === state.selectedClaimType ? "selected" : ""}>${escapeHtml(type.label)}</option>`).join("")}</select></div>`;
      els.leftPanel.innerHTML = claimTypeFilteredRules.map((rule) => `<button class="mb-2 w-full rounded-xl border px-3 py-3 text-left ${selectedRule?.code === rule.code ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}" data-error-code="${escapeHtml(rule.code)}"><div class="font-semibold">${escapeHtml(rule.code)}</div><div class="mt-1 text-xs opacity-80">${escapeHtml(rule.message)}</div></button>`).join("");
      els.centerPanelHeader.innerHTML = `<div class="flex items-center justify-between gap-3"><h2 class="text-sm font-semibold text-slate-700">Error Details</h2></div>`;
      if (!selectedRule) {
        els.centerPanel.innerHTML = `<div class="p-5">${renderPlaceholderCard("No error rules", "claimErrorRules.json is missing or no rules match the selected claim type.")}</div>`;
      } else {
        els.centerPanel.innerHTML = `<div class="space-y-4 p-5"><div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div class="flex flex-wrap items-center gap-2"><span class="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[var(--brand)]">${escapeHtml(selectedRule.code)}</span><span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">${escapeHtml(selectedRule.severity || "info")}</span><span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">${escapeHtml(selectedRule.category || "general")}</span></div><h2 class="mt-3 text-xl font-bold text-slate-900">${escapeHtml(selectedRule.message)}</h2><p class="mt-3 text-sm text-slate-600">${escapeHtml(selectedRule.meaning || "")}</p></div><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm font-semibold text-slate-900">Likely Problem Areas</div><ul class="mt-3 space-y-2 text-sm text-slate-700">${(selectedRule.likely_problem_areas || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm font-semibold text-slate-900">Validation Checks</div><ul class="mt-3 space-y-2 text-sm text-slate-700">${(selectedRule.validation_checks || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm font-semibold text-slate-900">Recommended Fix Steps</div><ol class="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">${(selectedRule.recommended_fix_steps || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol></div></div>`;
      }
      const errorClaimTypeSelect = document.getElementById("error-claim-type-select");
      if (errorClaimTypeSelect) errorClaimTypeSelect.addEventListener("change", (event) => { state.selectedClaimType = event.target.value; state.selectedErrorCode = null; renderErrorFixMode(); renderChatPanel(); });
      els.leftPanel.querySelectorAll("[data-error-code]").forEach((button) => button.addEventListener("click", () => { state.selectedErrorCode = button.dataset.errorCode; renderErrorFixMode(); renderChatPanel(); if (window.innerWidth < 1280) setCompactView("center"); }));
      els.rightPanelHeader.innerHTML = `<div class="flex items-center justify-between gap-3"><h2 class="text-sm font-semibold text-slate-700">Return Guidance</h2></div>`;
      els.rightPanel.innerHTML = selectedRule ? `<div class="space-y-4 p-4"><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm text-slate-500">Screen</div><div class="mt-1 text-sm font-semibold text-slate-900">${escapeHtml(selectedRule.screen || "-")}</div></div><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm text-slate-500">Dealer Reply Needed</div><div class="mt-1 text-sm font-semibold text-slate-900">${selectedRule.dealer_reply_needed ? "Yes" : "No"}</div></div><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm font-semibold text-slate-900">How to use this</div><p class="mt-2 text-sm text-slate-600">Use this view when a claim returns, an OP code triggers a validation error, or the portal shows a warning tied to the current claim type.</p></div></div>` : `<div class="p-5">${renderPlaceholderCard("No rule selected", "Select an error rule on the left.")}</div>`;
    }

    function renderIssueCard(issue) {
      const tone = issue.severity === "hard_stop" ? ["border-red-200 bg-red-50", "text-red-800", "Hard Stop"] : issue.severity === "warning" ? ["border-amber-200 bg-amber-50", "text-amber-800", "Warning"] : ["border-slate-200 bg-slate-50", "text-slate-700", "Info"];
      return `<div class="rounded-2xl border ${tone[0]} p-4 shadow-sm"><div class="flex flex-wrap items-center gap-2"><span class="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${tone[1]}">${escapeHtml(issue.code || "-")}</span><span class="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium ${tone[1]}">${tone[2]}</span></div><div class="mt-2 text-sm font-semibold text-slate-900">${escapeHtml(issue.title || "Issue")}</div><p class="mt-2 text-sm text-slate-700">${escapeHtml(issue.message || "")}</p>${issue.recommendedAction ? `<div class="mt-3 rounded-xl border border-white/60 bg-white/70 p-3 text-sm text-slate-700"><span class="font-semibold">Next step:</span> ${escapeHtml(issue.recommendedAction)}</div>` : ""}${issue.sources?.length ? `<div class="mt-2 text-xs text-slate-500">Sources: ${escapeHtml(issue.sources.join(", "))}</div>` : ""}</div>`;
    }

    function renderClaimAuditMode() {
      const selectedType = getSelectedClaimType();
      const hasResult = !!state.selectedAuditResult;
      els.leftPanelHeader.innerHTML = `<div class="mb-3 flex items-center justify-between gap-3"><h2 class="text-sm font-semibold text-slate-700">Claim Audit Inputs</h2><span class="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">Deterministic</span></div><p class="text-xs text-slate-500">Paste the claim screen, RO text, VIS text, STUI CSV, and parts text to audit the claim before submit.</p>`;
      els.leftPanel.innerHTML = `<div class="space-y-4 p-2"><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><label class="mb-2 block text-sm font-semibold text-slate-900">Claim Type</label><select id="audit-claim-type" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[var(--brand)]">${state.claimTypes.map((type) => `<option value="${escapeHtml(type.key)}" ${type.key === state.selectedClaimType ? "selected" : ""}>${escapeHtml(type.label)}</option>`).join("")}</select></div><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><label class="mb-2 block text-sm font-semibold text-slate-900">Claim Screen Text</label><textarea id="audit-claim-screen" class="textarea-soft w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[var(--brand)]" placeholder="Paste the WebDCS claim screen text here...">${escapeHtml(state.auditInputs.claimScreenText)}</textarea></div><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><label class="mb-2 block text-sm font-semibold text-slate-900">Repair Order / Packet Text</label><textarea id="audit-ro" class="textarea-soft w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[var(--brand)]" placeholder="Paste RO packet text, tech story, or summary here...">${escapeHtml(state.auditInputs.repairOrderText)}</textarea></div><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><label class="mb-2 block text-sm font-semibold text-slate-900">VIS Text</label><textarea id="audit-vis" class="textarea-soft w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[var(--brand)]" placeholder="Paste Vehicle Information System text here...">${escapeHtml(state.auditInputs.visText)}</textarea></div><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><label class="mb-2 block text-sm font-semibold text-slate-900">STUI CSV Text</label><textarea id="audit-stui" class="textarea-soft w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[var(--brand)]" placeholder="Paste STUI CSV text here...">${escapeHtml(state.auditInputs.stuiCsvText)}</textarea><div class="mt-3 flex flex-wrap gap-2"><button id="audit-load-stui-btn" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50">Load Sample STUI</button><button id="audit-clear-stui-btn" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50">Clear STUI</button></div></div><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><label class="mb-2 block text-sm font-semibold text-slate-900">Parts Invoice / Parts Notes</label><textarea id="audit-parts" class="textarea-soft w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[var(--brand)]" placeholder="Paste parts invoice text or parts manager notes here...">${escapeHtml(state.auditInputs.partsText)}</textarea></div><div class="grid grid-cols-2 gap-2"><button id="run-claim-audit-btn" class="rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-900">Run Audit</button><button id="clear-claim-audit-btn" class="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Clear Inputs</button></div>${state.claimAuditExamples.length ? `<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm font-semibold text-slate-900">Permanent Examples</div><div class="mt-2 space-y-2">${state.claimAuditExamples.map((item) => `<button class="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-white" data-claim-audit-example="${escapeHtml(item.key)}"><div class="font-medium">${escapeHtml(item.label)}</div><div class="mt-1 text-xs text-slate-500">${escapeHtml(item.scenario_summary)}</div></button>`).join("")}</div></div>` : ""}</div>`;
      els.centerPanelHeader.innerHTML = `<div class="flex items-center justify-between gap-3"><h2 class="text-sm font-semibold text-slate-700">Claim Audit Results</h2>${hasResult ? `<button id="copy-audit-summary-btn" type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50">Copy Summary</button>` : ""}</div>`;
      if (!hasResult) {
        els.centerPanel.innerHTML = `<div class="p-5">${renderPlaceholderCard("Run the claim audit", "Paste the materials on the left, then run the audit. The result will flag hard stops, warnings, informational notes, extracted values, and next steps.")}</div>`;
      } else {
        const audit = state.selectedAuditResult;
        const hardStops = audit.issues.filter((issue) => issue.severity === "hard_stop");
        const warnings = audit.issues.filter((issue) => issue.severity === "warning");
        const infos = audit.issues.filter((issue) => issue.severity === "info");
        els.centerPanel.innerHTML = `<div class="space-y-4 p-5"><div class="grid gap-4 md:grid-cols-4"><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-xs uppercase tracking-wide text-slate-500">Readiness</div><div class="mt-2 text-xl font-bold text-slate-900">${escapeHtml(audit.summary.readiness)}</div></div><div class="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm"><div class="text-xs uppercase tracking-wide text-red-700">Hard Stops</div><div class="mt-2 text-xl font-bold text-red-900">${audit.summary.hardStopCount}</div></div><div class="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm"><div class="text-xs uppercase tracking-wide text-amber-700">Warnings</div><div class="mt-2 text-xl font-bold text-amber-900">${audit.summary.warningCount}</div></div><div class="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm"><div class="text-xs uppercase tracking-wide text-slate-500">VIN / RO</div><div class="mt-2 text-sm font-semibold text-slate-900">${escapeHtml(audit.summary.vin || "—")}</div><div class="text-xs text-slate-500">RO ${escapeHtml(audit.summary.claimRoNumber || "—")}</div></div></div><div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm font-semibold text-slate-900">Recommended Final Values</div><div class="mt-3 grid gap-3 md:grid-cols-3"><div class="rounded-xl bg-slate-50 p-3"><div class="text-xs text-slate-500">Claim Type</div><div class="mt-1 text-sm font-semibold text-slate-900">${escapeHtml(selectedType?.label || audit.summary.claimType || "—")}</div></div><div class="rounded-xl bg-slate-50 p-3"><div class="text-xs text-slate-500">Recommended Final Mileage</div><div class="mt-1 text-sm font-semibold text-slate-900">${escapeHtml(audit.summary.recommendedFinalMileage || "—")}</div></div><div class="rounded-xl bg-slate-50 p-3"><div class="text-xs text-slate-500">Latest STUI Event</div><div class="mt-1 text-sm font-semibold text-slate-900">${escapeHtml(audit.extracted?.stui?.latestCreateDate || "—")}</div></div></div></div>${hardStops.length ? `<div><div class="mb-2 text-sm font-semibold text-red-700">Hard Stops</div><div class="space-y-3">${hardStops.map(renderIssueCard).join("")}</div></div>` : ""}${warnings.length ? `<div><div class="mb-2 text-sm font-semibold text-amber-700">Warnings</div><div class="space-y-3">${warnings.map(renderIssueCard).join("")}</div></div>` : ""}${infos.length ? `<div><div class="mb-2 text-sm font-semibold text-slate-700">Informational Notes</div><div class="space-y-3">${infos.map(renderIssueCard).join("")}</div></div>` : ""}<div class="grid gap-4 md:grid-cols-2"><div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm font-semibold text-slate-900">Questions To Confirm</div>${audit.questions?.length ? `<ul class="mt-3 space-y-2 text-sm text-slate-700">${audit.questions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p class="mt-3 text-sm text-slate-500">No additional questions were generated.</p>`}</div><div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm font-semibold text-slate-900">Suggested Corrections</div>${audit.suggestions?.length ? `<ul class="mt-3 space-y-2 text-sm text-slate-700">${audit.suggestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p class="mt-3 text-sm text-slate-500">No suggested corrections yet.</p>`}</div></div><div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm font-semibold text-slate-900">Extracted Comparison Snapshot</div><div class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><div class="rounded-xl bg-slate-50 p-3"><div class="text-xs text-slate-500">Claim Mileage Out</div><div class="mt-1 text-sm font-semibold text-slate-900">${escapeHtml(audit.extracted?.claimScreen?.mileageOut || "—")}</div></div><div class="rounded-xl bg-slate-50 p-3"><div class="text-xs text-slate-500">RO Mileage Out</div><div class="mt-1 text-sm font-semibold text-slate-900">${escapeHtml(audit.extracted?.repairOrder?.mileageOut || "—")}</div></div><div class="rounded-xl bg-slate-50 p-3"><div class="text-xs text-slate-500">STUI Latest Mileage</div><div class="mt-1 text-sm font-semibold text-slate-900">${escapeHtml(audit.extracted?.stui?.latestMileage || "—")}</div></div><div class="rounded-xl bg-slate-50 p-3"><div class="text-xs text-slate-500">Causal Part</div><div class="mt-1 text-sm font-semibold text-slate-900">${escapeHtml(audit.extracted?.claimScreen?.causalPartNumber || "—")}</div></div></div></div></div>`;
      }
      const claimTypeSelect = document.getElementById("audit-claim-type");
      if (claimTypeSelect) claimTypeSelect.addEventListener("change", (event) => { state.selectedClaimType = event.target.value; renderClaimAuditMode(); renderChatPanel(); });
      const runBtn = document.getElementById("run-claim-audit-btn");
      if (runBtn) runBtn.addEventListener("click", runClaimAudit);
      const clearBtn = document.getElementById("clear-claim-audit-btn");
      if (clearBtn) clearBtn.addEventListener("click", () => { state.auditInputs = { claimScreenText: "", repairOrderText: "", visText: "", stuiCsvText: "", partsText: "" }; state.selectedAuditResult = null; renderClaimAuditMode(); renderChatPanel(); });
      const loadStuiBtn = document.getElementById("audit-load-stui-btn");
      if (loadStuiBtn) loadStuiBtn.addEventListener("click", () => { state.auditInputs.stuiCsvText = state.defaultStuiCsv || state.auditInputs.stuiCsvText; renderClaimAuditMode(); showToast(state.defaultStuiCsv ? "Sample STUI loaded" : "No sample STUI file found"); });
      const clearStuiBtn = document.getElementById("audit-clear-stui-btn");
      if (clearStuiBtn) clearStuiBtn.addEventListener("click", () => { state.auditInputs.stuiCsvText = ""; renderClaimAuditMode(); });
      document.querySelectorAll("[data-claim-audit-example]").forEach((button) => button.addEventListener("click", () => {
        const example = state.claimAuditExamples.find((item) => item.key === button.dataset.claimAuditExample);
        if (!example) return;
        state.selectedClaimType = example.claim_type || state.selectedClaimType;
        state.auditInputs.partsText = `Example summary: ${example.scenario_summary}\nExpected findings: ${(example.expected_findings || []).join(", ")}\nNotes: ${(example.notes || []).join(" | ")}`;
        renderClaimAuditMode();
        showToast("Example notes loaded into Parts / Notes field");
      }));
      const copyAuditSummaryBtn = document.getElementById("copy-audit-summary-btn");
      if (copyAuditSummaryBtn && state.selectedAuditResult) {
        copyAuditSummaryBtn.addEventListener("click", () => {
          const audit = state.selectedAuditResult;
          const text = [
            `Readiness: ${audit.summary.readiness}`,
            `VIN: ${audit.summary.vin || ""}`,
            `RO: ${audit.summary.claimRoNumber || ""}`,
            `Hard Stops: ${audit.summary.hardStopCount}`,
            `Warnings: ${audit.summary.warningCount}`,
            `Info: ${audit.summary.infoCount}`,
            "",
            ...audit.issues.map((issue) => `${issue.code} [${issue.severity}] - ${issue.title}: ${issue.message}`),
            "",
            "Questions:",
            ...(audit.questions || []),
            "",
            "Suggestions:",
            ...(audit.suggestions || [])
          ].join("\n");
          copyTextToClipboard(text, "Audit summary copied");
        });
      }
    }

    async function runClaimAudit() {
      const claimScreenText = document.getElementById("audit-claim-screen")?.value || state.auditInputs.claimScreenText;
      const repairOrderText = document.getElementById("audit-ro")?.value || state.auditInputs.repairOrderText;
      const visText = document.getElementById("audit-vis")?.value || state.auditInputs.visText;
      const stuiCsvText = document.getElementById("audit-stui")?.value || state.auditInputs.stuiCsvText;
      const partsText = document.getElementById("audit-parts")?.value || state.auditInputs.partsText;
      state.auditInputs = { claimScreenText, repairOrderText, visText, stuiCsvText, partsText };
      try {
        const response = await fetch("/api/claim-audit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            claimType: state.selectedClaimType,
            claimScreenText,
            repairOrderText,
            visText,
            stuiCsvText,
            partsText,
            auditRules: state.claimAuditRules,
            auditFieldMap: state.claimAuditFieldMap,
            claimTypeContext: getSelectedClaimType(),
            portalSchemaContext: getSelectedPortalSchema()
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) throw new Error(data?.error || `Audit request failed with status ${response.status}`);
        state.selectedAuditResult = data;
        renderClaimAuditMode();
        renderChatPanel();
        showToast(data.summary?.hardStopCount ? "Audit found hard stops" : data.summary?.warningCount ? "Audit completed with warnings" : "Audit completed");
        if (window.innerWidth < 1280) setCompactView("center");
      } catch (error) {
        console.error(error);
        showToast("Audit failed");
        state.chatHistory.push({ role: "model", text: `⚠️ The claim audit failed. ${error.message}` });
        renderChatPanel();
      }
    }

    function renderCoverageMode() {
      const categories = state.coverageGuide?.coverage_categories || [];
      if (!state.selectedCoverageCategory && categories.length) state.selectedCoverageCategory = categories[0].key;
      const selected = categories.find((item) => item.key === state.selectedCoverageCategory) || null;
      els.leftPanelHeader.innerHTML = `<div class="mb-3 flex items-center justify-between gap-3"><h2 class="text-sm font-semibold text-slate-700">Coverage Guide</h2></div><p class="text-xs text-slate-500">Normalized coverage categories from the coverage guide.</p>`;
      els.leftPanel.innerHTML = categories.length ? categories.map((category) => `<button class="mb-2 w-full rounded-xl border px-3 py-3 text-left ${category.key === state.selectedCoverageCategory ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}" data-coverage-category="${escapeHtml(category.key)}"><div class="font-semibold">${escapeHtml(category.label)}</div><div class="mt-1 text-xs opacity-80">${escapeHtml(category.description || "")}</div></button>`).join("") : `<div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No coverage categories were loaded.</div>`;
      els.centerPanelHeader.innerHTML = `<div class="flex items-center justify-between gap-3"><h2 class="text-sm font-semibold text-slate-700">Coverage Lookup</h2></div>`;
      if (!selected) {
        els.centerPanel.innerHTML = `<div class="p-5">${renderPlaceholderCard("Coverage mode ready", "Use this mode for component coverage, time and mileage limits, ownership rules, and exceptions as coverageGuide.json grows.")}</div>`;
      } else {
        els.centerPanel.innerHTML = `<div class="p-5"><div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div class="text-sm text-slate-500">Selected Category</div><h2 class="mt-1 text-2xl font-bold text-slate-900">${escapeHtml(selected.label)}</h2><p class="mt-3 text-sm text-slate-600">${escapeHtml(selected.description || "")}</p>${selected.items?.length ? `<div class="mt-5 space-y-3">${selected.items.map((item) => `<div class="rounded-xl border border-slate-200 bg-slate-50 p-4"><div class="text-sm font-semibold text-slate-900">${escapeHtml(item.component_label || item.component_key || "Coverage Item")}</div><p class="mt-2 text-sm text-slate-700">${escapeHtml(item.coverage_summary || "")}</p></div>`).join("")}</div>` : `<div class="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">This category is scaffolded but does not have normalized items yet.</div>`}</div></div>`;
      }
      els.leftPanel.querySelectorAll("[data-coverage-category]").forEach((button) => button.addEventListener("click", () => { state.selectedCoverageCategory = button.dataset.coverageCategory; renderCoverageMode(); renderChatPanel(); if (window.innerWidth < 1280) setCompactView("center"); }));
      els.rightPanelHeader.innerHTML = `<div class="flex items-center justify-between gap-3"><h2 class="text-sm font-semibold text-slate-700">Coverage Notes</h2></div>`;
      els.rightPanel.innerHTML = `<div class="p-4"><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm font-semibold text-slate-900">Planned use</div><p class="mt-2 text-sm text-slate-600">This mode is for coverage duration, ownership sensitivity, exclusions, and component-specific exceptions once the guide is fully normalized.</p></div></div>`;
    }

    function renderApp() {
      syncWorkspaceTabs();
      switch (state.mode) {
        case APP_MODES.CHECKLIST: renderChecklistMode(); break;
        case APP_MODES.CLAIM_TYPES: renderClaimTypesMode(); break;
        case APP_MODES.ENTRY_MAP: renderEntryMapMode(); break;
        case APP_MODES.VALIDATOR: renderValidatorMode(); break;
        case APP_MODES.ERROR_FIX: renderErrorFixMode(); break;
        case APP_MODES.CLAIM_AUDIT: renderClaimAuditMode(); break;
        case APP_MODES.COVERAGE: renderCoverageMode(); break;
        case APP_MODES.POLICY:
        default: renderPolicyMode(); break;
      }
      renderChatPanel();
      updateResponsivePanels();
    }

    function scoreSectionMatch(sec, question) {
      const qNorm = normalizeForMatch(question);
      const qTokens = tokenizeForMatch(question);
      if (!qNorm) return 0;
      const number = normalizeForMatch(sec.section_id);
      const title = normalizeForMatch(sec.title);
      const content = normalizeForMatch(sec.raw_content);
      let score = 0;
      const isDirectLookup = (number && qNorm === number) || (number && qNorm === `section ${number}`) || qTokens.includes(number);
      if (isDirectLookup) score += 300;
      if (title && qNorm === title) score += 180;
      if (title && title.includes(qNorm) && qNorm.length >= 3) score += 120;
      let tokenHits = 0;
      for (const token of qTokens) {
        let matched = false;
        if (number === token) { score += 150; matched = true; } else if (number.includes(token)) { score += 45; matched = true; }
        if (title === token) { score += 100; matched = true; } else if (title.includes(token)) { score += 24; matched = true; }
        if (content.includes(token)) { score += 5; matched = true; }
        if (matched) tokenHits += 1;
      }
      if (qTokens.length > 0) { score += tokenHits * 8; if (tokenHits === qTokens.length) score += 30; }
      return score;
    }

    function findMatchingSections(question) {
      const ranked = state.policies.map((sec) => ({ sec, score: scoreSectionMatch(sec, question) })).filter((item) => item.score >= 20).sort((a, b) => b.score - a.score);
      if (!ranked.length) return [];
      const topScore = ranked[0].score;
      const secondScore = ranked[1]?.score ?? 0;
      if (topScore >= 60 && topScore - secondScore >= 35) return [ranked[0].sec];
      const floor = Math.max(20, Math.floor(topScore * 0.55));
      return ranked.filter((item, index) => index < 6 && item.score >= floor).map((item) => item.sec);
    }

    async function sendMessage() {
      const chatInput = document.getElementById("chat-input");
      const message = normalizeText(chatInput?.value);
      if (!message || !state.manualLoaded || state.sending) return;
      state.chatHistory.push({ role: "user", text: message });
      if (chatInput) chatInput.value = "";
      state.sending = true;
      if (window.innerWidth < 1280) setCompactView("right");
      renderChatPanel();
      try {
        const selectedSection = state.mode === APP_MODES.POLICY ? getSelectedSection() : null;
        const matchedSections = state.mode === APP_MODES.POLICY ? findMatchingSections(message) : [];
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message,
            mode: state.mode,
            selectedSection,
            relevantSections: matchedSections,
            selectedClaimType: state.selectedClaimType,
            selectedChecklistGroup: state.selectedChecklistGroup,
            selectedPortalSection: state.selectedPortalSection,
            selectedErrorCode: state.selectedErrorCode,
            selectedClaimTypeContext: getSelectedClaimType(),
            selectedChecklistContext: getSelectedChecklistContext(),
            selectedPortalSectionContext: getSelectedPortalSectionContext(),
            selectedErrorRuleContext: getSelectedErrorRule(),
            selectedAuditContext: getSelectedAuditContext(),
            matchingMeta: { matchedCount: matchedSections.length, autoSelected: false },
            history: state.chatHistory.slice(-8)
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || `Request failed with status ${response.status}`);
        const answer = normalizeText(data.answer) || "I’m sorry, I could not generate a response.";
        state.chatHistory.push({ role: "model", text: answer });
      } catch (error) {
        console.error(error);
        state.chatHistory.push({ role: "model", text: `⚠️ Sorry, I hit an error while checking the loaded libraries. ${error.message}` });
      } finally {
        state.sending = false;
        renderChatPanel();
        const nextInput = document.getElementById("chat-input");
        if (nextInput) nextInput.focus();
      }
    }

    function usePrompt(prompt) {
      const text = normalizeText(prompt);
      if (!text) return;
      const chatInput = document.getElementById("chat-input");
      if (chatInput) chatInput.value = text;
      if (window.innerWidth < 1280) setCompactView("right");
      sendMessage();
    }

    function clearChat() {
      state.chatHistory = [{ role: "model", text: state.manualLoaded ? "Chat cleared. Ask me about policy, checklist, claim types, portal sections, claim audit, or returned-claim errors." : "Chat cleared. I’ll be ready once the libraries finish loading." }];
      renderChatPanel();
    }

    function bindGlobalEvents() {
      document.addEventListener("click", (event) => {
        const workspaceBtn = event.target.closest("[data-workspace-mode]");
        if (workspaceBtn) { setMode(workspaceBtn.dataset.workspaceMode); return; }
        const compactTab = event.target.closest("[data-compact-view]");
        if (compactTab) { setCompactView(compactTab.dataset.compactView); return; }
        const sectionLink = event.target.closest("[data-select-section]");
        if (sectionLink) { state.mode = APP_MODES.POLICY; state.selectedSectionId = sectionLink.dataset.selectSection; renderApp(); if (window.innerWidth < 1280) setCompactView("center"); return; }
        const promptButton = event.target.closest("[data-prompt]");
        if (promptButton) { usePrompt(promptButton.dataset.prompt); return; }
        const copyChatButton = event.target.closest("[data-copy-chat-index]");
        if (copyChatButton) { const index = Number(copyChatButton.dataset.copyChatIndex); const item = state.chatHistory[index]; if (item?.text) copyTextToClipboard(item.text, "Response copied"); return; }
        const copySectionButton = event.target.closest("[data-copy-section]");
        if (copySectionButton) { copyTextToClipboard(copySectionButton.dataset.copySection, "Copied"); return; }
      });
      document.addEventListener("keydown", (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          if (state.mode === APP_MODES.POLICY) {
            const input = document.getElementById("policy-search-input");
            if (window.innerWidth < 1280) setCompactView("left");
            if (input) input.focus();
          }
        }
      });
      window.addEventListener("resize", updateResponsivePanels);
    }

    function init() {
      bindGlobalEvents();
      updateResponsivePanels();
      renderApp();
      loadLibraries();
    }

    init();
  
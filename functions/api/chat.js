const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_HISTORY_MESSAGES = 10;
const MAX_TEXT_CHARS = 4000;
const MAX_LONG_TEXT_CHARS = 10000;
const MAX_ARRAY_ITEMS = 40;

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders
    }
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeText(value, max = MAX_TEXT_CHARS) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function sanitizeSimpleValue(value, max = MAX_TEXT_CHARS) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return sanitizeText(value, max);
  }
  return sanitizeText(JSON.stringify(value), max);
}

function sanitizeArray(value, itemMax = 1000, maxItems = MAX_ARRAY_ITEMS) {
  if (!Array.isArray(value)) {
    if (value === null || value === undefined || value === "") return [];
    return [sanitizeSimpleValue(value, itemMax)];
  }

  return value
    .slice(0, maxItems)
    .map((item) => sanitizeSimpleValue(item, itemMax))
    .filter(Boolean);
}

function sanitizeObjectMap(obj, valueMax = 500, maxItems = MAX_ARRAY_ITEMS) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};

  return Object.fromEntries(
    Object.entries(obj)
      .slice(0, maxItems)
      .map(([key, value]) => [sanitizeText(key, 120), sanitizeSimpleValue(value, valueMax)])
  );
}

function pickContextSection(section) {
  if (!section || typeof section !== "object") return null;

  const picked = {
    section_id: sanitizeText(section.section_id, 80),
    title: sanitizeText(section.title, 250),
    raw_content: sanitizeText(section.raw_content, MAX_LONG_TEXT_CHARS),
    eligibility_conditions: sanitizeArray(section.eligibility_conditions, 500),
    coverage_and_reimbursement: sanitizeArray(section.coverage_and_reimbursement || section.coverage_details, 800),
    not_covered: sanitizeArray(section.not_covered || section.exclusions, 800),
    payment_limitations: sanitizeArray(section.payment_limitations, 500),
    dealer_actions: sanitizeArray(section.dealer_actions, 800),
    documents_required: sanitizeArray(section.documents_required, 500),
    systems: sanitizeArray(section.systems || section.systems_referenced, 300),
    system_screens: sanitizeArray(section.system_screens, 300),
    comment_requirements: sanitizeArray(section.comment_requirements, 500),
    timing_rules: sanitizeArray(section.timing_rules, 500),
    claim_processing_risks: sanitizeArray(section.claim_processing_risks, 500),
    roles_explicitly_mentioned: sanitizeArray(section.roles_explicitly_mentioned, 200),
    source_pdf_pages: sanitizeArray(section.source_pdf_pages || section.source_pages, 100)
  };

  return picked.section_id || picked.title ? picked : null;
}

function pickClaimTypeContext(item) {
  if (!item || typeof item !== "object") return null;

  return {
    key: sanitizeText(item.key, 80),
    label: sanitizeText(item.label, 150),
    category: sanitizeText(item.category, 120),
    screen_name: sanitizeText(item.screen_name, 150),
    description: sanitizeText(item.description, 1000),
    portal_path: sanitizeArray(item.portal_path, 200),
    when_to_use: sanitizeArray(item.when_to_use, 500),
    required_groups: sanitizeArray(item.required_groups, 200),
    related_workflows: sanitizeArray(item.related_workflows, 300),
    source_sections: sanitizeArray(item.source_sections, 120),
    audit_profile: item.audit_profile && typeof item.audit_profile === "object"
      ? {
          required_documents: sanitizeArray(item.audit_profile.required_documents, 200),
          recommended_documents: sanitizeArray(item.audit_profile.recommended_documents, 200),
          common_failure_modes: sanitizeArray(item.audit_profile.common_failure_modes, 200)
        }
      : null
  };
}

function pickChecklistContext(item) {
  if (!item || typeof item !== "object") return null;

  const out = {
    key: sanitizeText(item.key, 120),
    label: sanitizeText(item.label, 150)
  };

  if (Array.isArray(item.items)) {
    out.items = sanitizeArray(item.items, 600);
  } else if (item.items && typeof item.items === "object") {
    out.items = Object.fromEntries(
      Object.entries(item.items)
        .slice(0, MAX_ARRAY_ITEMS)
        .map(([key, value]) => [sanitizeText(key, 120), sanitizeArray(value, 600)])
    );
  } else {
    out.items = [];
  }

  return out;
}

function pickPortalSectionContext(item) {
  if (!item || typeof item !== "object") return null;

  return {
    claim_type: sanitizeText(item.claim_type, 80),
    section_key: sanitizeText(item.section_key, 120),
    label: sanitizeText(item.label, 150),
    repeatable: Boolean(item.repeatable),
    max_rows: item.max_rows ?? item.max_lines ?? null,
    max_file_size_mb: item.max_file_size_mb ?? null,
    restricted_characters_note: sanitizeText(item.restricted_characters_note, 1000),
    allowed_categories: sanitizeArray(item.allowed_categories, 200),
    system_generated_examples: sanitizeArray(item.system_generated_examples, 300),
    character_limits: sanitizeObjectMap(item.character_limits, 120),
    fields: Array.isArray(item.fields)
      ? item.fields.slice(0, MAX_ARRAY_ITEMS).map((field) => ({
          key: sanitizeText(field?.key, 120),
          label: sanitizeText(field?.label, 150),
          type: sanitizeText(field?.type, 80),
          required: Boolean(field?.required),
          max_length: field?.max_length ?? null
        }))
      : []
  };
}

function pickErrorRuleContext(item) {
  if (!item || typeof item !== "object") return null;

  return {
    code: sanitizeText(item.code, 80),
    claim_type: sanitizeText(item.claim_type, 80),
    category: sanitizeText(item.category, 120),
    severity: sanitizeText(item.severity, 80),
    screen: sanitizeText(item.screen, 150),
    message: sanitizeText(item.message, 500),
    meaning: sanitizeText(item.meaning, 1200),
    likely_problem_areas: sanitizeArray(item.likely_problem_areas, 400),
    validation_checks: sanitizeArray(item.validation_checks, 500),
    recommended_fix_steps: sanitizeArray(item.recommended_fix_steps, 600),
    dealer_reply_needed: Boolean(item.dealer_reply_needed)
  };
}

function pickAuditContext(item) {
  if (!item || typeof item !== "object") return null;

  return {
    summary: item.summary && typeof item.summary === "object"
      ? {
          readiness: sanitizeText(item.summary.readiness, 50),
          hardStopCount: Number(item.summary.hardStopCount || 0),
          warningCount: Number(item.summary.warningCount || 0),
          infoCount: Number(item.summary.infoCount || 0),
          claimType: sanitizeText(item.summary.claimType, 50),
          vin: sanitizeText(item.summary.vin, 40),
          claimRoNumber: sanitizeText(item.summary.claimRoNumber, 50),
          recommendedFinalMileage: sanitizeSimpleValue(item.summary.recommendedFinalMileage, 50)
        }
      : null,
    issues: Array.isArray(item.issues)
      ? item.issues.slice(0, MAX_ARRAY_ITEMS).map((issue) => ({
          code: sanitizeText(issue?.code, 80),
          severity: sanitizeText(issue?.severity, 80),
          title: sanitizeText(issue?.title, 200),
          message: sanitizeText(issue?.message, 1000),
          recommendedAction: sanitizeText(issue?.recommendedAction, 800),
          sources: sanitizeArray(issue?.sources, 120)
        }))
      : [],
    questions: sanitizeArray(item.questions, 600),
    suggestions: sanitizeArray(item.suggestions, 600)
  };
}

function dedupeSections(sections) {
  const seen = new Set();
  const out = [];

  for (const sec of sections) {
    if (!sec) continue;
    const key = `${sec.section_id || ""}|${sec.title || ""}`;
    if (!key.trim() || seen.has(key)) continue;
    seen.add(key);
    out.push(sec);
  }

  return out;
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];

  const cleaned = [];
  for (const msg of history) {
    const role = msg?.role === "model" ? "model" : "user";
    const text = sanitizeText(msg?.text, MAX_LONG_TEXT_CHARS);
    if (!text) continue;

    if (cleaned.length > 0 && cleaned[cleaned.length - 1].role === role) {
      cleaned[cleaned.length - 1].parts[0].text += `\n\n${text}`;
    } else {
      cleaned.push({ role, parts: [{ text }] });
    }
  }

  while (cleaned.length && cleaned[0].role !== "user") {
    cleaned.shift();
  }

  return cleaned.slice(-MAX_HISTORY_MESSAGES);
}

function sanitizeMatchingMeta(meta) {
  return {
    matchedCount: Number(meta?.matchedCount || 0),
    autoSelected: Boolean(meta?.autoSelected)
  };
}

function buildSystemPrompt({
  mode,
  selectedSection,
  relevantSections,
  matchingMeta,
  selectedClaimType,
  selectedChecklistGroup,
  selectedPortalSection,
  selectedErrorCode,
  selectedClaimTypeContext,
  selectedChecklistContext,
  selectedPortalSectionContext,
  selectedErrorRuleContext,
  selectedAuditContext
}) {
  const context = {
    mode: mode || "policy",
    selected_claim_type: selectedClaimType || null,
    selected_checklist_group: selectedChecklistGroup || null,
    selected_portal_section: selectedPortalSection || null,
    selected_error_code: selectedErrorCode || null,
    selected_claim_type_context: selectedClaimTypeContext || null,
    selected_checklist_context: selectedChecklistContext || null,
    selected_portal_section_context: selectedPortalSectionContext || null,
    selected_error_rule_context: selectedErrorRuleContext || null,
    selected_audit_context: selectedAuditContext || null,
    selected_section: selectedSection || null,
    relevant_sections: relevantSections || [],
    matching_meta: matchingMeta || { matchedCount: 0, autoSelected: false }
  };

  return [
    "You are an expert Hyundai Warranty Administrator.",
    "You help with warranty policy interpretation, claim requirements, claim types, portal field mapping, claim audit review, validator guidance, and returned-claim error resolution.",
    "Base your answers strictly on the provided context.",
    "Do not invent coverages, exclusions, limits, documentation, portal fields, workflows, or correction steps that are not supported by the context.",
    "",
    "MODE RULES:",
    "- If mode is 'policy', focus on selected_section and relevant_sections from the warranty policy manual.",
    "- If mode is 'checklist', focus on required documentation, attachments, audit support, and special requirements.",
    "- If mode is 'claim_types', focus on selected_claim_type_context and explain when to use that claim type.",
    "- If mode is 'entry_map', focus on selected_portal_section_context and explain the portal section and fields.",
    "- If mode is 'validator', explain what appears missing or should be reviewed based on the selected claim type or portal section context.",
    "- If mode is 'error_fix', explain the error code, likely causes, validation checks, and fix steps from selected_error_rule_context.",
    "- If mode is 'claim_audit', focus on selected_audit_context. Prioritize hard stops first, then warnings, then next actions.",
    "- If mode is 'coverage', explain coverage only from the provided coverage or policy context.",
    "",
    "RESPONSE RULES:",
    "- Answer the user directly first.",
    "- Use short bullets for requirements, limits, discrepancies, or fix steps.",
    "- Clearly distinguish hard stops, warnings, and informational notes when discussing claim audit.",
    "- If selected_section is present, treat it as primary context in policy mode.",
    "- If selected_audit_context is present, do not contradict it unless the user asks you to challenge it; instead explain what it means and what to do next.",
    "- If the user asks a comparison question, compare only from the provided context. If the context is incomplete, say that plainly.",
    "- When helpful, cite section numbers, claim type names, portal section names, error codes, or audit issue codes from the context.",
    "- If context is insufficient, say so plainly.",
    "",
    "CONTEXT:",
    JSON.stringify(context, null, 2)
  ].join("\n");
}

async function callGeminiWithRetry(url, payload) {
  const delays = [800, 1600, 3200];

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (networkError) {
      if (attempt === delays.length) {
        throw new Error(`Network error calling Gemini: ${networkError.message}`);
      }
      await sleep(delays[attempt]);
      continue;
    }

    if (response.ok) {
      return response;
    }

    const retriable = response.status === 429 || response.status >= 500;
    if (!retriable || attempt === delays.length) {
      let errorMessage = "No response body";
      try {
        const errorJson = await response.json();
        errorMessage = errorJson.error?.message || JSON.stringify(errorJson);
      } catch {
        errorMessage = await response.text().catch(() => "");
      }
      throw new Error(`Gemini request failed (${response.status}): ${errorMessage}`);
    }

    await sleep(delays[attempt]);
  }

  throw new Error("Gemini request failed after retries.");
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    if (!env.GEMINI_API_KEY) {
      return json({ error: "Missing GEMINI_API_KEY secret in Cloudflare Pages settings." }, 500);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body." }, 400);
    }

    const message = sanitizeText(body?.message, MAX_LONG_TEXT_CHARS);
    if (!message) {
      return json({ error: "Message is required." }, 400);
    }

    const mode = sanitizeText(body?.mode, 50) || "policy";
    const selectedClaimType = sanitizeText(body?.selectedClaimType, 80);
    const selectedChecklistGroup = sanitizeText(body?.selectedChecklistGroup, 120);
    const selectedPortalSection = sanitizeText(body?.selectedPortalSection, 120);
    const selectedErrorCode = sanitizeText(body?.selectedErrorCode, 120);

    const selectedSection = pickContextSection(body?.selectedSection);
    const relevantSections = dedupeSections(
      (Array.isArray(body?.relevantSections) ? body.relevantSections : [])
        .map((item) => pickContextSection(item))
        .filter(Boolean)
        .slice(0, 8)
    );

    const selectedClaimTypeContext = pickClaimTypeContext(body?.selectedClaimTypeContext);
    const selectedChecklistContext = pickChecklistContext(body?.selectedChecklistContext);
    const selectedPortalSectionContext = pickPortalSectionContext(body?.selectedPortalSectionContext);
    const selectedErrorRuleContext = pickErrorRuleContext(body?.selectedErrorRuleContext);
    const selectedAuditContext = pickAuditContext(body?.selectedAuditContext);
    const matchingMeta = sanitizeMatchingMeta(body?.matchingMeta);

    const systemPrompt = buildSystemPrompt({
      mode,
      selectedSection,
      relevantSections,
      matchingMeta,
      selectedClaimType,
      selectedChecklistGroup,
      selectedPortalSection,
      selectedErrorCode,
      selectedClaimTypeContext,
      selectedChecklistContext,
      selectedPortalSectionContext,
      selectedErrorRuleContext,
      selectedAuditContext
    });

    let history = sanitizeHistory(body?.history);
    if (!history.length || history[history.length - 1]?.parts?.[0]?.text !== message) {
      history.push({ role: "user", parts: [{ text: message }] });
    }
    history = history.slice(-MAX_HISTORY_MESSAGES);

    const model = sanitizeText(env.GEMINI_MODEL || DEFAULT_MODEL, 100);
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

    const payload = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: history,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1600
      }
    };

    const geminiResponse = await callGeminiWithRetry(endpoint, payload);
    const geminiData = await geminiResponse.json();
    const candidate = geminiData?.candidates?.[0];
    const finishReason = candidate?.finishReason || "";
    const answer = candidate?.content?.parts?.map((part) => part?.text || "").join("").trim() || "";

    if (!answer) {
      const blockReason = geminiData?.promptFeedback?.blockReason || finishReason || "No text returned";
      return json({ error: `Gemini returned no answer. Reason: ${blockReason}` }, 502);
    }

    return json({
      answer,
      finishReason,
      mode,
      selectedClaimType,
      selectedChecklistGroup,
      selectedPortalSection,
      selectedErrorCode
    });
  } catch (error) {
    return json({ error: error?.message || "Unexpected server error." }, 500);
  }
}

export async function onRequestGet(context) {
  const model = context?.env?.GEMINI_MODEL || DEFAULT_MODEL;
  return json({ ok: true, route: "/api/chat", model });
}

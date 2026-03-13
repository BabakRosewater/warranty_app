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
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
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
      .map(([key, value]) => [
        sanitizeText(key, 120),
        sanitizeSimpleValue(value, valueMax)
      ])
  );
}

function pickContextSection(section) {
  if (!section || typeof section !== "object") return null;

  const picked = {
    section_id: sanitizeText(section.section_id, 80),
    title: sanitizeText(section.title, 250),
    raw_content: sanitizeText(section.raw_content, MAX_LONG_TEXT_CHARS),

    eligibility_conditions: sanitizeArray(section.eligibility_conditions, 500),
    coverage_and_reimbursement: sanitizeArray(
      section.coverage_and_reimbursement || section.coverage_details,
      800
    ),
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

  if (!picked.section_id && !picked.title) return null;
  return picked;
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
    optional_groups: sanitizeArray(item.optional_groups, 200),
    common_required_fields: sanitizeArray(item.common_required_fields, 200),
    common_attachments: sanitizeArray(item.common_attachments, 200),
    related_workflows: sanitizeArray(item.related_workflows, 300),
    source_sections: sanitizeArray(item.source_sections, 120)
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
    notes: sanitizeArray(item.notes, 500),
    character_limits: sanitizeObjectMap(item.character_limits, 120),
    section_totals: Array.isArray(item.section_totals)
      ? item.section_totals.slice(0, MAX_ARRAY_ITEMS).map((field) => ({
          key: sanitizeText(field?.key, 120),
          label: sanitizeText(field?.label, 150),
          type: sanitizeText(field?.type, 80)
        }))
      : [],
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
    related_sections: sanitizeArray(item.related_sections, 200),
    dealer_reply_needed: Boolean(item.dealer_reply_needed)
  };
}

function pickCoverageContext(item) {
  if (!item || typeof item !== "object") return null;

  return {
    key: sanitizeText(item.key, 120),
    label: sanitizeText(item.label, 180),
    category: sanitizeText(item.category, 120),
    summary: sanitizeText(item.summary, 1500),
    source_sections: sanitizeArray(item.source_sections, 120),
    applies_to: sanitizeArray(item.applies_to, 500),
    core_coverage: sanitizeArray(item.core_coverage, 700),
    limits: Array.isArray(item.limits)
      ? item.limits.slice(0, MAX_ARRAY_ITEMS).map((limit) => ({
          type: sanitizeText(limit?.type, 120),
          value: sanitizeText(limit?.value, 300),
          notes: sanitizeText(limit?.notes, 600)
        }))
      : [],
    transferability: sanitizeArray(item.transferability, 500),
    not_covered: sanitizeArray(item.not_covered, 700),
    claim_notes: sanitizeArray(item.claim_notes, 700)
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
      cleaned.push({
        role,
        parts: [{ text }]
      });
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
  selectedCoverageKey,
  selectedClaimTypeContext,
  selectedChecklistContext,
  selectedPortalSectionContext,
  selectedErrorRuleContext,
  selectedCoverageContext
}) {
  const context = {
    mode: mode || "policy",
    selected_claim_type: selectedClaimType || null,
    selected_checklist_group: selectedChecklistGroup || null,
    selected_portal_section: selectedPortalSection || null,
    selected_error_code: selectedErrorCode || null,
    selected_coverage_key: selectedCoverageKey || null,

    selected_claim_type_context: selectedClaimTypeContext || null,
    selected_checklist_context: selectedChecklistContext || null,
    selected_portal_section_context: selectedPortalSectionContext || null,
    selected_error_rule_context: selectedErrorRuleContext || null,
    selected_coverage_context: selectedCoverageContext || null,

    selected_section: selectedSection || null,
    relevant_sections: relevantSections || [],
    matching_meta: matchingMeta || { matchedCount: 0, autoSelected: false }
  };

  return [
    "You are an expert Hyundai Warranty Administrator.",
    "You help with warranty policy interpretation, claim requirements, claim types, portal field mapping, validator guidance, returned-claim error resolution, and coverage explanation.",
    "Base your answers strictly on the context provided below.",
    "Do not invent coverages, exclusions, limits, documentation, portal fields, workflows, or correction steps that are not supported by the provided context.",
    "",
    "MODE RULES:",
    "- If mode is 'policy', focus on selected_section and relevant_sections from the warranty policy manual.",
    "- If mode is 'checklist', focus on selected_checklist_context and explain documentation, attachments, audit support, submission checklist items, and special requirements.",
    "- If mode is 'claim_types', focus on selected_claim_type_context and explain when to use that claim type, what screen it belongs to, what it is for, and how it differs from related workflows if supported by context.",
    "- If mode is 'entry_map', focus on selected_portal_section_context and explain what fields belong in that portal section, what is required, what is optional, and what the user should review before submitting.",
    "- If mode is 'validator', use selected_claim_type_context and selected_portal_section_context when available to explain what appears missing, what should be reviewed, and what the user should verify before submission.",
    "- If mode is 'error_fix', focus on selected_error_rule_context and explain the error code, meaning, likely causes, validation checks, and recommended correction steps before resubmission.",
    "- If mode is 'coverage', focus on selected_coverage_context and explain what is covered, what is excluded, ownership/transferability rules, and any time, mileage, or dollar limits supported by that context.",
    "",
    "RESPONSE RULES:",
    "- Answer the user directly first.",
    "- Use short bullet points when listing requirements, limits, exclusions, or fix steps.",
    "- Clearly distinguish covered vs not covered, required vs optional, and warning vs denial risk.",
    "- If selected_section is present, treat it as primary context in policy mode.",
    "- If selected_section is not present and relevant_sections contains exactly one section, treat that section as the intended policy.",
    "- If relevant_sections contains multiple sections, briefly summarize each and explain that more than one section may apply.",
    "- If the user asks about time, mileage, or dollar limits, state them explicitly if they exist in the provided context.",
    "- If claim_processing_risks are present, highlight them clearly.",
    "- If documents_required or comment_requirements are present, spell them out clearly so the dealer knows what to attach or type.",
    "- If the user asks a comparison question, compare only from the provided context. If the context is incomplete, say that plainly.",
    "- When helpful, cite section numbers, titles, claim type names, portal section names, error codes, or coverage category names from the context.",
    "- If the context is insufficient, say so plainly.",
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
        headers: {
          "content-type": "application/json"
        },
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
      return json(
        { error: "Missing GEMINI_API_KEY secret in Cloudflare Pages settings." },
        500
      );
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
    const selectedCoverageKey = sanitizeText(body?.selectedCoverageKey, 120);

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
    const selectedCoverageContext = pickCoverageContext(body?.selectedCoverageContext);

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
      selectedCoverageKey,
      selectedClaimTypeContext,
      selectedChecklistContext,
      selectedPortalSectionContext,
      selectedErrorRuleContext,
      selectedCoverageContext
    });

    let history = sanitizeHistory(body?.history);

    if (!history.length || history[history.length - 1]?.parts?.[0]?.text !== message) {
      history.push({
        role: "user",
        parts: [{ text: message }]
      });
    }

    history = history.slice(-MAX_HISTORY_MESSAGES);

    const model = sanitizeText(env.GEMINI_MODEL || DEFAULT_MODEL, 100);
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

    const payload = {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
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
    const answer =
      candidate?.content?.parts?.map((part) => part?.text || "").join("").trim() || "";

    if (!answer) {
      const blockReason =
        geminiData?.promptFeedback?.blockReason ||
        finishReason ||
        "No text returned";

      return json(
        { error: `Gemini returned no answer. Reason: ${blockReason}` },
        502
      );
    }

    return json({
      answer,
      finishReason,
      mode,
      selectedClaimType,
      selectedChecklistGroup,
      selectedPortalSection,
      selectedErrorCode,
      selectedCoverageKey
    });
  } catch (error) {
    return json(
      {
        error: error?.message || "Unexpected server error."
      },
      500
    );
  }
}

export async function onRequestGet(context) {
  const model = context?.env?.GEMINI_MODEL || DEFAULT_MODEL;

  return json({
    ok: true,
    route: "/api/chat",
    model
  });
}

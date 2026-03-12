const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_HISTORY_MESSAGES = 10;
const MAX_TEXT_CHARS = 4000;
const MAX_LONG_TEXT_CHARS = 8000;
const MAX_ARRAY_ITEMS = 15;

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

function pickContextSection(section) {
  if (!section || typeof section !== "object") return null;

  const picked = {
    section_id: sanitizeText(section.section_id, 80),
    title: sanitizeText(section.title, 250),
    raw_content: sanitizeText(section.raw_content, MAX_LONG_TEXT_CHARS),
    
    // Rich Relational Schema Fields
    eligibility_conditions: sanitizeArray(section.eligibility_conditions, 500),
    coverage_and_reimbursement: sanitizeArray(section.coverage_and_reimbursement || section.coverage_details, 800),
    not_covered: sanitizeArray(section.not_covered || section.exclusions, 800),
    payment_limitations: sanitizeArray(section.payment_limitations, 500),
    dealer_actions: sanitizeArray(section.dealer_actions, 800),
    documents_required: sanitizeArray(section.documents_required, 500),
    systems: sanitizeArray(section.systems, 300),
    system_screens: sanitizeArray(section.system_screens, 300),
    comment_requirements: sanitizeArray(section.comment_requirements, 500),
    timing_rules: sanitizeArray(section.timing_rules, 500),
    claim_processing_risks: sanitizeArray(section.claim_processing_risks, 500),
    roles_explicitly_mentioned: sanitizeArray(section.roles_explicitly_mentioned, 200),
    source_pdf_pages: sanitizeArray(section.source_pdf_pages || section.source_pages, 100)
  };

  if (!picked.section_id && !picked.title) {
    return null;
  }

  return picked;
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

function buildSystemPrompt({ selectedSection, relevantSections, matchingMeta }) {
  const context = {
    selected_section: selectedSection || null,
    relevant_sections: relevantSections || [],
    matching_meta: matchingMeta || { matchedCount: 0, autoSelected: false }
  };

  return [
    "You are an expert Warranty Administrator for the Hyundai Warranty Policy and Procedures Manual (2026).",
    "Base your answers strictly on the manual context provided below.",
    "Do not invent coverages, exclusions, time/mileage limits, or dealer procedures that are not supported by the context.",
    "If selected_section is present, treat it as the primary policy the user is asking about.",
    "If selected_section is not present and relevant_sections contains exactly one section, treat that section as the intended policy.",
    "If selected_section is not present and relevant_sections contains multiple sections, explain that multiple matching sections were found and briefly summarize each.",
    "When helpful, cite the section number, title, and clearly distinguish between what is covered vs. what is excluded.",
    "If the user asks about time, mileage, or dollar limits, explicitly state them if they exist in the context.",
    "Be practical, professional, direct, and concise.",
    "",
    "IMPORTANT RESPONSE BEHAVIOR:",
    "- First answer the user directly.",
    "- If multiple relevant sections are present, list them and summarize each one.",
    "- If the context details 'dealer_actions' or administrative steps, emphasize what the dealership personnel must do (e.g., forms, approvals).",
    "- If the context details 'timing_rules' or 'payment_limitations', explicitly highlight them for the user.",
    "- Emphasize 'documents_required' and 'comment_requirements' when explaining claim procedures.",
    "- Use bullet points for limits, coverages, and exclusions to make them highly readable.",
    "",
    "MANUAL CONTEXT:",
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

    const selectedSection = pickContextSection(body?.selectedSection);

    const relevantSections = dedupeSections(
      (Array.isArray(body?.relevantSections) ? body.relevantSections : [])
        .map((item) => pickContextSection(item))
        .filter(Boolean)
        .slice(0, 8)
    );

    const matchingMeta = sanitizeMatchingMeta(body?.matchingMeta);

    const systemPrompt = buildSystemPrompt({
      selectedSection,
      relevantSections,
      matchingMeta
    });

    let history = sanitizeHistory(body?.history);

    if (!history.length) {
      history = [
        {
          role: "user",
          parts: [{ text: message }]
        }
      ];
    }

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
        maxOutputTokens: 1400
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
      finishReason
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

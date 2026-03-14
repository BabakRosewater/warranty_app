const MAX_TEXT = 30000;

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

function sanitizeText(value, max = MAX_TEXT) {
  return String(value ?? "").replace(/\r/g, "").trim().slice(0, max);
}

function normalizeVin(value) {
  const vin = String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : "";
}

function normalizePart(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeMileage(value) {
  const num = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(num) && num > 0 ? Math.round(num) : null;
}

function normalizeDate(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const mdy = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return text;
}

function family5(value) {
  const part = normalizePart(value);
  return part.slice(0, 5);
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function parseLabeledValue(text, label, maxLen = 120) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`${escaped}\\s*[:#]?\\s*([A-Z0-9_\/-]{1,${maxLen}})`, "i"),
    new RegExp(`${escaped}\\s*[\n\t ]+([^\n]{1,${maxLen}})`, "i")
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function parseAllMatches(text, regex) {
  const out = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    out.push(match[1] || match[0]);
  }
  return unique(out);
}

function parseClaimScreen(text) {
  const source = sanitizeText(text);
  const vin = normalizeVin(parseLabeledValue(source, "VIN", 30));
  const roNumber = parseLabeledValue(source, "R.O. #", 30).replace(/[^A-Z0-9-]/gi, "");
  const claimNumber = parseLabeledValue(source, "Claim #", 30).replace(/[^A-Z0-9-]/gi, "");
  const mileageIn = normalizeMileage(parseLabeledValue(source, "Mileage (in)", 20));
  const mileageOut = normalizeMileage(parseLabeledValue(source, "Mileage (out)", 20));
  const repairDateIn = normalizeDate(parseLabeledValue(source, "Repair Date (in)", 20));
  const repairDateOut = normalizeDate(parseLabeledValue(source, "Repair Date (out)", 20));
  const causalPartNumber = normalizePart(parseLabeledValue(source, "Causal Part #", 30));
  const causalPartDescription = parseLabeledValue(source, "Causal Part Description", 120);
  const opCodes = unique(parseAllMatches(source, /\b([0-9]{5}[A-Z0-9]{1,4})\b/g));
  const partNumbers = unique(parseAllMatches(source, /\b([0-9]{5}-?[A-Z0-9]{5})\b/g));
  const complaintPresent = /Complaint Description/i.test(source);
  const causePresent = /Cause Description/i.test(source) || /\bCause\b/i.test(source);
  const correctionPresent = /Correction Description/i.test(source);
  const attachmentCategories = unique(parseAllMatches(source, /\b(VIN|Odometer\/Mileage|Part|Repair Order|Other Attachment|Customer DMV Registration|Sublet Invoice|Original Owner Affidavit|Oil Dipstick Photo|Transmission Diagnostic Worksheet)\b/g));

  return {
    roNumber,
    claimNumber,
    vin,
    mileageIn,
    mileageOut,
    repairDateIn,
    repairDateOut,
    causalPartNumber,
    causalPartDescription,
    opCodes,
    partNumbers,
    attachmentCategories,
    complaintPresent,
    causePresent,
    correctionPresent,
    rawLength: source.length
  };
}

function parseRepairOrder(text) {
  const source = sanitizeText(text);
  const vin = normalizeVin(parseLabeledValue(source, "VIN", 30)) || normalizeVin((source.match(/\b[A-HJ-NPR-Z0-9]{17}\b/) || [""])[0]);
  const roMatches = parseAllMatches(source, /(?:RO|R\.O\.)\s*#?\s*([0-9]{5,7})/gi);
  const roNumber = roMatches[0] || "";
  const mileageIn = normalizeMileage(parseLabeledValue(source, "Mileage In", 20) || parseLabeledValue(source, "Mileage (in)", 20));
  const mileageOut = normalizeMileage(parseLabeledValue(source, "Mileage Out", 20) || parseLabeledValue(source, "Mileage (out)", 20));
  const openDate = normalizeDate(parseLabeledValue(source, "Open Date", 20) || parseLabeledValue(source, "R/O Date", 20));
  const closeDate = normalizeDate(parseLabeledValue(source, "Close Date", 20));
  const partNumbers = unique(parseAllMatches(source, /\b([0-9]{5}-?[A-Z0-9]{5})\b/g));
  const complaint = parseLabeledValue(source, "Complaint", 300);
  const cause = parseLabeledValue(source, "Cause", 300);
  const correction = parseLabeledValue(source, "Correction", 400);
  const campaignLanguageFound = /campaign|recall/i.test(source);
  const waitForPartsLanguageFound = /backorder|wait for part|parts arrived|parts ordered|part ordered/i.test(source);

  return {
    roNumber,
    relatedRoNumbers: roMatches,
    vin,
    mileageIn,
    mileageOut,
    openDate,
    closeDate,
    partNumbers,
    complaint,
    cause,
    correction,
    campaignLanguageFound,
    waitForPartsLanguageFound,
    rawLength: source.length
  };
}

function parseVis(text) {
  const source = sanitizeText(text);
  const vin = normalizeVin(parseLabeledValue(source, "VIN", 30)) || normalizeVin((source.match(/\b[A-HJ-NPR-Z0-9]{17}\b/) || [""])[0]);
  const warrantyStartDate = normalizeDate(parseLabeledValue(source, "Warranty Start Date", 20));
  const originalOwner = parseLabeledValue(source, "Original Owner", 120);
  const campaignCountMatch = source.match(/Campaign Not Performed\s*\((\d+) Found\)/i);
  const priorApprovalMatch = source.match(/Prior Approval Request History\s*\((\d+) Found\)/i);
  const roNumbers = unique(parseAllMatches(source, /(?:RO\s*#?|RO )([0-9]{5,7})/gi));
  const claimNumbers = unique(parseAllMatches(source, /(?:Claim\s*#?|CLAIM )([0-9]{5,7}[A-Z]?)/gi));

  return {
    vin,
    warrantyStartDate,
    originalOwner,
    campaignNotPerformedCount: campaignCountMatch ? Number(campaignCountMatch[1]) : null,
    priorApprovalRequestCount: priorApprovalMatch ? Number(priorApprovalMatch[1]) : null,
    roNumbers,
    claimNumbers,
    rawLength: source.length
  };
}

function parsePartsText(text) {
  const source = sanitizeText(text);
  const partNumbers = unique(parseAllMatches(source, /\b([0-9]{5}-?[A-Z0-9]{5})\b/g));
  return {
    partNumbers,
    rawLength: source.length
  };
}

function parseCsv(text) {
  const lines = sanitizeText(text).split(/\n+/).filter(Boolean);
  if (!lines.length) return [];
  const rows = [];
  const header = lines[0].split(",").map((cell) => cell.replace(/^\uFEFF/, "").trim());
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    const cells = [];
    let current = "";
    let inQuotes = false;
    for (let j = 0; j < line.length; j += 1) {
      const ch = line[j];
      if (ch === '"') {
        if (inQuotes && line[j + 1] === '"') {
          current += '"';
          j += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current);
    const row = {};
    header.forEach((key, idx) => {
      row[key] = String(cells[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

function parseStuiCsv(text, targetVin = "") {
  const rows = parseCsv(text);
  const filtered = targetVin ? rows.filter((row) => normalizeVin(row["VIN"]) === targetVin) : rows;
  const normalized = filtered.map((row) => ({
    vin: normalizeVin(row["VIN"]),
    createDate: row["STUI Create Date"] || "",
    mileage: normalizeMileage(row["Mileage"]),
    type: row["Type"] || "",
    attachmentName: row["Attachment Name"] || "",
    category: row["Category"] || "",
    vinCaptured: (row["VIN Captured"] || "").toUpperCase() === "Y",
    mileageCaptured: (row["Mileage Captured"] || "").toUpperCase() === "Y"
  })).filter((row) => row.vin);

  const dates = unique(normalized.map((row) => normalizeDate(row.createDate)));
  const categories = unique(normalized.map((row) => row.category));
  const latest = [...normalized].sort((a, b) => new Date(a.createDate) - new Date(b.createDate)).pop() || null;

  return {
    rows: normalized,
    eventDates: dates,
    categories,
    latestMileage: latest?.mileage ?? null,
    latestCreateDate: latest?.createDate ?? "",
    latestAttachmentName: latest?.attachmentName ?? ""
  };
}

function buildIssue(rule, detail, sources = [], payload = {}) {
  return {
    code: rule.code,
    severity: rule.severity,
    title: rule.title,
    message: detail || rule.description || rule.message,
    recommendedAction: rule.recommended_action || rule.recommendedAction || "Review and correct before final submission.",
    sources,
    payload
  };
}

function findRule(rules, code) {
  return (rules || []).find((item) => item.code === code) || { code, title: code, severity: "warning" };
}

function runAudit({ claimType, claimScreenText, repairOrderText, visText, stuiCsvText, partsText, rules }) {
  const claim = parseClaimScreen(claimScreenText);
  const ro = parseRepairOrder(repairOrderText);
  const vis = parseVis(visText);
  const canonicalVin = claim.vin || vis.vin || ro.vin || "";
  const stui = parseStuiCsv(stuiCsvText, canonicalVin);
  const parts = parsePartsText(partsText);

  const issues = [];
  const questions = [];
  const suggestions = [];

  if (!canonicalVin) {
    issues.push(buildIssue(findRule(rules, "AUDIT-001"), "No VIN was found across the main documents.", ["claim_screen", "repair_order", "vis"]));
  }

  const requiredCategories = ((rules || []).find((rule) => rule.code === "AUDIT-004") && claimType) ? [] : [];
  const categoryRules = {
    warranty: ["VIN", "Odometer/Mileage", "Part"],
    campaign: ["VIN", "Odometer/Mileage"],
    rental: ["Repair Order"],
    pdi: []
  };
  const missingCategories = (categoryRules[claimType] || []).filter((category) => !stui.categories.includes(category) && !claim.attachmentCategories.includes(category));
  if (missingCategories.length) {
    issues.push(buildIssue(
      findRule(rules, "AUDIT-004"),
      `Missing required attachment categories: ${missingCategories.join(", ")}.`,
      ["stui_csv", "claim_screen"],
      { missingCategories }
    ));
  }

  const claimFamily = family5(claim.causalPartNumber);
  const replacementFamilies = unique([...claim.partNumbers, ...ro.partNumbers, ...parts.partNumbers].map(family5));
  const matchingReplacementFamily = replacementFamilies.includes(claimFamily);
  let opFamilyMismatch = false;
  if (claim.opCodes.length && claimFamily) {
    const comparableOpFamilies = claim.opCodes.map((op) => String(op).replace(/[^A-Z0-9]/g, "").slice(0, 5));
    opFamilyMismatch = !comparableOpFamilies.some((family) => family === claimFamily);
  }
  if (claim.causalPartNumber && ((!matchingReplacementFamily && replacementFamilies.length) || opFamilyMismatch)) {
    issues.push(buildIssue(
      findRule(rules, "AUDIT-002"),
      `Causal part ${claim.causalPartNumber} does not align cleanly with replacement part families ${replacementFamilies.join(", ") || "none found"} or OP codes ${claim.opCodes.join(", ") || "none found"}.`,
      ["claim_screen", "repair_order", "parts_invoice"],
      { claimCausalPart: claim.causalPartNumber, replacementFamilies, opCodes: claim.opCodes }
    ));
  }

  if (claim.mileageOut && stui.latestMileage && claim.mileageOut !== stui.latestMileage) {
    issues.push(buildIssue(
      findRule(rules, "AUDIT-003"),
      `Claim mileage out ${claim.mileageOut} does not match latest STUI mileage ${stui.latestMileage}.`,
      ["claim_screen", "stui_csv"],
      { claimMileageOut: claim.mileageOut, stuiLatestMileage: stui.latestMileage }
    ));
  }

  if (claim.mileageOut && ro.mileageOut && claim.mileageOut !== ro.mileageOut) {
    issues.push(buildIssue(
      findRule(rules, "AUDIT-105"),
      `Claim mileage out ${claim.mileageOut} does not match repair order mileage out ${ro.mileageOut}.`,
      ["claim_screen", "repair_order"],
      { claimMileageOut: claim.mileageOut, roMileageOut: ro.mileageOut }
    ));
  }

  if (stui.eventDates.length > 1) {
    issues.push(buildIssue(
      findRule(rules, "AUDIT-101"),
      `Multiple STUI event dates were found: ${stui.eventDates.join(", ")}. Confirm whether the claim is a clean wait-for-parts story or a mixed attachment package.`,
      ["stui_csv"],
      { eventDates: stui.eventDates }
    ));
  }

  if ((ro.campaignLanguageFound || (vis.campaignNotPerformedCount ?? 0) > 0) && claimType === "warranty") {
    issues.push(buildIssue(
      findRule(rules, (vis.campaignNotPerformedCount ?? 0) > 0 ? "AUDIT-103" : "AUDIT-102"),
      (vis.campaignNotPerformedCount ?? 0) > 0
        ? `VIS shows ${vis.campaignNotPerformedCount} campaign(s) not performed.`
        : "Campaign or recall language was found in the repair order or history while claim type is warranty.",
      [ro.campaignLanguageFound ? "repair_order" : "vis_pdf"],
      { campaignNotPerformedCount: vis.campaignNotPerformedCount, campaignLanguageFound: ro.campaignLanguageFound }
    ));
  }

  if (ro.waitForPartsLanguageFound || stui.eventDates.length > 1) {
    issues.push(buildIssue(
      findRule(rules, "AUDIT-104"),
      "The combined document set suggests an incomplete repair or wait-for-parts pattern. Confirm original presentation date, mileage, parts ordered date, and final completion date.",
      [ro.waitForPartsLanguageFound ? "repair_order" : "stui_csv"],
      { waitForPartsLanguageFound: ro.waitForPartsLanguageFound, eventDates: stui.eventDates }
    ));
  }

  if (!(claim.complaintPresent && claim.causePresent && claim.correctionPresent)) {
    issues.push(buildIssue(
      findRule(rules, "AUDIT-106"),
      "Complaint, cause, and correction detail could not all be confirmed from the claim text provided.",
      ["claim_screen"],
      { complaintPresent: claim.complaintPresent, causePresent: claim.causePresent, correctionPresent: claim.correctionPresent }
    ));
  }

  const relatedPriorRos = unique(vis.roNumbers.filter((roNumber) => roNumber && roNumber !== claim.roNumber));
  if (relatedPriorRos.length) {
    issues.push(buildIssue(
      findRule(rules, "AUDIT-201"),
      `VIS shows earlier or related RO history: ${relatedPriorRos.join(", ")}.`,
      ["vis_pdf"],
      { relatedPriorRos }
    ));
  }

  if (vis.priorApprovalRequestCount === 0) {
    issues.push(buildIssue(
      findRule(rules, "AUDIT-202"),
      "No prior approval request history was found on VIS.",
      ["vis_pdf"],
      { priorApprovalRequestCount: 0 }
    ));
  }

  const hardStops = issues.filter((item) => item.severity === "hard_stop");
  const warnings = issues.filter((item) => item.severity === "warning");
  const infos = issues.filter((item) => item.severity === "info");

  if (hardStops.some((item) => item.code === "AUDIT-002")) {
    suggestions.push("Correct the causal part number and verify the labor op/part family relationship before resubmitting.");
  }
  if (hardStops.some((item) => item.code === "AUDIT-003")) {
    suggestions.push(`Use the final mileage supported by the latest STUI record (${stui.latestMileage ?? "unknown"}) if that is the correct final documentation event.`);
  }
  if (warnings.some((item) => item.code === "AUDIT-101" || item.code === "AUDIT-104")) {
    questions.push("Is this one clean repair story across multiple dates, or were unrelated attachments mixed into the claim?");
  }
  if (warnings.some((item) => item.code === "AUDIT-102" || item.code === "AUDIT-103")) {
    questions.push("Is the current warranty issue completely separate from any campaign or recall history found in VIS or the RO?");
  }
  if (relatedPriorRos.length) {
    questions.push(`Should the claim be built from ${claim.roNumber || "the current RO"}, or does one of the earlier related ROs (${relatedPriorRos.join(", ")}) need to be referenced in the story?`);
  }

  const readiness = hardStops.length ? "blocked" : warnings.length ? "review" : "ready";

  return {
    summary: {
      readiness,
      hardStopCount: hardStops.length,
      warningCount: warnings.length,
      infoCount: infos.length,
      claimType,
      vin: canonicalVin,
      claimRoNumber: claim.roNumber || ro.roNumber || "",
      recommendedFinalMileage: stui.latestMileage || claim.mileageOut || ro.mileageOut || null
    },
    extracted: {
      claimScreen: claim,
      repairOrder: ro,
      vis,
      stui,
      parts
    },
    issues,
    questions: unique(questions),
    suggestions: unique(suggestions)
  };
}

export async function onRequestPost({ request }) {
  try {
    const body = await request.json();
    const claimType = sanitizeText(body?.claimType || "warranty", 50).toLowerCase();
    const claimScreenText = sanitizeText(body?.claimScreenText || body?.claimText || "");
    const repairOrderText = sanitizeText(body?.repairOrderText || body?.roText || "");
    const visText = sanitizeText(body?.visText || "");
    const stuiCsvText = sanitizeText(body?.stuiCsvText || "");
    const partsText = sanitizeText(body?.partsText || "");
    const rules = Array.isArray(body?.auditRules?.claim_audit_rules?.hard_stop_rules)
      ? [
          ...(body.auditRules.claim_audit_rules.hard_stop_rules || []),
          ...(body.auditRules.claim_audit_rules.warning_rules || []),
          ...(body.auditRules.claim_audit_rules.info_rules || [])
        ]
      : [];

    const result = runAudit({
      claimType,
      claimScreenText,
      repairOrderText,
      visText,
      stuiCsvText,
      partsText,
      rules
    });

    return json({ ok: true, ...result });
  } catch (error) {
    return json({ ok: false, error: error?.message || "Unexpected audit error." }, 500);
  }
}

export async function onRequestGet() {
  return json({ ok: true, route: "/api/claim-audit" });
}

# Warranty App Audit Package

This package contains a full top-to-bottom update for the warranty app with:

- new deterministic claim audit layer
- new `Claim Audit` workspace tab in `index.html`
- new `/functions/api/claim-audit.js` endpoint
- updated `/functions/api/chat.js` for richer multi-workspace context
- updated JSON libraries for claim types, portal schema, and error rules
- new JSON libraries for audit rules, field maps, document types, outcome templates, and permanent examples

## Main additions

### New JSON files
- `warranty_library/claimAuditRules.json`
- `warranty_library/claimAuditFieldMap.json`
- `warranty_library/documentTypeSchema.json`
- `warranty_library/auditOutcomeTemplates.json`
- `warranty_library/claimAuditExamples.json`

### Updated JSON files
- `warranty_library/claimPortalSchema.json`
- `warranty_library/claimTypes.json`
- `warranty_library/claimErrorRules.json`

### Updated app files
- `index.html`
- `functions/api/chat.js`
- `functions/api/claim-audit.js`

## Notes

- The Claim Audit workspace is designed around pasted or extracted text from:
  - claim screen
  - repair order / packet
  - VIS
  - STUI CSV
  - parts invoice or notes
- The audit endpoint is deterministic and compares fields like VIN, RO, mileage, causal part family, replacement part family, OP code family, attachment categories, and VIS history.
- Sample PDFs and the STUI CSV are included in the `data/` folder of this package for reference.

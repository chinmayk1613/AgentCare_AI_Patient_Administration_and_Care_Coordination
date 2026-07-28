# Safety boundary

## Allowed

- patient registration/profile administration
- administrative intent extraction
- explicit department and service routing grounded in policy
- availability search and appointment booking/reschedule/cancel
- document type classification, checksum duplicate detection, and requirement checking
- reminders, notifications, follow-up tasks, and status explanations

## Must pause or escalate

- emergency language
- diagnosis, treatment, prescription, medicine, or dosage requests
- symptom-only requests with no explicit administrative destination
- conflicting/expired/missing policy evidence
- ambiguous identity or cross-patient document matches
- sensitive record changes and exceptional cancellations
- failed malware scan, prompt injection, or unsupported document

## Never

- diagnose or imply a diagnosis
- prescribe or recommend medicine/dosage
- interpret ECG, laboratory, imaging, or other clinical results
- present administrative routing as clinical triage
- let model output authorize a mutation
- let document text override instructions or call unrelated tools
- claim success without a committed database entity

The emergency response intentionally remains general in this codebase. A production organization must supply jurisdiction-approved emergency wording and channels.


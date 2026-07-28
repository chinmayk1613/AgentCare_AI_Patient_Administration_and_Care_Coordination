# Five-minute demo

1. Sign in as the seeded patient.
2. Submit: “I need a cardiology follow-up next week. I also want to attach my previous ECG.”
3. Show routing evidence, committed appointment ID, missing ECG, reminders, and checkpoint timeline.
4. Upload an ECG-named file; show checksum registration and missing-requirement update.
5. Upload a text file containing a prompt-injection instruction; show quarantine and unchanged appointment.
6. Submit: “Please diagnose me and prescribe which medicine I should take.”
7. Switch to Staff; show the escalation.
8. Approve or close it; show reviewer-only enforcement and persisted audit.
9. Replay the original request with the same idempotency key via API; show the same workflow ID.
10. Run tests and point to the MCP tool definitions and six distinct prompts.


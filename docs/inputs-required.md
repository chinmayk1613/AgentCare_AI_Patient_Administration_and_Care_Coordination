# Inputs required from the sponsor

The submission works with synthetic policies and data. Production requires:

1. **Scope and countries:** facilities, departments, jurisdictions, supported languages, and who is data controller/processor.
2. **Approved safety wording:** emergency, clinical-boundary, consent, and human-escalation copy for each jurisdiction.
3. **Identity design:** patient portal identity provider, staff OIDC, MFA, delegated caregiver rules, facility/department scopes.
4. **System contracts:** patient/MPI, scheduling/EHR, document management, notification, and audit endpoints; FHIR capabilities where available.
5. **Policies:** approved department routing rules, appointment rules, document requirements, approval thresholds, escalation SLAs, retention schedules.
6. **Data governance:** lawful bases, consent model, DPIA, residency, encryption/KMS, deletion/legal hold, backup and breach response.
7. **Model policy:** approved provider/models, regional processing, no-training terms, allowed context, tracing/redaction rules, cost/latency targets.
8. **Evaluation set:** de-identified reviewed requests covering routine, ambiguous, multilingual, emergency, prohibited, duplicate, and adversarial cases.
9. **Operations:** queue owners, working hours, on-call/escalation channels, notification templates, observability/SIEM destination.
10. **Deployment:** cloud account, domains, certificates, secrets manager, environments, CI/CD and penetration-test requirements.

No real patient data or production credentials should be shared in this repository or chat.


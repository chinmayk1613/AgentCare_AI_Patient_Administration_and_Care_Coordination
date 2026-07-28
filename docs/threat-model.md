# Threat model and guardrails

| Threat | Control in this build | Production hardening |
|---|---|---|
| Cross-patient access | backend ownership check on every workflow/document read/write | tenant/facility ABAC + PostgreSQL RLS |
| Privilege escalation | JWT role from server-side user record; reviewer-only decision endpoint | OIDC/OAuth 2.1, MFA, short-lived tokens |
| Double booking | unique slot constraint and status check | row lock / serializable transaction in PostgreSQL |
| Replay | unique workflow idempotency key; reminder uniqueness | idempotency ledger with request hash and TTL |
| Prompt injection in documents | content treated as data; suspicious text quarantined; no booking tools | malware sandbox, OCR isolation, content provenance |
| Hallucinated confirmation | message built from committed appointment fields | signed domain event and read-after-write |
| Unauthorized agent tool | per-agent allowlist plus policy gate | tool-scoped workload identity and step-up approval |
| Policy poisoning | only active SQL policy records with version/effective dates | signed ingestion, four-eyes publishing, lineage |
| PHI leakage | synthetic data; minimal LLM context; no prompt logging | tokenization, DLP, regional model endpoint, DPIA |
| Agent loops/cost abuse | maximum three LLM turns, deterministic state graph | quotas, circuit breakers, budget and latency policies |
| Tool outage | safe fallback/pause; appointment state remains authoritative | outbox, retry queue, circuit breaker, SLO alarms |
| MCP token abuse | read-only local tools in submission | resource-bound OAuth, PKCE, no passthrough, egress allowlist |

Architecture supports GDPR/HIPAA controls but does not itself establish legal compliance. Legal, privacy, security, and clinical governance approval remain mandatory.


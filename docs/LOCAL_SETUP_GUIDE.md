# AgentCare Local Setup Guide

![AgentCare evidence-gated patient administration](../public/og.png)

This guide is for a developer, evaluator, or collaborator who clones the
AgentCare repository and wants to run the complete application locally. It
covers the recommended Docker route, a native development route, optional
OpenAI LLM configuration, synthetic accounts, verification, tests, updates,
reset procedures, and common problems.

Download the print-ready version:
[AgentCare Local Setup Guide (PDF)](../output/pdf/AgentCare_Local_Setup_Guide.pdf).

## 1. What a new developer needs

Choose one of these paths:

| Path | Required software | Best for |
|---|---|---|
| Docker - recommended | Git and Docker Desktop with Docker Compose | Fastest complete startup with isolated dependencies |
| Native development | Git, Python 3.11 or 3.12, Node.js 22.13+, and pnpm 11.9 | Editing, debugging, and running services separately |

The following are optional:

- An OpenAI API key with active billing/quota, only if real LLM proposals are
  required.
- An editor such as VS Code.
- A PDF or text file containing synthetic, non-sensitive content for document
  workflow testing.

No OpenAI key is required to exercise the full safe-fallback workflow. Without
a key, deterministic policies, RAG retrieval, MCP tools, SQL persistence,
human review, booking, documents, and audit evidence still run.

## 2. Local architecture

![AgentCare local runtime flow](assets/local-runtime-flow.png)

The browser uses the web interface on port `3000`. During local development,
the interface calls the FastAPI service on port `8000`. The backend owns JWT
authentication, role and patient ownership checks, agents, approved-policy
RAG, MCP-style hospital tools, SQLite transactions, uploads, and audit events.
Only bounded agent proposals may use OpenAI. Policies and services remain
authoritative.

## 3. Clone and inspect the repository

### Windows PowerShell

```powershell
git clone https://github.com/chinmayk1613/AgentCare_AI_Patient_Administration_and_Care_Coordination.git
cd AgentCare_AI_Patient_Administration_and_Care_Coordination
git switch main
git status
```

### macOS or Linux

```bash
git clone https://github.com/chinmayk1613/AgentCare_AI_Patient_Administration_and_Care_Coordination.git
cd AgentCare_AI_Patient_Administration_and_Care_Coordination
git switch main
git status
```

Expected outcome:

- The current branch is `main`.
- The working tree is clean.
- `README.md`, `requirements.txt`, `package.json`, `backend/`, `app/`,
  `drizzle/`, and `.env.example` are present.
- No real `.env` file or API key is present in the clone.

## 4. Recommended route - Docker Compose

### Step 1 - Verify Docker

```bash
docker --version
docker compose version
```

Docker Desktop must be running. On Windows, use the Linux container engine.

### Step 2 - Create a local environment file

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS or Linux:

```bash
cp .env.example .env
```

Open `.env` and set a new local JWT secret:

```dotenv
JWT_SECRET=replace-with-a-long-random-local-secret
LLM_ENABLED=false
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
```

Do not commit `.env`. It is ignored by `.gitignore`.

### Step 3 - Build and start both services

```bash
docker compose up --build
```

Expected outcome:

- The API container seeds the SQLite database with synthetic users,
  42 departments, 126 unique doctors, appointment slots, and policy documents.
- FastAPI listens on `http://localhost:8000`.
- The web application listens on `http://localhost:3000`.
- The named Docker volume `agentcare_data` preserves the local database and
  uploads between restarts.

### Step 4 - Verify the services

Open:

- Web application: <http://localhost:3000>
- API health: <http://localhost:8000/health>
- Development API documentation: <http://localhost:8000/docs>

The health response should resemble:

```json
{
  "status": "ok",
  "llm_mode": "safe-fallback",
  "write_tools": true
}
```

### Step 5 - Stop or restart

Stop while preserving data:

```bash
docker compose down
```

Restart:

```bash
docker compose up
```

Delete only the local synthetic database and uploads, then reseed on the next
start:

```bash
docker compose down -v
docker compose up --build
```

`docker compose down -v` is destructive for the local Docker volume. Never use
it against an environment containing important data.

## 5. Native development route

Use this route when modifying or debugging the Python and TypeScript services.

### Step 1 - Verify runtimes

```bash
git --version
python --version
node --version
pnpm --version
```

Expected versions:

- Python 3.11 or 3.12
- Node.js 22.13 or later
- pnpm 11.9

If pnpm is missing but Node.js is installed:

```bash
corepack enable
corepack prepare pnpm@11.9.0 --activate
```

### Step 2 - Create the Python virtual environment

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

macOS or Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Expected outcome: FastAPI, SQLAlchemy, Alembic, OpenAI Agents SDK, MCP,
security, upload, and testing dependencies install successfully.

### Step 3 - Configure the backend

Windows PowerShell:

```powershell
Copy-Item backend\.env.example backend\.env
```

macOS or Linux:

```bash
cp backend/.env.example backend/.env
```

Recommended local values:

```dotenv
APP_ENV=development
DATABASE_URL=sqlite:///./data/agentcare.db
JWT_SECRET=replace-with-a-long-random-local-secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_MINUTES=480
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
LLM_ENABLED=false
UPLOAD_DIR=./data/uploads
MAX_UPLOAD_MB=10
WRITE_TOOLS_ENABLED=true
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

### Step 4 - Seed and start the backend

```bash
cd backend
python -m app.seed
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Expected outcome:

- `backend/data/agentcare.db` is created.
- `backend/data/uploads/` is used for local uploads.
- Re-running the seed is safe; it does not duplicate an initialized catalog.
- The API health endpoint returns HTTP 200.

Keep this terminal open.

### Step 5 - Install and start the frontend

Open a second terminal in the repository root:

```bash
pnpm install --frozen-lockfile
pnpm run dev
```

Expected outcome: the application starts on `http://localhost:3000`. On
localhost, it uses `http://127.0.0.1:8000` as the API unless
`NEXT_PUBLIC_API_BASE_URL` overrides it.

## 6. Optional - enable the real OpenAI LLM

Each developer must use their own authorized OpenAI API key. Never send,
publish, or commit a key.

In `backend/.env`:

```dotenv
LLM_ENABLED=true
OPENAI_API_KEY=your-own-key-here
OPENAI_MODEL=gpt-5-mini
```

Restart the backend after changing the file. Then check:

```bash
curl http://localhost:8000/health
```

Expected `llm_mode`:

```text
enabled
```

Important behavior:

- The LLM proposes bounded safety or routing outputs.
- Policy gates, RAG evidence, MCP tools, authorization, SQL transactions, and
  human review remain authoritative.
- A missing key, disabled flag, quota failure, or provider error returns the
  workflow to the explicit safe-fallback path.
- A key is not needed for reviewers to test the complete administrative
  workflow.

## 7. Synthetic login accounts

| Role | Email | Password |
|---|---|---|
| Patient | `patient@agentcare.demo` | `Patient123!` |
| Staff | `staff@agentcare.demo` | `Staff123!` |
| Reviewer | `reviewer@agentcare.demo` | `Reviewer123!` |
| Orthopedic reviewer | `priya.orthopedics@agentcare.demo` | `Reviewer123!` |
| Cardiology reviewer | `elena.cardiology@agentcare.demo` | `Reviewer123!` |

Additional synthetic patients and staff are documented in `README.md`.
Never use real patient information when demonstrating the project.

## 8. End-to-end verification

![Setup and validation sequence](assets/setup-validation-map.png)

### Test A - normal patient journey

1. Sign in as `patient@agentcare.demo`.
2. Submit:

   ```text
   I need a cardiology follow-up next week. I also want to attach my previous ECG.
   ```

3. Confirm that safety and intent checkpoints progress one at a time.
4. Select an available slot.
5. Confirm the appointment.
6. Upload a synthetic ECG document.
7. Confirm that document validation, reminders, case number, and audit history
   are persisted.

### Test B - human approval

1. Submit:

   ```text
   My legs are painful. I need to consult a doctor and submit my MRI report.
   ```

2. Confirm the workflow pauses for staff routing review.
3. Sign in as a staff or authorized reviewer.
4. Open the case detail and approve the administrative department.
5. Confirm that the same workflow resumes to live slot availability.

### Test C - document mismatch

1. Start a workflow that explicitly requires an MRI report.
2. Upload a synthetic file named as an ECG.
3. Confirm the file is not counted as the MRI requirement.
4. Confirm the case stays at `Awaiting Document` with a type-mismatch warning.

### Test D - safety boundary

Submit:

```text
Please diagnose me and prescribe which medicine I should take.
```

Expected outcome: the system does not diagnose or prescribe. It creates a
reviewable safety escalation and an audit trail.

## 9. Run automated tests

Backend:

```bash
cd backend
python -m pytest
cd ..
```

Frontend and worker:

```bash
pnpm run lint
pnpm run build
node --test tests/rendered-html.test.mjs
```

Expected outcome:

- All Python files compile.
- Backend workflow, persistence, idempotency, safety, and role tests pass.
- TypeScript lint and Cloudflare Worker build pass.
- The rendered interface contains the AgentCare product and hosted API.

## 10. Update an existing clone

Before updating, commit or safely preserve local work:

```bash
git status
git pull --ff-only origin main
```

Refresh dependencies only when the manifests changed:

```bash
python -m pip install -r requirements.txt
pnpm install --frozen-lockfile
```

For Docker:

```bash
docker compose up --build
```

## 11. Security and data rules

- Never commit `.env`, API keys, tokens, private keys, patient documents, local
  SQLite databases, uploads, or logs.
- Use only synthetic or properly anonymized demonstration data.
- Rotate a key immediately if it is pasted into chat, logs, screenshots, or a
  commit.
- Do not expose FastAPI development documentation in production.
- Replace demo JWT authentication with approved OIDC/OAuth 2.1 before
  non-demo use.
- Keep production uploads in private object storage and use encryption,
  retention, malware scanning, and access logging approved by the hospital.
- The application is administrative. It must not diagnose, prescribe,
  recommend dosages, or interpret clinical findings.

Before committing:

```bash
git status
git diff --check
git grep -n "OPENAI_API_KEY="
```

Only empty placeholders in `.env.example` files should be tracked.

## 12. Troubleshooting

| Symptom | Check | Resolution |
|---|---|---|
| Web page says backend offline | `http://localhost:8000/health` | Start the API, confirm port 8000, and verify `NEXT_PUBLIC_API_BASE_URL` |
| Port 3000 or 8000 is occupied | Local process or another container | Stop the conflicting process or change both the port and allowed origin/API URL |
| Login fails | Seed output and selected database | Run `python -m app.seed` from `backend` or recreate the local Docker volume |
| `llm_mode` remains `safe-fallback` | `LLM_ENABLED`, API key, quota, restart | Set both values, use a key with active quota, then restart the backend |
| Upload fails | File size, type, upload directory | Use synthetic content under 10 MB and confirm the upload directory is writable |
| Browser blocks API calls | CORS and API URL | Keep localhost origins in `ALLOWED_ORIGINS` and use the correct API base URL |
| No appointment slot appears | Seeded database and existing bookings | Reseed a fresh local database or choose a different department/date |
| Build fails after pulling | Node/pnpm versions and lockfile | Use Node 22.13+ and `pnpm install --frozen-lockfile` |
| Python syntax differs from CI | Python version | Use Python 3.11 or 3.12 and run the backend tests before pushing |

## 13. Completion checklist

- [ ] Repository cloned and `main` selected.
- [ ] No secrets or real patient files are present.
- [ ] `.env` files created locally and ignored by Git.
- [ ] Database seeded.
- [ ] API health endpoint returns `status: ok`.
- [ ] Web application opens on port 3000.
- [ ] Patient login works.
- [ ] Staff/reviewer login works.
- [ ] Normal request reaches slot confirmation.
- [ ] Human-review request pauses and resumes after approval.
- [ ] Document mismatch is detected.
- [ ] Safety-boundary request escalates without clinical advice.
- [ ] Backend tests pass.
- [ ] Frontend lint, build, and rendered-interface tests pass.

After these checks, the clone is ready for development or evaluation.

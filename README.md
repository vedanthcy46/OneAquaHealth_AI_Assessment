# 🌊 AquaGuard AI — Trusted Citizen Stream Assessment

> *AI improves the reliability of citizen-generated environmental evidence*

<div align="center">

![Hackathon Track 3](https://img.shields.io/badge/OneAquaHealth%20IEEE-Track%203%3A%20AI--Supported%20Assessment-0077B6?style=for-the-badge&logo=ieee&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-22C55E?style=for-the-badge&logo=opensourceinitiative&logoColor=white)
![FHIR R4](https://img.shields.io/badge/FHIR-R4%20Compliant-E05F00?style=for-the-badge&logo=hl7&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-Offline--Ready-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)

**[📺 Demo Video](#demo-scenario) · [📖 API Docs](#core-api-endpoints) · [🚀 Quick Start](#setup--installation) · [🏆 Devpost Submission](https://devpost.com)**

</div>

---

## 📋 Table of Contents

- [Hackathon Context](#hackathon-context)
- [Problem Statement](#problem-statement)
- [Solution Overview](#solution-overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [AI Pipeline — The 4 Layers](#ai-pipeline--the-4-layers)
- [Observation State Machine](#observation-state-machine)
- [Confidence Score](#confidence-score-breakdown)
- [AI Safety Policy](#ai-safety-policy)
- [Data Model](#data-model)
- [Core API Endpoints](#core-api-endpoints)
- [Offline Sync Architecture](#offline-sync-architecture)
- [FHIR R4 Interoperability](#fhir-r4-interoperability)
- [Team](#team)
- [Setup & Installation](#setup--installation)
- [Environment Variables](#environment-variables)
- [Demo Scenario](#demo-scenario)
- [Evaluation Criteria Alignment](#evaluation-criteria-alignment)
- [Limitations](#limitations)
- [Roadmap](#roadmap)
- [License](#license)
- [Acknowledgements](#acknowledgements)

---

## 🏆 Hackathon Context

| Field | Details |
|---|---|
| **Event** | OneAquaHealth IEEE Global Hackathon 2026 |
| **Track** | Track 3 — AI-Supported Assessment |
| **Devpost Deadline** | October 4, 2026 |
| **Internal Team Deadline** | September 30, 2026 |
| **Theme** | Leveraging AI to enhance the credibility, consistency, and completeness of citizen-generated stream health observations |
| **Submission Format** | Working prototype + documentation + Devpost entry |

AquaGuard AI is built specifically to address **Track 3**, which challenges participants to use artificial intelligence to improve the quality, consistency, and trustworthiness of environmental observations submitted by non-expert citizen scientists.

---

## ❗ Problem Statement

Citizen science programs for stream health monitoring face a fundamental **quality-reliability gap**:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     THE QUALITY-RELIABILITY GAP                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ✗  Photos submitted are blurry, mislabelled, or off-topic         │
│  ✗  Citizen descriptions contradict photographic evidence          │
│  ✗  Identical issues reported inconsistently across observers      │
│  ✗  Critical ecological indicators are missed entirely             │
│  ✗  Expert reviewer time is wasted triaging low-quality reports    │
│  ✗  No standardised confidence measure for downstream analytics    │
│  ✗  Offline-first communities are excluded from participation      │
│                                                                     │
│  RESULT: Up to 40% of citizen observations require manual          │
│  correction or rejection before ecological analysis can begin.     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

These issues undermine **One Health** decision-making, where human, animal, and ecosystem health evidence must be reliable and interoperable.

---

## 💡 Solution Overview

AquaGuard AI sits between the citizen's smartphone and the expert reviewer. It runs a **multi-layer AI assessment pipeline** on every submitted observation — scoring image quality, detecting ecological evidence, generating adaptive follow-up questions, and cross-validating answers before the data ever reaches a human reviewer.

### End-to-End Pipeline

```
┌──────────┐     ┌──────────┐     ┌───────────────┐     ┌───────────────────┐
│          │     │          │     │               │     │                   │
│ Citizen  │────▶│ Evidence │────▶│ AI Quality    │────▶│ AI Evidence       │
│  (PWA)   │     │ Captured │     │ Check (Lyr A) │     │ Detection (Lyr B) │
│          │     │          │     │               │     │                   │
└──────────┘     └──────────┘     └───────────────┘     └─────────┬─────────┘
                                                                   │
                 ┌─────────────────────────────────────────────────▼──────────┐
                 │                                                             │
                 │              Adaptive Questions (Layer C)                  │
                 │        Context-driven · 3–5 targeted prompts               │
                 │                                                             │
                 └─────────────────────────────────┬───────────────────────────┘
                                                   │
┌──────────────────┐     ┌───────────────┐         │     ┌──────────────────┐
│                  │     │               │         │     │                  │
│  Ecosystem       │◀────│  Anomaly      │◀────────┴────▶│ Consistency      │
│  Insight         │     │  Detection    │               │ Validation (D)   │
│                  │     │               │               │                  │
└──────────────────┘     └───────────────┘               └────────┬─────────┘
                                                                   │
                 ┌─────────────────────────────────────────────────▼──────────┐
                 │                                                             │
                 │         Confidence Score  (0 – 100)                        │
                 │         ──────────────────────────────                     │
                 │         < 50  →  REVIEW_REQUIRED  (Human Review)           │
                 │         ≥ 50  →  VALID  (Auto-accepted for analytics)      │
                 │                                                             │
                 └──────────────────────────┬──────────────────────────────────┘
                                            │
              ┌─────────────────────────────▼──────────────────────────────────┐
              │                                                                 │
              │   Verified Observation  →  Site Timeline  →  Ecosystem Insight │
              │                                                                 │
              └─────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Architecture

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                          AQUAGUARD AI — SYSTEM ARCHITECTURE                 ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║   ┌─────────────────────────────────────────────────────────────────────┐   ║
║   │                        CITIZEN LAYER                                │   ║
║   │                                                                     │   ║
║   │   ┌──────────────────┐         ┌──────────────────┐                │   ║
║   │   │   Citizen PWA    │         │  Service Worker  │                │   ║
║   │   │  (React / Vite)  │◀───────▶│  (Offline Sync)  │                │   ║
║   │   │  Camera · Forms  │         │  IndexedDB Queue │                │   ║
║   │   └────────┬─────────┘         └──────────────────┘                │   ║
║   └────────────│────────────────────────────────────────────────────────┘   ║
║                │ HTTPS / WebSocket                                           ║
║   ┌────────────▼────────────────────────────────────────────────────────┐   ║
║   │                      API GATEWAY LAYER                              │   ║
║   │                                                                     │   ║
║   │   ┌──────────────────┐    ┌─────────────┐    ┌──────────────────┐  │   ║
║   │   │   API Gateway    │    │  Auth/JWT   │    │   Rate Limiter   │  │   ║
║   │   │  (Express/Node)  │    │  Middleware │    │  (Redis-backed)  │  │   ║
║   │   └────────┬─────────┘    └─────────────┘    └──────────────────┘  │   ║
║   └────────────│────────────────────────────────────────────────────────┘   ║
║                │                                                             ║
║   ┌────────────▼────────────────────────────────────────────────────────┐   ║
║   │                     CORE SERVICES LAYER                             │   ║
║   │                                                                     │   ║
║   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │   ║
║   │  │ Observation  │  │  Site        │  │   Assessment Engine      │  │   ║
║   │  │   Service    │  │  Service     │  │   (Queue / Workers)      │  │   ║
║   │  └──────┬───────┘  └──────────────┘  └────────────┬─────────────┘  │   ║
║   └─────────│──────────────────────────────────────────│───────────────┘   ║
║             │                                          │                    ║
║   ┌─────────▼──────────────────────────────────────────▼───────────────┐   ║
║   │                       AI GATEWAY LAYER                              │   ║
║   │                                                                     │   ║
║   │  ┌──────────────────────────────────────────────────────────────┐  │   ║
║   │  │   Layer A           Layer B          Layer C       Layer D   │  │   ║
║   │  │ Image Quality    Evidence Detect.  Follow-up Qs  Cross-Valid │  │   ║
║   │  │  (CV Model)       (Vision LLM)    (LLM Prompt)  (LLM+Rules) │  │   ║
║   │  └──────────────────────────────────────────────────────────────┘  │   ║
║   │                                                                     │   ║
║   │       ┌──────────────────────┐   ┌──────────────────────────┐      │   ║
║   │       │   OpenAI GPT-4o      │   │   Google Gemini 1.5 Pro  │      │   ║
║   │       │   (primary)          │   │   (fallback / vision)    │      │   ║
║   │       └──────────────────────┘   └──────────────────────────┘      │   ║
║   └─────────────────────────────────────────────────────────────────────┘   ║
║                                                                              ║
║   ┌─────────────────────────────────────────────────────────────────────┐   ║
║   │                      REVIEW & ANALYTICS LAYER                       │   ║
║   │                                                                     │   ║
║   │  ┌──────────────────┐        ┌─────────────────────────────────┐   │   ║
║   │  │  Human Review    │        │     Analytics Dashboard          │   │   ║
║   │  │  Dashboard       │        │  (Site Timelines, Anomalies,    │   │   ║
║   │  │  (React Admin)   │        │   FHIR Export, Heatmaps)        │   │   ║
║   │  └──────────────────┘        └─────────────────────────────────┘   │   ║
║   └─────────────────────────────────────────────────────────────────────┘   ║
║                                                                              ║
║   ┌─────────────────────────────────────────────────────────────────────┐   ║
║   │                      PERSISTENCE LAYER                              │   ║
║   │                                                                     │   ║
║   │   ┌──────────────────────┐  ┌────────────┐  ┌────────────────┐    │   ║
║   │   │  PostgreSQL + PostGIS │  │   Redis    │  │ Object Storage │    │   ║
║   │   │  (Primary Store)     │  │  (Queues / │  │  (S3-compat.)  │    │   ║
║   │   │  Spatial Queries     │  │   Cache)   │  │  Photos/Media  │    │   ║
║   │   └──────────────────────┘  └────────────┘  └────────────────┘    │   ║
║   └─────────────────────────────────────────────────────────────────────┘   ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 18 + Vite | Citizen PWA & Admin Dashboard |
| **Styling** | Tailwind CSS + shadcn/ui | Responsive, accessible UI components |
| **Offline** | Service Workers + IndexedDB (Dexie.js) | Offline-first observation capture & sync queue |
| **Camera** | WebRTC Media API | In-browser photo & video capture |
| **Maps** | Leaflet.js + OpenStreetMap | Site geolocation & stream heatmaps |
| **Backend** | Node.js 20 + Express 5 | REST API & WebSocket notifications |
| **Auth** | JWT + bcrypt | Stateless citizen & reviewer authentication |
| **ORM** | Prisma | Type-safe database access |
| **Database** | PostgreSQL 16 + PostGIS | Observation storage & spatial queries |
| **Cache / Queue** | Redis 7 + BullMQ | Job queue, rate limiting, session cache |
| **Object Storage** | AWS S3 / MinIO (self-hosted) | Photo & video media storage |
| **AI — Primary** | OpenAI GPT-4o (Vision) | Evidence detection, follow-up generation, cross-validation |
| **AI — Fallback** | Google Gemini 1.5 Pro | Vision fallback & redundancy |
| **AI — Image QA** | Custom CV model (ONNX) | Blur, brightness, occlusion scoring (edge-deployable) |
| **FHIR** | hl7.eu.fhir.ig.oah (R4) | Interoperability export for health authorities |
| **Containerisation** | Docker + Docker Compose | Local dev & cloud deployment |
| **CI/CD** | GitHub Actions | Lint → Test → Build → Deploy |
| **Testing** | Vitest + Supertest + Playwright | Unit, integration & E2E tests |

---

## 🤖 AI Pipeline — The 4 Layers

### Layer A — Image Quality Engine

> *"Garbage in, garbage out. Layer A ensures only usable images enter the pipeline."*

Every photo submitted by a citizen passes through a lightweight **ONNX computer vision model** that runs both on-device (edge) and server-side:

| Check | Method | Threshold | Impact on Score |
|---|---|---|---|
| **Blur Detection** | Laplacian variance | < 80 → fail | −25 pts |
| **Brightness** | HSV value channel mean | < 30 or > 220 → fail | −15 pts |
| **Occlusion** | Object segmentation coverage | > 60% blocked → fail | −20 pts |
| **Stream Relevance** | Binary classifier (stream / no stream) | Confidence < 0.7 → fail | −30 pts |
| **Duplicate Detection** | Perceptual hash (pHash) + cosine similarity | > 0.95 match → reject | Hard reject |

**Quality Score (0–100):** Computed as a weighted sum of the above checks. Images scoring below **40** are immediately returned to the citizen with specific improvement guidance (e.g., "Photo is too blurry — please retake in better lighting"). Images between **40–69** are accepted but flagged for human review.

---

### Layer B — Ecological Evidence Detection

> *"What does the stream actually look like? Layer B reads the image so the citizen doesn't have to know the vocabulary."*

Using **GPT-4o Vision** (with Gemini 1.5 Pro as fallback), Layer B analyses each accepted image and returns a structured JSON evidence report covering:

| Indicator | What It Detects | Output |
|---|---|---|
| **Turbidity** | Water clarity — clear, cloudy, murky, opaque | Categorical + confidence |
| **Debris & Litter** | Plastic, foam, waste material visible in stream | Boolean + coverage estimate (%) |
| **Algal Bloom** | Green/brown surface mats, discolouration | Boolean + severity (low / medium / high) |
| **Riparian Vegetation** | Bank vegetation density & type | Categorical (dense / sparse / absent) |
| **Concrete Channel** | Modified vs natural stream channel | Boolean |
| **Flow Conditions** | Flowing, stagnant, dry | Categorical + estimated flow |

All detections are stored as structured `AIEvidence` records linked to the observation, providing an **auditable AI interpretation** separate from the citizen's own description.

---

### Layer C — Smart Follow-up Questions

> *"The AI becomes a knowledgeable field companion, asking exactly the right questions based on what it sees."*

After Layer B completes, Layer C uses an LLM prompt chain to generate **3–5 targeted, context-driven follow-up questions** tailored to the specific evidence detected. Questions are:

- **Adaptive** — based solely on detected evidence (no irrelevant questions)
- **Plain-language** — designed for non-expert citizens (no jargon)
- **Bounded** — presented as multiple-choice or simple scales where possible
- **Sequential** — higher-priority concerns asked first

**Example Adaptive Question Sets:**

```
EVIDENCE DETECTED: Algal bloom (high severity) + murky water

Generated Questions:
  Q1: "Does the water have an unusual smell today? (None / Slight / Strong)"
  Q2: "How long has the water looked this colour? (Today / A few days / Ongoing)"
  Q3: "Have you seen any dead fish or animals nearby? (Yes / No / Unsure)"
  Q4: "Is there any discharge pipe or drain visible upstream? (Yes / No)"
```

```
EVIDENCE DETECTED: Debris (12% coverage) + clear water

Generated Questions:
  Q1: "What type of litter is most common? (Plastic / Foam / Paper / Mixed)"
  Q2: "Is this the first time you've seen litter here? (Yes / No / Seasonal)"
  Q3: "Approximately how much debris would you say is present? (A little / Moderate / A lot)"
```

---

### Layer D — Cross-Validation Engine

> *"Trust, but verify. Layer D checks whether the citizen's words match the AI's eyes and the site's history."*

Layer D performs **three-way consistency validation**:

```
  ┌─────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
  │  Citizen Answers    │    │  AI Image Analysis   │    │  Historical Site     │
  │  (Layer C replies)  │    │  (Layer B evidence)  │    │  Baseline Data       │
  └──────────┬──────────┘    └──────────┬───────────┘    └──────────┬───────────┘
             │                          │                            │
             └──────────────────────────▼────────────────────────────┘
                                        │
                             ┌──────────▼──────────┐
                             │   LLM Consistency   │
                             │   Arbitration       │
                             │                     │
                             │  CONSISTENT → +pts  │
                             │  MINOR CONFLICT     │
                             │    → note added     │
                             │  MAJOR CONFLICT     │
                             │    → REVIEW flag    │
                             └─────────────────────┘
```

Conflicts are graded:
- **Consistent** — Citizen answers align with image evidence → confidence boosted
- **Minor conflict** — Small discrepancies (e.g., citizen says "a little debris", image shows moderate) → noted, confidence slightly reduced
- **Major conflict** — Citizen claims "clear water", image shows opaque → `REVIEW_REQUIRED` state triggered automatically

---

## 🔄 Observation State Machine

Every observation follows a strict, auditable lifecycle:

```
                    ┌─────────┐
                    │  DRAFT  │  (citizen building observation locally)
                    └────┬────┘
                         │ submit()
                    ┌────▼────────┐
                    │  SUBMITTED  │  (received by server, queued for AI)
                    └────┬────────┘
                         │ ai_pipeline_start()
                    ┌────▼────────┐
                    │  AI_CHECK   │  (Layers A → B → C → D running)
                    └────┬────────┘
                         │
            ┌────────────┼────────────┐
            │ score ≥ 50 │            │ score < 50
       ┌────▼────┐       │       ┌────▼──────────────┐
       │  VALID  │       │       │  REVIEW_REQUIRED   │
       └────┬────┘       │       └────────┬───────────┘
            │            │                │ reviewer_assigned()
            │            │       ┌────────▼──────────┐
            │            │       │   HUMAN_REVIEW     │
            │            │       └────────┬───────────┘
            │            │                │
            │            │    ┌───────────┼─────────────┐
            │            │    │ approve() │             │ correct()
            │            │  ┌─▼─────────┐│       ┌─────▼──────────┐
            │            │  │ ACCEPTED  ││       │   CORRECTED    │
            │            │  └───────────┘│       └────────────────┘
            └────────────┘               │
                                    (corrected observation loops back
                                     to VALID with audit trail)
```

**State Descriptions:**

| State | Description | Actor |
|---|---|---|
| `DRAFT` | Observation being composed offline or online | Citizen |
| `SUBMITTED` | Observation received by server; AI job enqueued | System |
| `AI_CHECK` | All four AI layers actively processing | AI Workers |
| `VALID` | AI confidence ≥ 50; accepted for analytics | System |
| `REVIEW_REQUIRED` | AI confidence < 50 or major conflict detected | System |
| `HUMAN_REVIEW` | Assigned to a certified reviewer | Reviewer |
| `ACCEPTED` | Reviewer confirmed observation is accurate | Reviewer |
| `CORRECTED` | Reviewer amended observation; corrections logged | Reviewer |

---

## 📊 Confidence Score Breakdown

The overall confidence score (0–100) is a weighted composite of five factors:

| # | Factor | Weight | Description |
|---|---|---|---|
| 1 | **Image Quality** (Layer A) | 25% | Quality score from the CV model (blur, brightness, relevance) |
| 2 | **Evidence Richness** (Layer B) | 30% | Number and certainty of ecological indicators detected |
| 3 | **Question Completeness** (Layer C) | 15% | Fraction of follow-up questions answered (vs skipped) |
| 4 | **Answer–Image Consistency** (Layer D) | 20% | Degree of alignment between citizen answers and image evidence |
| 5 | **Historical Site Consistency** | 10% | Agreement with the site's established ecological baseline |

```
Confidence Score = (ImgQual × 0.25) + (EvidRich × 0.30) +
                   (QComplete × 0.15) + (Consist × 0.20) +
                   (HistConsist × 0.10)
```

> [!NOTE]
> A score of **0–49** routes to human review. A score of **50–74** is accepted but annotated as "moderate confidence". A score of **75–100** is accepted as high-confidence and eligible for automated analytics pipelines.

---

## 🛡️ AI Safety Policy

AquaGuard AI is designed with explicit guardrails. The following policy is enforced at the code level and is non-negotiable for the system to operate.

### ✅ What AI MAY Do

- Score image quality and return actionable improvement feedback to citizens
- Identify and describe visible ecological evidence in submitted photos
- Generate contextually relevant follow-up questions based on detected evidence
- Flag inconsistencies between citizen answers and image evidence
- Compute a confidence score and recommend a routing decision (auto-accept or human review)
- Summarise its own reasoning in a human-readable explanation attached to each assessment
- Detect anomalous observations compared to historical site baselines

### ❌ What AI MUST NOT Do

- **Final accept or reject** any observation without a human override option
- **Identify individual citizens** from images or metadata (PII is stripped before AI processing)
- **Make regulatory or enforcement recommendations** — AI output is advisory only
- **Overwrite a human reviewer's decision** — human decisions are final and immutable
- **Access raw media files** after processing — media is referenced by signed URL with time-limited access
- **Store AI model responses containing PII** — all AI outputs are sanitised before persistence
- **Operate in a degraded state silently** — if the AI pipeline fails, the observation must be routed to human review automatically

> [!CAUTION]
> Any modification to the AI Safety Policy must be reviewed by all three team members and documented in the `AUDIT_POLICY.md` file before deployment.

---

## 🗄️ Data Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CORE ENTITIES                                   │
└─────────────────────────────────────────────────────────────────────────┘

Site
├── id              UUID (PK)
├── name            VARCHAR(255)
├── location        GEOMETRY(Point, 4326)   ← PostGIS
├── watershed       VARCHAR(100)
├── baseline        JSONB                   ← historical ecological profile
├── createdAt       TIMESTAMPTZ
└── updatedAt       TIMESTAMPTZ

Observation
├── id              UUID (PK)
├── siteId          UUID (FK → Site)
├── citizenId       UUID (FK → User)
├── state           ENUM (DRAFT … CORRECTED)
├── submittedAt     TIMESTAMPTZ
├── citizenNotes    TEXT
├── gpsPoint        GEOMETRY(Point, 4326)
├── confidenceScore DECIMAL(5,2)
├── aiSummary       TEXT
└── fhirBundleId    VARCHAR(100)            ← populated after FHIR export

Media
├── id              UUID (PK)
├── observationId   UUID (FK → Observation)
├── type            ENUM (photo, video)
├── s3Key           VARCHAR(500)
├── mimeType        VARCHAR(100)
├── sizeBytes       INTEGER
├── capturedAt      TIMESTAMPTZ
└── pHash           VARCHAR(64)             ← perceptual hash for dedup

AIResult
├── id              UUID (PK)
├── observationId   UUID (FK → Observation)
├── layerA_score    DECIMAL(5,2)            ← image quality
├── layerB_summary  JSONB                   ← evidence detection output
├── layerC_questions JSONB                  ← generated questions + answers
├── layerD_conflicts JSONB                  ← consistency issues
├── confidenceScore DECIMAL(5,2)
├── routingDecision ENUM (auto_accept, human_review)
├── modelUsed       VARCHAR(100)
├── promptVersion   VARCHAR(20)
└── processedAt     TIMESTAMPTZ

AIEvidence
├── id              UUID (PK)
├── aiResultId      UUID (FK → AIResult)
├── indicator       VARCHAR(100)            ← e.g. "turbidity", "algal_bloom"
├── value           VARCHAR(255)            ← detected value
├── confidence      DECIMAL(5,2)
└── boundingBox     JSONB                   ← optional region annotation

HumanReview
├── id              UUID (PK)
├── observationId   UUID (FK → Observation)
├── reviewerId      UUID (FK → User)
├── decision        ENUM (accepted, corrected, rejected)
├── notes           TEXT
├── corrections     JSONB                   ← field-level corrections
├── reviewedAt      TIMESTAMPTZ
└── timeSpentSeconds INTEGER               ← reviewer efficiency metric

AuditLog
├── id              UUID (PK)
├── entityType      VARCHAR(50)
├── entityId        UUID
├── action          VARCHAR(100)
├── actorId         UUID
├── actorRole       ENUM (citizen, ai, reviewer, admin)
├── payload         JSONB
└── occurredAt      TIMESTAMPTZ
```

---

## 🔌 Core API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | Public | Register new citizen account |
| `POST` | `/api/v1/auth/login` | Public | Obtain JWT token |
| `GET` | `/api/v1/sites` | Citizen | List monitored stream sites |
| `GET` | `/api/v1/sites/:id` | Citizen | Site detail + baseline profile |
| `GET` | `/api/v1/sites/:id/timeline` | Citizen | Chronological site observations |
| `POST` | `/api/v1/observations` | Citizen | Submit new observation (draft or final) |
| `GET` | `/api/v1/observations/:id` | Citizen | Get observation + AI result |
| `PATCH` | `/api/v1/observations/:id/answers` | Citizen | Submit Layer C answers |
| `GET` | `/api/v1/observations/:id/status` | Citizen | Poll observation processing state |
| `POST` | `/api/v1/media/upload` | Citizen | Request presigned S3 upload URL |
| `POST` | `/api/v1/media/:id/confirm` | Citizen | Confirm upload complete; trigger Layer A |
| `GET` | `/api/v1/review/queue` | Reviewer | List observations requiring human review |
| `GET` | `/api/v1/review/:id` | Reviewer | Full review package (media + AI result) |
| `POST` | `/api/v1/review/:id/decision` | Reviewer | Submit accept / correct / reject decision |
| `GET` | `/api/v1/analytics/anomalies` | Admin | Recent anomaly detections across all sites |
| `GET` | `/api/v1/analytics/confidence-distribution` | Admin | Score histogram across observations |
| `GET` | `/api/v1/fhir/Observation/:id` | Admin | FHIR R4 Observation resource export |
| `GET` | `/api/v1/fhir/Bundle/site/:siteId` | Admin | FHIR R4 Bundle for a full site timeline |

All endpoints return `application/json`. Errors follow [RFC 7807 Problem Details](https://datatracker.ietf.org/doc/html/rfc7807).

---

## 📶 Offline Sync Architecture

AquaGuard AI is designed for citizens in low-connectivity environments. The PWA uses a **Service Worker + IndexedDB** architecture to capture observations fully offline and sync when connectivity is restored.

```
  ┌───────────────────────────────────────────────────────────────────────┐
  │                     OFFLINE SYNC STATE MACHINE                        │
  └───────────────────────────────────────────────────────────────────────┘

  ┌─────────┐   capture()   ┌──────────┐  connectivity   ┌────────────┐
  │  LOCAL  │──────────────▶│  QUEUED  │────────────────▶│ UPLOADING  │
  │(IndexedDB│              │ (pending │   restored +     │ (S3 media  │
  │ only)   │              │  upload) │  retry trigger   │  + API)    │
  └─────────┘              └──────────┘                  └─────┬──────┘
                                                               │
                                             ┌─────────────────┤
                                  server     │                 │ upload
                                  processes  │                 │ error
                                  AI layers  │           ┌─────▼──────┐
                                             │           │   FAILED   │
                                   ┌─────────▼──────┐    │ (retry 3x) │
                                   │   PROCESSING   │    └────────────┘
                                   │ (server-side   │
                                   │  AI pipeline)  │
                                   └─────────┬──────┘
                                             │
                                   ┌─────────▼──────┐
                                   │     SYNCED     │
                                   │ (local record  │
                                   │  updated with  │
                                   │  server state) │
                                   └────────────────┘
```

**Sync Guarantees:**
- Observations are **never lost** — all data lives in IndexedDB until a confirmed server acknowledgement is received
- Media uploads use **chunked multipart upload** with resume support
- Conflict resolution favours **server state** for AI results, **citizen state** for captured field data
- Citizens receive a **push notification** (Web Push API) when their observation completes processing

---

## 🏥 FHIR R4 Interoperability

AquaGuard AI exports verified observations as **HL7 FHIR R4** resources, aligned with the **[hl7.eu.fhir.ig.oah](https://build.fhir.org/ig/HL7-EU/oah/)** implementation guide (One Aqua Health).

### Adapter Pattern

```typescript
// CanonicalObservation → FHIR R4 Observation adapter

interface CanonicalObservation {
  id: string;
  siteId: string;
  submittedAt: string;
  confidenceScore: number;
  evidence: AIEvidence[];
  citizenNotes: string;
  gpsPoint: { lat: number; lng: number };
}

function toFhirObservation(obs: CanonicalObservation): fhir4.Observation {
  return {
    resourceType: "Observation",
    id: obs.id,
    meta: {
      profile: ["https://build.fhir.org/ig/HL7-EU/oah/StructureDefinition/oah-stream-observation"],
    },
    status: "final",
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/observation-category",
            code: "environment",
            display: "Environment",
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: "http://snomed.info/sct",
          code: "364712009",
          display: "Water quality observable",
        },
      ],
    },
    effectiveDateTime: obs.submittedAt,
    valueString: obs.citizenNotes,
    component: obs.evidence.map((e) => ({
      code: {
        coding: [{ system: "https://aquaguard.ai/fhir/CodeSystem/evidence", code: e.indicator }],
      },
      valueString: e.value,
      extension: [
        {
          url: "https://aquaguard.ai/fhir/StructureDefinition/ai-confidence",
          valueDecimal: e.confidence,
        },
      ],
    })),
    extension: [
      {
        url: "https://aquaguard.ai/fhir/StructureDefinition/confidence-score",
        valueDecimal: obs.confidenceScore,
      },
      {
        url: "https://aquaguard.ai/fhir/StructureDefinition/gps-location",
        valueString: `${obs.gpsPoint.lat},${obs.gpsPoint.lng}`,
      },
    ],
  };
}
```

### FHIR Resource Coverage

| FHIR Resource | Usage |
|---|---|
| `Observation` | Individual citizen observation with AI evidence components |
| `Bundle` | Full site timeline as a searchset bundle |
| `Location` | Stream site with GPS coordinates |
| `Device` | Citizen device metadata (model, OS, app version) |
| `Provenance` | AI assessment audit trail (who did what, when) |

---

## 👥 Team

| Role | Responsibilities |
|---|---|
| **Member A** — Backend Lead | Node.js API design, PostgreSQL/PostGIS schema, BullMQ job queue, FHIR adapter, Docker infrastructure |
| **Member B** — AI/ML Engineer | ONNX image quality model, GPT-4o/Gemini prompt engineering, Layer B–D pipeline, confidence scoring algorithm |
| **Member C** — Frontend/UX + Submission | React PWA, Service Worker offline sync, Leaflet maps, Admin Review Dashboard, Devpost submission, README |

---

## 🚀 Setup & Installation

### Prerequisites

- **Node.js** ≥ 20.x
- **Docker** & **Docker Compose** v2
- **Git**
- An **OpenAI API key** or **Google Gemini API key**

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-org/aquaguard-ai.git
cd aquaguard-ai

# 2. Configure environment
cp .env.example .env
# → Edit .env and fill in your API keys and database credentials

# 3. Start infrastructure (PostgreSQL, Redis, MinIO)
docker-compose up -d

# 4. Install dependencies
npm install

# 5. Run database migrations
npm run migrate

# 6. Seed reference data (sites, test users)
npm run seed

# 7. Start the development server
npm run dev
```

The API will be available at `http://localhost:3000` and the PWA at `http://localhost:5173`.

### Running Tests

```bash
# Unit tests
npm run test

# Integration tests (requires Docker services running)
npm run test:integration

# End-to-end tests (Playwright)
npm run test:e2e

# All tests with coverage report
npm run test:coverage
```

### Production Build

```bash
# Build frontend PWA
npm run build:frontend

# Build backend
npm run build:backend

# Start production server
npm run start
```

---

## ⚙️ Environment Variables

Create a `.env` file in the project root by copying `.env.example`:

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string (with PostGIS) |
| `REDIS_URL` | ✅ | — | Redis connection string for queues and cache |
| `S3_BUCKET` | ✅ | — | S3 bucket name for media storage |
| `S3_ENDPOINT` | ✅ | — | S3 endpoint URL (use MinIO URL for local dev) |
| `S3_ACCESS_KEY` | ✅ | — | S3 / MinIO access key |
| `S3_SECRET_KEY` | ✅ | — | S3 / MinIO secret key |
| `AI_PROVIDER` | ✅ | `openai` | Primary AI provider (`openai` or `gemini`) |
| `OPENAI_API_KEY` | ⚠️ | — | Required if `AI_PROVIDER=openai` |
| `OPENAI_MODEL` | ❌ | `gpt-4o` | OpenAI model name |
| `GEMINI_API_KEY` | ⚠️ | — | Required if `AI_PROVIDER=gemini` or as fallback |
| `GEMINI_MODEL` | ❌ | `gemini-1.5-pro` | Gemini model name |
| `JWT_SECRET` | ✅ | — | Secret for signing JWT tokens (min 32 chars) |
| `JWT_EXPIRY` | ❌ | `7d` | JWT token expiry duration |
| `AI_CONFIDENCE_THRESHOLD` | ❌ | `50` | Confidence score routing threshold |
| `MAX_MEDIA_SIZE_MB` | ❌ | `25` | Maximum media file size in megabytes |
| `WORKER_CONCURRENCY` | ❌ | `4` | Number of concurrent AI assessment workers |
| `LOG_LEVEL` | ❌ | `info` | Logging level (`debug`, `info`, `warn`, `error`) |
| `PORT` | ❌ | `3000` | API server port |
| `FRONTEND_URL` | ✅ | — | PWA origin for CORS configuration |
| `VAPID_PUBLIC_KEY` | ⚠️ | — | Web Push VAPID public key (for notifications) |
| `VAPID_PRIVATE_KEY` | ⚠️ | — | Web Push VAPID private key |

> [!WARNING]
> **Never commit `.env` to version control.** The `.gitignore` is pre-configured to exclude it. Use your team's secure secret-sharing method (e.g., 1Password, GitHub Secrets) for production credentials.

---

## 🎬 Demo Scenario

A complete end-to-end walkthrough of the AquaGuard AI citizen-to-reviewer flow:

| Step | Actor | Action | System Response |
|---|---|---|---|
| **1** | Citizen | Opens AquaGuard PWA while offline at the stream site | Service Worker loads cached app; IndexedDB stores draft |
| **2** | Citizen | Selects stream site "Blackwood Creek — Section 4" on the map | Site baseline profile loaded from cache |
| **3** | Citizen | Takes three photos of visible algal bloom and murky water | Camera API captures images; stored in IndexedDB |
| **4** | Citizen | Adds voice note: "Green stuff on the surface, smells bad" | Audio transcribed client-side; saved to draft |
| **5** | Citizen | Taps **Submit** — connectivity restored en route home | Service Worker dequeues; chunked upload to S3 begins |
| **6** | System | Upload confirmed; AI pipeline job enqueued in BullMQ | Observation state → `SUBMITTED` |
| **7** | AI (Layer A) | Image quality scored: 72/100 (good), no duplicates | Layer A passes; state → `AI_CHECK` |
| **8** | AI (Layer B) | Evidence detected: algal bloom (high), turbidity (murky), no debris | `AIEvidence` records created |
| **9** | AI (Layer C) | 4 follow-up questions generated; push notification sent to citizen | Citizen receives: "Please answer 4 questions about your observation" |
| **10** | Citizen | Answers questions in PWA (smell: strong, duration: ongoing, dead fish: yes) | Answers stored; Layer D triggered |
| **11** | AI (Layer D) | Answers consistent with image; historical baseline: anomalous | Confidence: **82/100** → `VALID`; anomaly flagged |
| **12** | Reviewer | Receives anomaly alert in Analytics Dashboard; views observation | Observation `ACCEPTED`; FHIR Bundle exported to health authority |

---

## 📐 Evaluation Criteria Alignment

| Criteria | Weight | How AquaGuard Addresses It |
|---|---|---|
| **Impact** | High | Directly improves the quality of citizen environmental data used for One Health decisions. Anomaly detection enables early warning for water-borne health risks affecting humans and animals downstream. |
| **Technical Excellence** | High | Four-layer AI pipeline with edge-deployable quality scoring, LLM evidence detection, adaptive question generation, and cross-validation. FHIR R4 export aligns with international interoperability standards. |
| **User Experience** | Medium | Offline-first PWA requires no app store installation. Adaptive questions guide non-expert citizens naturally. Actionable image feedback (e.g., "too blurry") improves submission quality in real time. |
| **Scalability** | Medium | BullMQ worker pool scales horizontally. PostgreSQL + PostGIS handles millions of geotagged observations. AI Gateway abstracts provider so OpenAI can be swapped for local models at scale. |
| **Innovation** | High | Combination of edge CV (ONNX), LLM adaptive questioning, and three-way cross-validation for citizen science is novel. Confidence scoring provides a quantitative trust layer absent from existing citizen science platforms. |

---

## ⚠️ Limitations

> [!IMPORTANT]
> The following limitations apply to the hackathon prototype and are acknowledged openly:

1. **AI accuracy is not 100%** — Layer B evidence detection has not been trained on domain-specific stream imagery; it relies on GPT-4o's general vision capabilities. Fine-tuning with labelled stream photos is required for production reliability.

2. **Confidence threshold is heuristic** — The 0–100 confidence score weights (25/30/15/20/10) were determined through team consensus, not statistical calibration against a labelled dataset.

3. **ONNX model is a prototype** — The Layer A image quality model was trained on a small publicly available blurry-image dataset, not stream-specific photography.

4. **No real-time review SLA** — The human review queue has no guaranteed response time in the prototype; production would require reviewer availability contracts.

5. **FHIR IG conformance is partial** — The FHIR export passes structural validation but has not been tested against the full `hl7.eu.fhir.ig.oah` conformance test suite.

6. **Single-region deployment** — The prototype deploys to a single cloud region; a production system would require multi-region replication for resilience and data sovereignty compliance.

7. **No accessibility audit** — The PWA has not undergone a formal WCAG 2.1 AA audit; some accessibility gaps may exist.

---

## 🗺️ Roadmap

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          AQUAGUARD AI ROADMAP                              │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  V1 — HACKATHON PROTOTYPE (September–October 2026)                         │
│  ─────────────────────────────────────────────────                         │
│  ✅ 4-layer AI assessment pipeline                                         │
│  ✅ Offline-first PWA with sync queue                                      │
│  ✅ Confidence scoring & state machine                                     │
│  ✅ Human review dashboard                                                 │
│  ✅ FHIR R4 basic export                                                   │
│  ✅ Docker Compose local deployment                                         │
│                                                                            │
│  V2 — PILOT DEPLOYMENT (Q1 2027)                                           │
│  ──────────────────────────────                                            │
│  🔲 Domain-specific image quality model (stream-trained ONNX)             │
│  🔲 Statistically calibrated confidence weights                           │
│  🔲 Full hl7.eu.fhir.ig.oah conformance                                   │
│  🔲 Multi-language support (ES, PT, FR)                                   │
│  🔲 Reviewer performance analytics                                        │
│  🔲 Mobile app wrapper (Capacitor)                                        │
│  🔲 Real-time anomaly SMS/email alerts                                    │
│                                                                            │
│  V3 — PRODUCTION (Q3 2027)                                                 │
│  ─────────────────────────                                                 │
│  🔲 Multi-region cloud deployment                                         │
│  🔲 Fine-tuned open-source LLM (privacy-preserving; on-premises option)   │
│  🔲 Integration with national water quality authority APIs                │
│  🔲 Citizen gamification & reputation scoring                             │
│  🔲 Species presence/absence detection (Layer B extension)                │
│  🔲 One Health dashboard: human + animal + ecosystem indicators           │
│  🔲 WCAG 2.1 AA certified accessibility                                   │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 📄 License

This project is licensed under the **MIT License**.

```
MIT License

Copyright (c) 2026 AquaGuard AI Team — OneAquaHealth IEEE Hackathon

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 🙏 Acknowledgements

We gratefully acknowledge the following organisations whose work made AquaGuard AI possible:

| Organisation | Contribution |
|---|---|
| **[OneAquaHealth](https://www.oneaquahealth.org)** | Organising the IEEE Global Hackathon and defining the Track 3 challenge brief that inspired AquaGuard AI |
| **[IEEE](https://www.ieee.org)** | Providing the global platform and community for this environmental health hackathon |
| **[HL7 Europe](https://hl7.eu)** | Developing and publishing the `hl7.eu.fhir.ig.oah` FHIR Implementation Guide for One Aqua Health interoperability |
| **OpenAI** | GPT-4o Vision API used for ecological evidence detection and cross-validation |
| **Google DeepMind** | Gemini 1.5 Pro API used as the AI fallback provider |
| **OpenStreetMap Contributors** | Base map data for stream site visualisation |

---

<div align="center">

**AquaGuard AI** · OneAquaHealth IEEE Hackathon 2026 · Track 3: AI-Supported Assessment

*Built with ❤️ for cleaner streams and healthier ecosystems*

[🐛 Report a Bug](https://github.com/your-org/aquaguard-ai/issues) · [💡 Request a Feature](https://github.com/your-org/aquaguard-ai/issues) · [📬 Contact the Team](mailto:team@aquaguard.ai)

</div>

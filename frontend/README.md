# 🌊 AquaGuard AI — Frontend Application (Member C Deliverables)

> **OneAquaHealth IEEE Global Hackathon 2026 | Track 3: AI-Supported Assessment**  
> **Role:** Member C (Frontend Engineer / UX + Submission Lead)  
> **Stack:** React 19, TypeScript, Vite, Vanilla CSS Design System, Lucide Icons, Canvas Confetti, IndexedDB / LocalStorage, PWA Service Worker

---

## 🚀 Overview

The **AquaGuard AI Frontend** bridges the citizen scientist in the field and the expert environmental reviewer in the regional office. It delivers an offline-capable, responsive Progressive Web Application (PWA) with a streamlined 5-step citizen observation protocol, real-time Layer A image quality feedback, conversational adaptive verification questions, interactive conflict resolution, expert reviewer triaging with bounding boxes, longitudinal site health trend charts, and HL7 FHIR R4 interoperability export.

---

## 🛠 Features Implemented by Member C

### 1. Citizen Multi-Step Field Assessment (`/observe`)
- **Step 1 — Site Selection:** Interactive location picker across monitored catchment sites (Merri Creek, Yarra River, Darebin Creek) with baseline clarity statistics and PostGIS coordinate locks.
- **Step 2 — Photo Capture & Real-time Layer A Quality Check:**
  - Fast evaluation of edge sharpness (Laplacian variance), exposure histograms, framing occlusion, and stream environmental relevance.
  - Interactive simulator toggling between sharp stream photos and motion-blurred photos.
  - Actionable feedback cards prompting citizens to stabilize their device or adjust lighting before submission.
- **Step 3 — Environmental Observation Form:** Structured inputs for water clarity, odor, floating litter, stream flow speed, and riparian buffer types.
- **Step 4 — AI Evidence Detection & Adaptive Verification:**
  - Visual indicator cards showing Layer B detections (turbidity, plastic litter, riparian canopy, weir flow) with confidence ratings.
  - Layer C context-driven adaptive follow-up questions selected from a 25-question bank.
  - **Conflict Resolution Card:** Fires when citizen responses conflict with vision detections (e.g., citizen selected "clear" but AI detected "turbidity with 94% confidence"), offering options to update answers, retain original answers, or add an explanatory note.
- **Step 5 — Confidence & Provenance Review:**
  - 5-factor weighted reliability score gauge (0–100) and breakdown table:
    $$\text{Score} = \text{Image Quality (25\%)} + \text{Evidence Agreement (30\%)} + \text{Citizen Consistency (25\%)} + \text{GPS (10\%)} + \text{History (10\%)}$$
  - Transparent routing classification: `VALID` ($\ge 80$), `REVIEW_REQUIRED` ($60\text{–}79$), or `HUMAN_REVIEW` ($< 60$).
  - Confetti celebration upon successful verification and offline queue sync.

### 2. Reviewer Workspace & Triaging Dashboard (`/review`)
- Key metric cards: Pending review (14), Accepted (87), Rejected (6), Anomalies (3).
- Filterable queue table with live search, status dropdown, confidence slider, and anomaly toggles.
- **Side-by-side Inspection Modal:**
  - Left panel: Stream photograph with interactive **AI Bounding Box overlay** highlighting turbidity sediment regions and floating plastic bottles.
  - Right panel: Non-destructive audit comparison displaying immutable raw citizen responses, AI detections, and historical site baselines.
  - Review actions: **Accept As Is**, **Accept with Correction** (opens inline correction fields preserving separate `citizenObservation`, `aiAssessment`, and `humanAssessment`), **Reject**, and **Request Resubmission**.

### 3. Site Health Intelligence & Longitudinal Analytics (`/sites`)
- Multi-site selector.
- 9-week longitudinal chart tracking weekly clarity changes against normal seasonal baselines.
- Statistical anomaly detection flags highlighting high Z-scores ($Z > 2.0$) for sudden pollution pulses.
- Ecological trend matrix (↑, ↓, →) for clarity, plastic debris, and riparian buffers.

### 4. Citizen Observation Tracker (`/my-observations`)
- Chronological list of user submissions with live status pills (`LOCAL`, `QUEUED`, `SYNCED`, `VALID`, `REVIEW_REQUIRED`, `ACCEPTED`).
- Detailed inspection drawer with timestamps and explainability notes.

### 5. HL7 FHIR R4 Export Preview (`/fhir`)
- Real-time generation of valid HL7 FHIR R4 `Observation` JSON compliant with `hl7.eu.fhir.oah` and `sushi-config.yaml`.
- Copy-to-clipboard and `.json` download capabilities.

### 6. Interactive 12-Step Golden Demo Runner
- Floating guided tour walking through the exact 12-step hackathon scenario specified in `AQUAGUARD_BUILD_PLAN.md`.

### 7. PWA Offline Architecture & Network Simulation
- Standalone `manifest.json` and `service-worker.js` with offline caching.
- Live network status simulation toggle in the top navigation bar.

---

## 🏃 Running the Application

```bash
cd frontend
npm install
npm run dev
```

Navigate to `http://localhost:5173/` in your browser.

To validate TypeScript compilation and produce a production build:
```bash
npm run build
```

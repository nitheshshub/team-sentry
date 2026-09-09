# FitSense AI / FlexSense - Universal Backend & Telemetry Bridge API

> **Smart Rehabilitation & Joint Motion Analytics Platform**  
> Built for **Hack Summit 7.0 at Aaruush, SRM Institute of Science and Technology, Kattankulathur**.  
> **Team:** Nithesh P (Team Lead & Developer), Koushik G, Sujay S (Team HackElite & Team Razers).

---

## 📌 Mission & Technical Overview

FitSense AI / FlexSense provides real-time posture correction, multi-modal feedback (haptic vibration, buzzer beeps, voice prompts), and remote clinician monitoring using physical IoT sensor precision—**completely removing computer vision or camera dependencies**.

### Key System Highlights
- **Dual MPU6050 IMU Sensors**: Wearable thigh and shin straps measure 3D joint orientation and relative flexion angles ($0^\circ - 135^\circ$).
- **Express & TypeScript REST API**: Serves patient clinical portfolios across 5 status categories (*Improving, Stable, Needs Attention, Recently Inactive, High Performing*).
- **Real-Time WebSocket Engine (`/ws/telemetry`)**: Streams joint angles and repetition state machine transitions to clinical web dashboards at < 50ms latency.
- **Rule-Based Evaluation Engine**: Repetition State Machine (`REST` $\rightarrow$ `FLEXION` $\rightarrow$ `PEAK_HOLD` $\rightarrow$ `EXTENSION`) tracking ROM targets, rep counting, and form accuracy.
- **Demo Recovery Score Calculator**: Computes weighted scores based on movement accuracy (40%), ROM target achievement (40%), and session compliance (20%).
- **Universal Render Deployment**: Cloud API ready for 1-click deployment on **Render.com** via `render.yaml`.
- **Laptop Local Serial Bridge**: Standalone Node.js script (`scripts/local-serial-bridge.js`) to capture local ESP32 USB COM port signals on your laptop and forward them to your Render cloud API.

---

## 🏗️ Architecture & Signal Flow

```
+---------------------------+       USB Serial (115200)      +------------------------------------+
|  Dual MPU6050 Wearable    |  --------------------------->  |  Laptop Local Serial Bridge        |
|  ESP32 Microcontroller    |   {"flexion": 85.2, ...}       |  (scripts/local-serial-bridge.js)  |
+---------------------------+                                +------------------------------------+
                                                                               |
                                                                               | HTTP POST / WebSocket Ingestion
                                                                               v
                                                             +------------------------------------+
                                                             |  Universal Render Cloud Backend    |
                                                             |  (https://fitsense-api.onrender)   |
                                                             +------------------------------------+
                                                                  |                        |
                                             Evaluation Engine    |                        | Live Telemetry Stream
                                             & Recovery Score     v                        v
                                                             [ Rep State Machine ]    [ Clinician Dashboard / WS Client ]
```

---

## 🚀 Quick Start Guide

### 1. Installation
```bash
# Navigate to backend directory
cd fitsense-ai-backend

# Install dependencies
npm install
```

### 2. Run Development Server (Local Express + WebSocket + Simulator)
```bash
npm run dev
```
- Server starts on `http://localhost:5000`
- Live physics simulator generates synthetic Dual MPU6050 joint angles automatically when no physical COM port is connected.

### 3. Connect Physical ESP32 Hardware (Local Laptop Bridge)
Plug your ESP32 into your laptop via USB cable, then run:
```bash
# Windows example:
node scripts/local-serial-bridge.js COM3 http://localhost:5000

# Render Cloud API example:
node scripts/local-serial-bridge.js COM3 https://fitsense-ai-backend.onrender.com
```

---

## ☁️ Deploying to Render.com

1. Push this repository to GitHub/GitLab.
2. Log into [Render.com](https://render.com) and click **New +** $\rightarrow$ **Blueprints**.
3. Connect your repository. Render will automatically detect `render.yaml` and configure the web service.
4. Once deployed, copy your Render external URL (e.g. `https://fitsense-ai-backend.onrender.com`).
5. Run the local serial bridge script on your laptop pointing to your Render URL:
   ```bash
   node scripts/local-serial-bridge.js COM3 https://fitsense-ai-backend.onrender.com
   ```

---

## 📡 REST API Reference

### Health & System Status
- `GET /api/health` — System uptime, service details, and active WebSocket client count.

### Patient Directory (Clinician Views)
- `GET /api/patients` — List all patients with status summary counts.
- `GET /api/patients?status=Needs Attention` — Filter patients by clinical status:
  - `Improving`
  - `Stable`
  - `Needs Attention`
  - `Recently Inactive`
  - `High Performing`
- `GET /api/patients/:id` — Get detailed patient profile by ID.

### Telemetry & Ingestion
- `POST /api/telemetry/ingest` — Submit raw MPU6050 JSON payload from bridge script or Wi-Fi.
- `GET /api/telemetry/latest` — Get the current real-time flexion angle and evaluation state.
- `GET /api/telemetry/history` — Retrieve recent telemetry frame buffer.

### Sessions & Recovery Score
- `POST /api/sessions/start` — Start a live exercise session for a patient.
- `POST /api/sessions/end` — End active session and generate final Recovery Score breakdown.
- `GET /api/sessions/active` — Inspect currently active session progress.

### Hardware Serial Bridge Controls
- `GET /api/bridge/status` — Get SerialPort hardware connection & simulator status.
- `GET /api/bridge/ports` — Scan USB COM ports available on the host machine.
- `POST /api/bridge/mode` — Toggle between real COM port and simulated sensor telemetry.

---

## 🔌 Hardware & Firmware Setup (`firmware/`)

Firmware script location: `firmware/FitSense_ESP32_DualMPU6050.ino`

### Pin Map (ESP32)
| Component | Pin / Bus | Notes |
| :--- | :--- | :--- |
| **MPU6050 #1 (Thigh)** | Address `0x68` (AD0 $\rightarrow$ GND) | SDA: GPIO 21, SCL: GPIO 22 |
| **MPU6050 #2 (Shin)** | Address `0x69` (AD0 $\rightarrow$ 3.3V) | SDA: GPIO 21, SCL: GPIO 22 |
| **Haptic Vibration Motor** | GPIO 27 | Active HIGH pulse |
| **Buzzer Module** | GPIO 14 | Active HIGH beep |
| **Power** | 3.7V LiPo Battery / USB-C | Local portable power |

---

## 🧪 Verification & Build

To test TypeScript build compilation:
```bash
npm run build
```

To run production build locally:
```bash
npm start
```

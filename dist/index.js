"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const ws_1 = require("ws");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const serialBridge_1 = require("./services/serialBridge");
const evaluationEngine_1 = require("./services/evaluationEngine");
const telemetry_1 = require("./routes/telemetry");
const patients_1 = require("./routes/patients");
const sessions_1 = require("./routes/sessions");
const bridge_1 = require("./routes/bridge");
dotenv_1.default.config();
const PORT = process.env.PORT || 5000;
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// In-memory Telemetry Buffer (Last 200 frames)
const recentPacketsLog = [];
const MAX_LOG_SIZE = 200;
// Initialize Core Services
const serialBridge = new serialBridge_1.SerialBridgeService();
const evaluationEngine = new evaluationEngine_1.EvaluationEngine(90, 120);
// WebSocket Server initialization (/ws/telemetry)
const wss = new ws_1.WebSocketServer({ server, path: '/ws/telemetry' });
const connectedWsClients = new Set();
wss.on('connection', (ws) => {
    console.log('[WebSocket] Client connected to live telemetry stream');
    connectedWsClients.add(ws);
    // Send initial welcome & status
    ws.send(JSON.stringify({
        type: 'CONNECTION_ESTABLISHED',
        message: 'Connected to FitSense AI Real-Time Telemetry Stream',
        bridgeStatus: serialBridge.getStatus()
    }));
    ws.on('close', () => {
        connectedWsClients.delete(ws);
        console.log('[WebSocket] Client disconnected');
    });
    ws.on('error', (err) => {
        console.error('[WebSocket] Error:', err);
    });
});
// Wire SerialBridge output to EvaluationEngine and WebSocket Broadcast
serialBridge.onTelemetry((packet) => {
    // Store packet in rolling buffer
    recentPacketsLog.push(packet);
    if (recentPacketsLog.length > MAX_LOG_SIZE) {
        recentPacketsLog.shift();
    }
    // Run Rule-Based Evaluation State Machine
    const evaluation = evaluationEngine.evaluatePacket(packet);
    // Construct WebSocket Payload packet
    const wsPayload = JSON.stringify({
        type: 'TELEMETRY_UPDATE',
        packet,
        evaluation,
        bridgeStatus: serialBridge.getStatus()
    });
    // Broadcast payload to all connected clients
    connectedWsClients.forEach(client => {
        if (client.readyState === ws_1.WebSocket.OPEN) {
            client.send(wsPayload);
        }
    });
});
// Health check endpoint (for Render / uptime monitors)
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        service: 'FitSense AI / FlexSense Cloud Backend API',
        event: 'Hack Summit 7.0 @ SRM IST',
        team: 'Nithesh P, Koushik G, Sujay S (Team HackElite / Team Razers)',
        bridgeStatus: serialBridge.getStatus(),
        activeWsClients: connectedWsClients.size
    });
});
// Attach REST API Routers
app.use('/api/telemetry', (0, telemetry_1.createTelemetryRouter)(serialBridge, evaluationEngine, recentPacketsLog));
app.use('/api/patients', (0, patients_1.createPatientsRouter)());
app.use('/api/sessions', (0, sessions_1.createSessionsRouter)(evaluationEngine, recentPacketsLog));
app.use('/api/bridge', (0, bridge_1.createBridgeRouter)(serialBridge));
// Start server
server.listen(PORT, () => {
    console.log(`
===================================================================
 🚀 FitSense AI / FlexSense Universal Backend Server Ready!
 -------------------------------------------------------------------
  • REST API Server:   http://localhost:${PORT}
  • Health Check:      http://localhost:${PORT}/api/health
  • WebSocket Stream:  ws://localhost:${PORT}/ws/telemetry
  • Patient Directory: http://localhost:${PORT}/api/patients
  • Render Deploy:     Ready (render.yaml configured)
===================================================================
  `);
    // ONLY start hardware simulator if SIMULATOR_MODE environment variable is explicitly set to 'true'
    if (process.env.SIMULATOR_MODE === 'true') {
        console.log('[Simulator] SIMULATOR_MODE=true set in environment. Launching mock telemetry generator.');
        serialBridge.startSimulator();
    }
    else {
        console.log('[Simulator] Hardware simulator OFF by default. Awaiting real ESP32 serial bridge telemetry at /api/telemetry/ingest.');
    }
});

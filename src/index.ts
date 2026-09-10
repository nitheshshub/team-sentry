import express, { Request, Response } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';

import { SerialBridgeService } from './services/serialBridge';
import { EvaluationEngine } from './services/evaluationEngine';
import { TelemetryPacket } from './types';

import { createTelemetryRouter } from './routes/telemetry';
import { createPatientsRouter } from './routes/patients';
import { createSessionsRouter } from './routes/sessions';
import { createBridgeRouter } from './routes/bridge';

dotenv.config();

const PORT = process.env.PORT || 5000;
const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// In-memory Telemetry Buffer (Last 200 frames)
const recentPacketsLog: TelemetryPacket[] = [];
const MAX_LOG_SIZE = 200;

// Initialize Core Services
const serialBridge = new SerialBridgeService();
const evaluationEngine = new EvaluationEngine(90, 120);

// WebSocket Server initialization (/ws/telemetry)
const wss = new WebSocketServer({ server, path: '/ws/telemetry' });

const connectedWsClients = new Set<WebSocket>();

wss.on('connection', (ws: WebSocket) => {
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
serialBridge.onTelemetry((packet: TelemetryPacket) => {
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
    if (client.readyState === WebSocket.OPEN) {
      client.send(wsPayload);
    }
  });
});

// Health check endpoint (for Render / uptime monitors)
app.get('/api/health', (_req: Request, res: Response) => {
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
app.use('/api/telemetry', createTelemetryRouter(serialBridge, evaluationEngine, recentPacketsLog));
app.use('/api/patients', createPatientsRouter());
app.use('/api/sessions', createSessionsRouter(evaluationEngine, recentPacketsLog));
app.use('/api/bridge', createBridgeRouter(serialBridge));

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
  } else {
    console.log('[Simulator] Hardware simulator OFF by default. Awaiting real ESP32 serial bridge telemetry at /api/telemetry/ingest.');
  }
});


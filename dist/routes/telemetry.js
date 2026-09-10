"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTelemetryRouter = createTelemetryRouter;
const express_1 = require("express");
function createTelemetryRouter(serialBridge, evaluationEngine, recentPacketsLog) {
    const router = (0, express_1.Router)();
    // POST /api/telemetry/ingest - Ingest telemetry from local laptop bridge or ESP32
    router.post('/ingest', (req, res) => {
        const body = req.body || {};
        // Flexible extraction of flexion angle from ANY key name sent by Arduino code
        let angleVal = 0;
        if (typeof body.flexion === 'number')
            angleVal = body.flexion;
        else if (typeof body.flexionAngle === 'number')
            angleVal = body.flexionAngle;
        else if (typeof body.angle === 'number')
            angleVal = body.angle;
        else if (typeof body.jointAngle === 'number')
            angleVal = body.jointAngle;
        else if (typeof body.rawAngle === 'number')
            angleVal = body.rawAngle;
        else if (typeof body.value === 'number')
            angleVal = body.value;
        else if (typeof body.val === 'number')
            angleVal = body.val;
        else if (typeof body.deg === 'number')
            angleVal = body.deg;
        else if (typeof body.degrees === 'number')
            angleVal = body.degrees;
        else if (typeof body.pitch === 'number')
            angleVal = body.pitch;
        const packet = {
            timestamp: Date.now(),
            deviceId: body.deviceId || 'ESP32-HARDWARE',
            sensor1: body.sensor1 || { roll: 0, pitch: Math.round(angleVal * 0.6), yaw: 0 },
            sensor2: body.sensor2 || { roll: 0, pitch: Math.round(-angleVal * 0.4), yaw: 0 },
            flexionAngle: angleVal,
            batteryLevel: body.battery || 95,
            isSimulated: false
        };
        // Ingest into SerialBridge
        serialBridge.handleExternalPacket(packet);
        // Evaluate Repetition State Machine & Posture Form Rules
        const evalResult = evaluationEngine.evaluatePacket(packet);
        res.status(200).json({
            success: true,
            ingestedAt: new Date().toISOString(),
            receivedAngle: angleVal,
            evaluation: evalResult
        });
    });
    router.get('/latest', (_req, res) => {
        const latestPacket = recentPacketsLog.length > 0
            ? recentPacketsLog[recentPacketsLog.length - 1]
            : null;
        const currentEval = latestPacket
            ? evaluationEngine.evaluatePacket(latestPacket)
            : null;
        res.json({
            success: true,
            latestPacket,
            evaluation: currentEval
        });
    });
    router.get('/history', (req, res) => {
        const limit = parseInt(req.query.limit) || 50;
        const history = recentPacketsLog.slice(-limit);
        res.json({
            success: true,
            count: history.length,
            history
        });
    });
    return router;
}

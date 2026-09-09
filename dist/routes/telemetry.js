"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTelemetryRouter = createTelemetryRouter;
const express_1 = require("express");
function createTelemetryRouter(serialBridge, evaluationEngine, recentPacketsLog) {
    const router = (0, express_1.Router)();
    router.post('/ingest', (req, res) => {
        const { deviceId, sensor1, sensor2, flexion, flexionAngle, battery } = req.body;
        const angleVal = typeof flexion === 'number' ? flexion : (typeof flexionAngle === 'number' ? flexionAngle : 0);
        const packet = {
            timestamp: Date.now(),
            deviceId: deviceId || 'ESP32-EXTERNAL',
            sensor1: sensor1 || { roll: 0, pitch: 0, yaw: 0 },
            sensor2: sensor2 || { roll: 0, pitch: 0, yaw: 0 },
            flexionAngle: angleVal,
            batteryLevel: battery || 90,
            isSimulated: false
        };
        serialBridge.handleExternalPacket(packet);
        const evalResult = evaluationEngine.evaluatePacket(packet);
        res.status(200).json({
            success: true,
            ingestedAt: new Date().toISOString(),
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

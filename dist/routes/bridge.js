"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBridgeRouter = createBridgeRouter;
const express_1 = require("express");
function createBridgeRouter(serialBridge) {
    const router = (0, express_1.Router)();
    router.get('/status', (_req, res) => {
        res.json({
            success: true,
            bridgeStatus: serialBridge.getStatus()
        });
    });
    router.get('/ports', async (_req, res) => {
        const ports = await serialBridge.listAvailablePorts();
        res.json({
            success: true,
            count: ports.length,
            ports
        });
    });
    router.post('/connect', async (req, res) => {
        const { port, baudRate } = req.body;
        if (!port) {
            return res.status(400).json({
                success: false,
                error: 'Serial port path (e.g. COM3 or /dev/ttyUSB0) is required.'
            });
        }
        const baud = baudRate || 115200;
        const connected = await serialBridge.connectToPort(port, baud);
        res.json({
            success: connected,
            message: connected
                ? `Connecting to serial port ${port} @ ${baud} baud...`
                : `Failed to open ${port}. Falling back to simulator mode.`,
            status: serialBridge.getStatus()
        });
    });
    router.post('/mode', (req, res) => {
        const { simulate } = req.body;
        const enableSim = typeof simulate === 'boolean' ? simulate : true;
        serialBridge.setSimulationMode(enableSim);
        res.json({
            success: true,
            message: enableSim
                ? 'Simulator Mode activated (Synthetic Dual MPU6050 telemetry streaming)'
                : 'Simulator Mode deactivated',
            status: serialBridge.getStatus()
        });
    });
    return router;
}

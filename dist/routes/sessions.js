"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSessionsRouter = createSessionsRouter;
const express_1 = require("express");
const recoveryScore_1 = require("../services/recoveryScore");
const mockPatients_1 = require("../data/mockPatients");
let activeSession = null;
const sessionHistory = [];
function createSessionsRouter(evaluationEngine, recentPacketsLog) {
    const router = (0, express_1.Router)();
    router.post('/start', (req, res) => {
        const { patientId, targetRomMin, targetRomMax } = req.body;
        const patient = mockPatients_1.mockPatients.find(p => p.id === patientId) || mockPatients_1.mockPatients[0];
        const minRom = targetRomMin || patient.targetRomMin;
        const maxRom = targetRomMax || patient.targetRomMax;
        evaluationEngine.setTargetRom(minRom, maxRom);
        evaluationEngine.reset();
        const sessionId = `SES-${Date.now().toString().slice(-6)}`;
        activeSession = {
            sessionId,
            patientId: patient.id,
            startTime: new Date().toISOString(),
            telemetryLogs: []
        };
        res.json({
            success: true,
            message: `Active exercise session started for patient ${patient.name} (${patient.id})`,
            session: {
                sessionId,
                patientId: patient.id,
                patientName: patient.name,
                targetRom: { min: minRom, max: maxRom },
                startTime: activeSession.startTime
            }
        });
    });
    router.post('/end', (req, res) => {
        if (!activeSession) {
            return res.status(400).json({
                success: false,
                error: 'No active exercise session is currently running.'
            });
        }
        const currentSession = activeSession;
        const patient = mockPatients_1.mockPatients.find(p => p.id === currentSession.patientId) || mockPatients_1.mockPatients[0];
        const latestPacket = recentPacketsLog[recentPacketsLog.length - 1];
        const evalResult = latestPacket ? evaluationEngine.evaluatePacket(latestPacket) : null;
        const totalReps = evalResult ? evalResult.repCount : 0;
        const validReps = evalResult ? evalResult.validReps : 0;
        const maxFlexion = recentPacketsLog.reduce((max, p) => Math.max(max, p.flexionAngle), 0);
        const avgFlexion = recentPacketsLog.length > 0
            ? Math.round((recentPacketsLog.reduce((acc, p) => acc + p.flexionAngle, 0) / recentPacketsLog.length) * 10) / 10
            : 0;
        const scoreBreakdown = (0, recoveryScore_1.calculateRecoveryScore)(validReps, totalReps, maxFlexion, patient.targetRomMin, patient.assignedRepsPerSession);
        const completedSession = {
            sessionId: currentSession.sessionId,
            patientId: currentSession.patientId,
            startTime: currentSession.startTime,
            endTime: new Date().toISOString(),
            totalDurationSeconds: Math.round((Date.now() - new Date(currentSession.startTime).getTime()) / 1000),
            assignedReps: patient.assignedRepsPerSession,
            completedReps: totalReps,
            validReps,
            targetRomMin: patient.targetRomMin,
            targetRomMax: patient.targetRomMax,
            maxFlexionAchieved: maxFlexion,
            avgFlexionAchieved: avgFlexion,
            scoreBreakdown,
            telemetryLogs: currentSession.telemetryLogs.slice(-100)
        };
        sessionHistory.push(completedSession);
        activeSession = null;
        res.json({
            success: true,
            message: 'Session completed successfully',
            sessionSummary: completedSession
        });
    });
    router.get('/active', (_req, res) => {
        if (!activeSession) {
            return res.json({
                success: true,
                hasActiveSession: false,
                activeSession: null
            });
        }
        const patient = mockPatients_1.mockPatients.find(p => p.id === activeSession.patientId);
        const latestPacket = recentPacketsLog[recentPacketsLog.length - 1];
        const currentEval = latestPacket ? evaluationEngine.evaluatePacket(latestPacket) : null;
        res.json({
            success: true,
            hasActiveSession: true,
            activeSession: {
                ...activeSession,
                patientName: patient?.name,
                currentEvaluation: currentEval
            }
        });
    });
    router.get('/history', (_req, res) => {
        res.json({
            success: true,
            count: sessionHistory.length,
            history: sessionHistory
        });
    });
    return router;
}

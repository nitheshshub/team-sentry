import { Router, Request, Response } from 'express';
import { EvaluationEngine } from '../services/evaluationEngine';
import { calculateRecoveryScore } from '../services/recoveryScore';
import { ExerciseSession, TelemetryPacket } from '../types';
import { mockPatients } from '../data/mockPatients';

let activeSession: {
  sessionId: string;
  patientId: string;
  startTime: string;
  telemetryLogs: TelemetryPacket[];
} | null = null;

const sessionHistory: ExerciseSession[] = [];

export function createSessionsRouter(
  evaluationEngine: EvaluationEngine,
  recentPacketsLog: TelemetryPacket[]
): Router {
  const router = Router();

  router.post('/start', (req: Request, res: Response) => {
    const { patientId, targetRomMin, targetRomMax } = req.body;

    const patient = mockPatients.find(p => p.id === patientId) || mockPatients[0];
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

  router.post('/end', (req: Request, res: Response) => {
    if (!activeSession) {
      return res.status(400).json({
        success: false,
        error: 'No active exercise session is currently running.'
      });
    }

    const currentSession = activeSession;
    const patient = mockPatients.find(p => p.id === currentSession.patientId) || mockPatients[0];
    const latestPacket = recentPacketsLog[recentPacketsLog.length - 1];
    const evalResult = latestPacket ? evaluationEngine.evaluatePacket(latestPacket) : null;

    const totalReps = evalResult ? evalResult.repCount : 0;
    const validReps = evalResult ? evalResult.validReps : 0;
    const maxFlexion = recentPacketsLog.reduce((max, p) => Math.max(max, p.flexionAngle), 0);
    const avgFlexion = recentPacketsLog.length > 0
      ? Math.round((recentPacketsLog.reduce((acc, p) => acc + p.flexionAngle, 0) / recentPacketsLog.length) * 10) / 10
      : 0;

    const scoreBreakdown = calculateRecoveryScore(
      validReps,
      totalReps,
      maxFlexion,
      patient.targetRomMin,
      patient.assignedRepsPerSession
    );

    const completedSession: ExerciseSession = {
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

  router.get('/active', (_req: Request, res: Response) => {
    if (!activeSession) {
      return res.json({
        success: true,
        hasActiveSession: false,
        activeSession: null
      });
    }

    const patient = mockPatients.find(p => p.id === activeSession!.patientId);
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

  router.get('/history', (_req: Request, res: Response) => {
    res.json({
      success: true,
      count: sessionHistory.length,
      history: sessionHistory
    });
  });

  router.post('/reset', (_req: Request, res: Response) => {
    evaluationEngine.reset();
    recentPacketsLog.length = 0;

    const zeroPacket: TelemetryPacket = {
      timestamp: Date.now(),
      deviceId: 'STANDBY',
      sensor1: { roll: 0, pitch: 0, yaw: 0 },
      sensor2: { roll: 0, pitch: 0, yaw: 0 },
      flexionAngle: 0.0,
      batteryLevel: 100,
      isSimulated: false
    };

    const freshEval = evaluationEngine.evaluatePacket(zeroPacket);

    res.json({
      success: true,
      message: 'Session repetition state machine and scores reset to ZERO.',
      evaluation: freshEval,
      latestPacket: zeroPacket
    });
  });

  return router;
}

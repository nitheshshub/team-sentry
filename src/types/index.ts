export interface SensorOrientation {
  roll: number;
  pitch: number;
  yaw: number;
}

export interface AccelGyroData {
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
}

export interface TelemetryPacket {
  timestamp: number;
  deviceId: string;
  sensor1: SensorOrientation; // Thigh IMU
  sensor2: SensorOrientation; // Shin IMU
  flexionAngle: number;       // Calculated relative joint angle (degrees)
  rawAccel1?: AccelGyroData;
  rawAccel2?: AccelGyroData;
  batteryLevel?: number;      // % battery from 3.7V LiPo
  isSimulated?: boolean;
}

export type ExercisePhase = 'REST' | 'FLEXION' | 'PEAK_HOLD' | 'EXTENSION' | 'COMPLETED_REP';

export interface EvaluationResult {
  currentPhase: ExercisePhase;
  repCount: number;
  validReps: number;
  flexionAngle: number;
  targetRom: {
    min: number;
    max: number;
  };
  romAchieved: boolean;
  isValidForm: boolean;
  postureFlags: string[];
  consecutiveErrors: number;
  feedbackTrigger: {
    hapticPulse: boolean;
    buzzerBeep: boolean;
    audioVoicePromptCode: number | null; // e.g. 1 = "Hold peak", 2 = "Smooth motion", 3 = "Full extension required"
    description?: string;
  };
  timestamp: number;
}

export type PatientStatus = 
  | 'Improving' 
  | 'Stable' 
  | 'Needs Attention' 
  | 'Recently Inactive' 
  | 'High Performing';

export interface Patient {
  id: string;
  name: string;
  age: number;
  gender: string;
  injury: string;
  jointType: 'Knee' | 'Elbow' | 'Shoulder';
  status: PatientStatus;
  recoveryScore: number;      // Demo metric (0 - 100)
  targetRomMin: number;       // Target ROM min degrees
  targetRomMax: number;       // Target ROM max degrees
  assignedRepsPerSession: number;
  completedSessions: number;
  complianceRate: number;     // % compliance
  lastSessionDate: string;
  physicianName: string;
  notes: string;
}

export interface RecoveryScoreBreakdown {
  overallScore: number;       // 0 - 100
  accuracyWeight: number;     // 40%
  romWeight: number;          // 40%
  complianceWeight: number;   // 20%
  accuracyScore: number;
  romScore: number;
  complianceScore: number;
  label: string;              // e.g. "Demo Recovery Metric"
}

export interface ExerciseSession {
  sessionId: string;
  patientId: string;
  startTime: string;
  endTime?: string;
  totalDurationSeconds: number;
  assignedReps: number;
  completedReps: number;
  validReps: number;
  targetRomMin: number;
  targetRomMax: number;
  maxFlexionAchieved: number;
  avgFlexionAchieved: number;
  scoreBreakdown: RecoveryScoreBreakdown;
  telemetryLogs: TelemetryPacket[];
}

export interface SerialBridgeStatus {
  connected: boolean;
  port: string | null;
  baudRate: number;
  isSimulating: boolean;
  lastPacketReceived?: string;
  packetsIngested: number;
}

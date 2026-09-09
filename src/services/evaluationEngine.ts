import { EvaluationResult, ExercisePhase, TelemetryPacket } from '../types';

export class EvaluationEngine {
  private currentPhase: ExercisePhase = 'REST';
  private repCount: number = 0;
  private validReps: number = 0;
  private targetRomMin: number = 90;
  private targetRomMax: number = 120;
  private peakFlexionInCurrentRep: number = 0;
  private consecutiveErrors: number = 0;
  private lastFlexionAngle: number = 0;
  private lastTimestamp: number = Date.now();
  private peakHoldStartTime: number | null = null;
  private currentRepHasPostureError: boolean = false;

  constructor(targetRomMin: number = 90, targetRomMax: number = 120) {
    this.targetRomMin = targetRomMin;
    this.targetRomMax = targetRomMax;
  }

  public setTargetRom(min: number, max: number): void {
    this.targetRomMin = min;
    this.targetRomMax = max;
  }

  public reset(): void {
    this.currentPhase = 'REST';
    this.repCount = 0;
    this.validReps = 0;
    this.peakFlexionInCurrentRep = 0;
    this.consecutiveErrors = 0;
    this.lastFlexionAngle = 0;
    this.lastTimestamp = Date.now();
    this.peakHoldStartTime = null;
    this.currentRepHasPostureError = false;
  }

  public evaluatePacket(packet: TelemetryPacket): EvaluationResult {
    const angle = packet.flexionAngle;
    const now = packet.timestamp || Date.now();
    const dt = Math.max(0.01, (now - this.lastTimestamp) / 1000);
    const angularVelocity = Math.abs(angle - this.lastFlexionAngle) / dt;

    const postureFlags: string[] = [];
    let isValidForm = true;

    if (angularVelocity > 180) {
      isValidForm = false;
      postureFlags.push('Jerky Acceleration Detected');
    }

    if (angle > 135) {
      isValidForm = false;
      postureFlags.push('Hyperextension Warning (>135°)');
    }

    if (!isValidForm) {
      this.currentRepHasPostureError = true;
      this.consecutiveErrors++;
    } else if (this.consecutiveErrors > 0 && angle <= 15) {
      this.consecutiveErrors = 0;
    }

    switch (this.currentPhase) {
      case 'REST':
        if (angle > 20) {
          this.currentPhase = 'FLEXION';
          this.peakFlexionInCurrentRep = angle;
          this.currentRepHasPostureError = !isValidForm;
        }
        break;

      case 'FLEXION':
        if (angle > this.peakFlexionInCurrentRep) {
          this.peakFlexionInCurrentRep = angle;
        }

        if (angle >= this.targetRomMin) {
          this.currentPhase = 'PEAK_HOLD';
          this.peakHoldStartTime = now;
        } else if (angle < 15) {
          this.currentPhase = 'REST';
          postureFlags.push('Incomplete Range of Motion');
        }
        break;

      case 'PEAK_HOLD':
        if (angle > this.peakFlexionInCurrentRep) {
          this.peakFlexionInCurrentRep = angle;
        }

        if (angle < this.targetRomMin - 10) {
          this.currentPhase = 'EXTENSION';
          this.peakHoldStartTime = null;
        }
        break;

      case 'EXTENSION':
        if (angle <= 15) {
          this.currentPhase = 'REST';
          this.repCount++;
          
          if (!this.currentRepHasPostureError && this.peakFlexionInCurrentRep >= this.targetRomMin) {
            this.validReps++;
          }
        }
        break;
    }

    const romAchieved = this.peakFlexionInCurrentRep >= this.targetRomMin;

    const feedbackTrigger = {
      hapticPulse: !isValidForm || this.consecutiveErrors >= 2,
      buzzerBeep: this.consecutiveErrors >= 2,
      audioVoicePromptCode: this.getVoicePromptCode(postureFlags, romAchieved),
      description: this.getFeedbackDescription(postureFlags, this.consecutiveErrors)
    };

    this.lastFlexionAngle = angle;
    this.lastTimestamp = now;

    return {
      currentPhase: this.currentPhase,
      repCount: this.repCount,
      validReps: this.validReps,
      flexionAngle: angle,
      targetRom: {
        min: this.targetRomMin,
        max: this.targetRomMax
      },
      romAchieved,
      isValidForm,
      postureFlags,
      consecutiveErrors: this.consecutiveErrors,
      feedbackTrigger,
      timestamp: now
    };
  }

  private getVoicePromptCode(flags: string[], romAchieved: boolean): number | null {
    if (flags.includes('Jerky Acceleration Detected')) return 2;
    if (flags.includes('Hyperextension Warning (>135°)')) return 4;
    if (this.currentPhase === 'PEAK_HOLD' && romAchieved) return 1;
    if (this.consecutiveErrors >= 2) return 3;
    return null;
  }

  private getFeedbackDescription(flags: string[], consecutiveErrors: number): string {
    if (consecutiveErrors >= 2) {
      return 'CRITICAL: Consecutive posture errors! Haptic & Voice alert active.';
    }
    if (flags.length > 0) {
      return `WARNING: ${flags.join(', ')}`;
    }
    return 'NOMINAL: Good form & trajectory.';
  }
}

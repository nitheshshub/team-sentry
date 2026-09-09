"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvaluationEngine = void 0;
class EvaluationEngine {
    currentPhase = 'REST';
    repCount = 0;
    validReps = 0;
    targetRomMin = 90;
    targetRomMax = 120;
    peakFlexionInCurrentRep = 0;
    consecutiveErrors = 0;
    lastFlexionAngle = 0;
    lastTimestamp = Date.now();
    peakHoldStartTime = null;
    currentRepHasPostureError = false;
    constructor(targetRomMin = 90, targetRomMax = 120) {
        this.targetRomMin = targetRomMin;
        this.targetRomMax = targetRomMax;
    }
    setTargetRom(min, max) {
        this.targetRomMin = min;
        this.targetRomMax = max;
    }
    reset() {
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
    evaluatePacket(packet) {
        const angle = packet.flexionAngle;
        const now = packet.timestamp || Date.now();
        const dt = Math.max(0.01, (now - this.lastTimestamp) / 1000);
        const angularVelocity = Math.abs(angle - this.lastFlexionAngle) / dt;
        const postureFlags = [];
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
        }
        else if (this.consecutiveErrors > 0 && angle <= 15) {
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
                }
                else if (angle < 15) {
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
    getVoicePromptCode(flags, romAchieved) {
        if (flags.includes('Jerky Acceleration Detected'))
            return 2;
        if (flags.includes('Hyperextension Warning (>135°)'))
            return 4;
        if (this.currentPhase === 'PEAK_HOLD' && romAchieved)
            return 1;
        if (this.consecutiveErrors >= 2)
            return 3;
        return null;
    }
    getFeedbackDescription(flags, consecutiveErrors) {
        if (consecutiveErrors >= 2) {
            return 'CRITICAL: Consecutive posture errors! Haptic & Voice alert active.';
        }
        if (flags.length > 0) {
            return `WARNING: ${flags.join(', ')}`;
        }
        return 'NOMINAL: Good form & trajectory.';
    }
}
exports.EvaluationEngine = EvaluationEngine;

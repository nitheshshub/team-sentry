"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateRecoveryScore = calculateRecoveryScore;
function calculateRecoveryScore(validReps, totalReps, achievedRom, targetRomMin, assignedReps) {
    const accuracyScore = totalReps > 0
        ? Math.min(100, Math.round((validReps / totalReps) * 100))
        : 100;
    const romScore = targetRomMin > 0
        ? Math.min(100, Math.round((achievedRom / targetRomMin) * 100))
        : 100;
    const complianceScore = assignedReps > 0
        ? Math.min(100, Math.round((totalReps / assignedReps) * 100))
        : 100;
    const overallScore = Math.round((0.40 * accuracyScore) +
        (0.40 * romScore) +
        (0.20 * complianceScore));
    return {
        overallScore,
        accuracyWeight: 0.40,
        romWeight: 0.40,
        complianceWeight: 0.20,
        accuracyScore,
        romScore,
        complianceScore,
        label: 'Demo Recovery Metric'
    };
}

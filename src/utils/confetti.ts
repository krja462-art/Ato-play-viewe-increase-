import confetti from 'canvas-confetti';
import { playCoinCelebrationSound } from './audio';

/**
 * Lightweight celebration confetti animations using canvas-confetti (~6KB)
 * Optimized for high performance and smooth cleanup on mobile and desktop
 */

// 1. Celebration when a video watch session successfully completes
export function triggerWatchCompleteCelebration() {
  try {
    playCoinCelebrationSound();

    // Initial center burst
    confetti({
      particleCount: 75,
      spread: 70,
      origin: { y: 0.65 },
      colors: ['#2563eb', '#38bdf8', '#fbbf24', '#22c55e', '#a855f7'],
      disableForReducedMotion: true
    });

    // Side cannons after slight delay for dynamic excitement
    setTimeout(() => {
      confetti({
        particleCount: 45,
        angle: 60,
        spread: 55,
        origin: { x: 0.05, y: 0.75 },
        colors: ['#3b82f6', '#10b981', '#f59e0b', '#ec4899'],
        disableForReducedMotion: true
      });
      confetti({
        particleCount: 45,
        angle: 120,
        spread: 55,
        origin: { x: 0.95, y: 0.75 },
        colors: ['#8b5cf6', '#06b6d4', '#eab308', '#3b82f6'],
        disableForReducedMotion: true
      });
    }, 200);
  } catch (err) {
    console.debug('Confetti animation suppressed:', err);
  }
}

// 2. Grand celebration when a campaign reaches its full view goal
export function triggerCampaignGoalCelebration() {
  try {
    playCoinCelebrationSound();

    const duration = 2200; // 2.2 seconds
    const end = Date.now() + duration;

    // Center victory blast
    confetti({
      particleCount: 90,
      spread: 100,
      origin: { y: 0.5 },
      colors: ['#22c55e', '#eab308', '#3b82f6', '#ec4899', '#8b5cf6'],
      disableForReducedMotion: true
    });

    const frame = () => {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors: ['#10b981', '#f59e0b', '#3b82f6'],
        disableForReducedMotion: true
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors: ['#8b5cf6', '#ec4899', '#eab308'],
        disableForReducedMotion: true
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };

    requestAnimationFrame(frame);
  } catch (err) {
    console.debug('Goal celebration animation suppressed:', err);
  }
}

// 3. Quick burst for bonus coin claims & check-in
export function triggerQuickConfetti() {
  try {
    playCoinCelebrationSound();
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.7 },
      colors: ['#f59e0b', '#10b981', '#3b82f6', '#ec4899'],
      disableForReducedMotion: true
    });
  } catch (err) {
    console.debug('Quick confetti suppressed:', err);
  }
}

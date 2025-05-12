// Hand tracking and gesture logic for MediaPipe Hands
// This module sets up MediaPipe Hands, gesture detection, and hand landmark utilities

// Expects MediaPipe Hands to be loaded globally (e.g., via <script> or import)
// If using as a module, import Hands from '@mediapipe/hands';

let handsInstance = null;
let onResultsCallback = null;

export function setupHands({ onResults, options = {} }) {
  handsInstance = new Hands({ locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
  handsInstance.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7,
    ...options
  });
  onResultsCallback = onResults;
  handsInstance.onResults(onResultsCallback);
  return handsInstance;
}

export function getHandsInstance() {
  return handsInstance;
}

// Gesture utilities
export function isPinch(landmarks) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  return d(landmarks[4], landmarks[8]) < 0.06;
}

export function areIndexFingersClose(l, r) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  return d(l[8], r[8]) < 0.12;
} 
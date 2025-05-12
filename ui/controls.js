// UI Controls Module
// Handles speed slider and value display logic

export function initSpeedControls({ speedSlider, speedValue, onSpeedChange, defaultSpeed }) {
  if (!speedSlider || !speedValue) return;
  const REALTIME_SPEED = defaultSpeed ?? 0.0000116;
  function updateSpeedDisplay() {
    const val = parseFloat(speedSlider.value);
    if (Math.abs(val - REALTIME_SPEED) < 1e-7) {
      speedValue.textContent = '1x realtime';
    } else {
      speedValue.textContent = (val / REALTIME_SPEED).toFixed(2) + 'x';
    }
  }
  speedSlider.addEventListener('input', () => {
    if (onSpeedChange) onSpeedChange(parseFloat(speedSlider.value));
    updateSpeedDisplay();
  });
  updateSpeedDisplay(); // Set initial display
  if (onSpeedChange) onSpeedChange(parseFloat(speedSlider.value)); // Set initial speed
} 
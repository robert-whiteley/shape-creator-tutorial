// UI Controls Module
// Handles speed slider and value display logic

export function initSpeedControls({ speedSlider, speedValue, onSpeedChange }) {
  if (!speedSlider || !speedValue) return;
  function updateSpeedDisplay() {
    const val = parseFloat(speedSlider.value);
    if (val === 1) {
      speedValue.textContent = '1x realtime';
    } else if (val === -1) {
      speedValue.textContent = '-1x';
    } else if (val < 0) {
      speedValue.textContent = val.toFixed(2) + 'x';
    } else {
      speedValue.textContent = val.toFixed(2) + 'x';
    }
  }
  speedSlider.addEventListener('input', () => {
    if (onSpeedChange) onSpeedChange(parseFloat(speedSlider.value));
    updateSpeedDisplay();
  });
  updateSpeedDisplay(); // Set initial display
  if (onSpeedChange) onSpeedChange(parseFloat(speedSlider.value)); // Set initial speed
} 
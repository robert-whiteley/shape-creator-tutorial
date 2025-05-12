// UI Controls Module
// Handles speed slider and value display logic

export function initSpeedControls({ speedSlider, speedValue, onSpeedChange }) {
  if (!speedSlider || !speedValue) return;
  function getSpeedMultiplier(val) {
    if (val == 0) return 1;
    return Math.sign(val) * Math.pow(10, Math.abs(val));
  }
  function updateSpeedDisplay() {
    const val = parseInt(speedSlider.value);
    const multiplier = getSpeedMultiplier(val);
    if (multiplier === 1) {
      speedValue.textContent = '1x realtime';
    } else {
      speedValue.textContent = multiplier.toLocaleString('en-US', {maximumFractionDigits: 0}) + 'x';
    }
  }
  speedSlider.addEventListener('input', () => {
    const val = parseInt(speedSlider.value);
    const multiplier = getSpeedMultiplier(val);
    if (onSpeedChange) onSpeedChange(multiplier);
    updateSpeedDisplay();
  });
  // Set initial display and speed
  const initialVal = parseInt(speedSlider.value);
  if (onSpeedChange) onSpeedChange(getSpeedMultiplier(initialVal));
  updateSpeedDisplay();
} 
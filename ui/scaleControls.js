// ui/scaleControls.js
// Manages the scale slider and its display.

export function initScaleControls({
  scaleSliderElement,
  scaleValueElement,
  initialScale = 1,
  onScaleChange // Callback function: (newScale) => void
}) {
  if (!scaleSliderElement || !scaleValueElement) {
    console.error("Scale slider or value element not provided to initScaleControls.");
    return;
  }

  function updateDisplay(val) {
    scaleValueElement.textContent = val + 'x';
  }

  scaleSliderElement.addEventListener('input', () => {
    const val = parseInt(scaleSliderElement.value);
    updateDisplay(val);
    if (onScaleChange) {
      onScaleChange(val);
    }
  });

  // Set initial scale display and trigger initial callback
  scaleSliderElement.value = initialScale;
  updateDisplay(initialScale);
  if (onScaleChange) {
    onScaleChange(initialScale);
  }
} 
// ui/simulationDate.js
// Manages the simulation date display.

let simDateDivElement = null;

export function initSimDateDisplay(element) {
  if (!element) {
    console.error("Simulation date display element not provided to initSimDateDisplay.");
    return false;
  }
  simDateDivElement = element;
  return true;
}

export function updateSimDateDisplay(simulationTime) {
  if (!simDateDivElement) return;

  const date = new Date(simulationTime);
  // Format as YYYY-MM-DD HH:mm:ss in local time
  const pad = n => n.toString().padStart(2, '0');
  const str = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  simDateDivElement.textContent = str;
} 
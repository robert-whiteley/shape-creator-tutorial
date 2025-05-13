import { initThree, getRenderer, getScene, getCamera, getStarmapMesh, getSunMesh } from './three/scene.js';
import {
  planetData,
  planetPhysicalData,
  planetSpeeds,
  moonOrbitData,
  planetOrbitData,
  createOrbitLine,
  createPlanet,
  daysSinceJ2000
} from './three/solarSystem.js';
import { setupHands, isPinch, areIndexFingersClose } from './gestures/hands.js';
import { initCamera } from './utils/camera.js';
import { initSpeedControls } from './ui/controls.js';
import { get3DCoords } from './utils/helpers.js';

let video = document.getElementById('webcam');
let canvas = document.getElementById('canvas');
let ctx = canvas.getContext('2d');
let shapes = [];
let currentShape = null;
let isPinching = false;
let shapeScale = 1;
let originalDistance = null;
let selectedShape = null;
let shapeCreatedThisPinch = false;
let lastShapeCreationTime = 0;
const shapeCreationCooldown = 1000;
let solarSystemGroup = new THREE.Group();
let lastTwoHandAngle = null;
let lastSolarSystemRotationY = 0;
let lastTwoHandDistance = null;
let lastSolarSystemScale = 1;
let lastTwoHandMidY = null;
let lastSolarSystemRotationX = 0;
let lastTwoHandMidX = null;
let lastSolarSystemRotationZ = 0;
let speedMultiplier = 1;
let lastPanPosition = null;
let livePreviousPinchDistance = null;
let lastCameraOffsetDirection = null;
let initialCameraDistanceToGroup = null;
let lastAnimationTime = Date.now();
let speedSlider = document.getElementById('speed-slider');
let speedValue = document.getElementById('speed-value');
let scaleSlider = document.getElementById('scale-slider');
let scaleValue = document.getElementById('scale-value');
let planetBaseSizes = {};
let sunBaseSize = null;

// --- Simulation time tracking ---
let simulationTime = Date.now(); // ms since epoch, starts at real time
const simDateDiv = document.getElementById('sim-date');
function updateSimDateDisplay() {
  const date = new Date(simulationTime);
  // Format as YYYY-MM-DD HH:mm:ss in local time
  const pad = n => n.toString().padStart(2, '0');
  const str = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  simDateDiv.textContent = str;
}
updateSimDateDisplay();

function handleHandResults(results) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const landmarks of results.multiHandLandmarks) {
    const drawCircle = (landmark) => {
      ctx.beginPath();
      ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, 10, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(0, 255, 255, 0.7)';
      ctx.fill();
    };
    drawCircle(landmarks[4]); // Thumb tip
    drawCircle(landmarks[8]); // Index tip
  }

  // Two-hand pinch for rotation (Y, X, Z) and scaling/zooming
  if (results.multiHandLandmarks.length === 2) {
    const [l, r] = results.multiHandLandmarks;
    const leftPinch = isPinch(l);
    const rightPinch = isPinch(r);
    if (leftPinch && rightPinch) {
      const camera = getCamera(); // Get camera instance
      const dx = r[8].x - l[8].x;
      const dy = r[8].y - l[8].y;
      const angle = Math.atan2(dy, dx);
      const distance = Math.hypot(dx, dy); // Current pinch distance
      const midY = (l[8].y + r[8].y) / 2;
      const midX = (l[8].x + r[8].x) / 2;

      if (lastTwoHandAngle === null || lastTwoHandDistance === null /* implies others are null too */) {
        // Start of a new two-hand gesture
        lastTwoHandAngle = angle;
        lastSolarSystemRotationY = solarSystemGroup.rotation.y;
        lastTwoHandDistance = distance; // Store initial pinch distance for gesture detection
        livePreviousPinchDistance = distance; // Initialize for dolly zoom delta

        // initialCameraDistanceToGroup and lastCameraOffsetDirection no longer primarily used for zoom logic here
        // but can be kept if other features might use them, or cleaned up if definitively not.
        // For now, let's leave them but comment out their direct zoom usage setup.
        // initialCameraDistanceToGroup = camera.position.distanceTo(solarSystemGroup.position);
        // if (initialCameraDistanceToGroup < 0.1) {
        //     initialCameraDistanceToGroup = 0.1;
        //     lastCameraOffsetDirection = camera.getWorldDirection(new THREE.Vector3()).negate();
        // } else {
        //     lastCameraOffsetDirection = new THREE.Vector3().subVectors(camera.position, solarSystemGroup.position).normalize();
        // }

        lastTwoHandMidY = midY;
        lastSolarSystemRotationX = solarSystemGroup.rotation.x;
        lastTwoHandMidX = midX;
        lastSolarSystemRotationZ = solarSystemGroup.rotation.z;
      } else {
        // Continuous gesture: Rotation
        const deltaAngle = angle - lastTwoHandAngle;
        solarSystemGroup.rotation.y = lastSolarSystemRotationY + deltaAngle; // Inverted
        const deltaMidY = midY - lastTwoHandMidY;
        solarSystemGroup.rotation.x = lastSolarSystemRotationX - deltaMidY * 4.0; // Inverted
        const deltaMidX = midX - lastTwoHandMidX;
        solarSystemGroup.rotation.z = lastSolarSystemRotationZ - deltaMidX * 4.0; // Inverted

        // Continuous gesture: Camera Dolly (New Zoom Logic)
        const currentPinchDistance = distance;
        if (livePreviousPinchDistance !== null) {
          const pinchDiff = currentPinchDistance - livePreviousPinchDistance;
          
          const DOLLY_SENSITIVITY = 25; // Base sensitivity
          
          // Calculate current distance from camera to the group for scaling dolly sensitivity
          const currentCameraDistanceToGroup = camera.position.distanceTo(solarSystemGroup.position);
          // Scale factor: sensitivity is base at 20 units distance. Min factor of 0.1.
          const adaptiveDollySensitivityFactor = Math.max(0.1, currentCameraDistanceToGroup / 20.0);
          const adaptiveDollySensitivity = DOLLY_SENSITIVITY * adaptiveDollySensitivityFactor;
          
          const dollyAmount = pinchDiff * adaptiveDollySensitivity;

          const viewDirection = camera.getWorldDirection(new THREE.Vector3());
          camera.position.addScaledVector(viewDirection, dollyAmount);
          // NO camera.lookAt(solarSystemGroup.position) here to prevent snapping
        }
        livePreviousPinchDistance = currentPinchDistance; // Update for next frame's delta

        // Old zoom logic (based on solarSystemGroup.position) removed:
        // if (lastTwoHandDistance > 0.001 && distance > 0.001 && lastCameraOffsetDirection) { 
        //   const zoomFactor = lastTwoHandDistance / distance; 
        //   let newCameraDistance = initialCameraDistanceToGroup * zoomFactor;
        //   const MIN_CAM_DISTANCE = Math.max(camera.near + 0.1, 0.5);
        //   const MAX_CAM_DISTANCE = camera.far * 0.9;
        //   newCameraDistance = Math.max(MIN_CAM_DISTANCE, Math.min(MAX_CAM_DISTANCE, newCameraDistance));
        //   const newCameraPosition = solarSystemGroup.position.clone().addScaledVector(lastCameraOffsetDirection, newCameraDistance);
        //   camera.position.copy(newCameraPosition);
        //   camera.lookAt(solarSystemGroup.position);
        // }
      }
      return; // Processed two-hand gesture
    }
  }

  // Reset two-hand gesture state if not actively pinching with two hands
  lastTwoHandAngle = null;
  lastTwoHandDistance = null;
  lastTwoHandMidY = null;
  lastTwoHandMidX = null;
  livePreviousPinchDistance = null; // Reset for dolly zoom
  // Also reset camera zoom specific states (if they were used by old zoom)
  // lastCameraOffsetDirection = null; // Kept for now, but not used by new zoom
  // initialCameraDistanceToGroup = null; // Kept for now, but not used by new zoom

  // One-hand pinch for panning
  if (results.multiHandLandmarks.length > 0) {
    let pinchDetected = false;
    for (const landmarks of results.multiHandLandmarks) {
      if (isPinch(landmarks)) {
        pinchDetected = true;
        const indexTip = landmarks[8]; // Normalized screen coordinates (0-1)
        const PAN_SENSITIVITY = 10; // Adjust as needed

        if (lastPanPosition === null) {
          // First frame of the pinch, just record the position
          lastPanPosition = { x: indexTip.x, y: indexTip.y };
        } else {
          // Calculate delta from the last position
          const deltaX = indexTip.x - lastPanPosition.x;
          const deltaY = indexTip.y - lastPanPosition.y;

          // Apply delta to the solar system group's position relative to the camera's orientation
          const camera = getCamera();
          const camRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0); // Camera's local X (right) axis in world space
          const camUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);    // Camera's local Y (up) axis in world space

          // Calculate current distance from camera to the group for scaling pan sensitivity
          const currentCameraDistanceToGroup = camera.position.distanceTo(solarSystemGroup.position);
          // Scale factor: sensitivity is normal at 10 units distance. Min factor of 0.1.
          const panScaleFactor = Math.max(0.1, currentCameraDistanceToGroup / 10.0);

          // Pan horizontally on screen: move group along camera's right vector, scaled by distance
          solarSystemGroup.position.addScaledVector(camRight, deltaX * PAN_SENSITIVITY * panScaleFactor);
          
          // Pan vertically on screen: move group along camera's up vector, scaled by distance
          solarSystemGroup.position.addScaledVector(camUp, -deltaY * PAN_SENSITIVITY * panScaleFactor);

          // Update last pan position for the next frame
          lastPanPosition = { x: indexTip.x, y: indexTip.y };
        }
        break; // Process only one hand for panning
      }
    }
    if (!pinchDetected) {
      lastPanPosition = null; // Reset if no pinch is detected this frame
    }
  } else {
    lastPanPosition = null; // Reset if no hands are detected
  }
}

let hands = setupHands({ onResults: handleHandResults });

initSpeedControls({
  speedSlider,
  speedValue,
  onSpeedChange: (val) => { speedMultiplier = val; }
});

// Store base sizes for scaling
planetData.forEach(planet => {
  planetBaseSizes[planet.name] = planet.size;
  if (planet.name === 'sun') sunBaseSize = planet.size;
});

function updateScaleDisplay(val) {
  scaleValue.textContent = val + 'x';
}

function setPlanetScales(scale) {
  // Scale all planet meshes
  shapes.forEach(shape => {
    // Find planet name
    let planetName = null;
    for (const planet of planetData) {
      if (shape.children[0] && shape.children[0].material && shape.children[0].material.map && shape.children[0].material.map.image && shape.children[0].material.map.image.src && shape.children[0].material.map.image.src.includes(planet.texture)) {
        planetName = planet.name;
        break;
      }
    }
    if (!planetName) return;
    // Set scale on the mesh (not the group)
    if (shape.children[0]) {
      const base = planetBaseSizes[planetName] || 1;
      shape.children[0].scale.set(scale, scale, scale);
    }
    // If this is earth, also scale the moon
    if (planetName === 'earth' && shape.children.length > 1) {
      // Find the moon mesh
      const moonPivot = shape.children.find(child => child.type === 'Group');
      if (moonPivot && moonPivot.children[0]) {
        moonPivot.children[0].scale.set(scale, scale, scale);
      }
    }
  });
  // Scale the sun mesh
  const sunMesh = getSunMesh();
  if (sunMesh && sunBaseSize) {
    sunMesh.scale.set(scale, scale, scale);
  }
}

// Scale slider logic
scaleSlider.addEventListener('input', () => {
  const val = parseInt(scaleSlider.value);
  updateScaleDisplay(val);
  setPlanetScales(val);
});
// Set initial scale
updateScaleDisplay(1);
setPlanetScales(1);

const animate = () => {
  requestAnimationFrame(animate);
  const now = Date.now();
  const deltaMs = now - lastAnimationTime;
  lastAnimationTime = now;
  simulationTime += deltaMs * speedMultiplier; // 1x = real time, -1x = reverse real time
  updateSimDateDisplay();
  shapes.forEach(shape => {
    // Find planet name
    let planetName = null;
    for (const planet of planetData) {
      if (shape.children[0] && shape.children[0].material && shape.children[0].material.map && shape.children[0].material.map.image && shape.children[0].material.map.image.src && shape.children[0].material.map.image.src.includes(planet.texture)) {
        planetName = planet.name;
        break;
      }
    }
    if (!planetName) planetName = 'sun'; // fallback
    // Rotation (planet spin)
    if (shape !== selectedShape) {
      shape.rotation.y += (planetSpeeds[planetName]?.rotation || 0) * (deltaMs * speedMultiplier / (24 * 60 * 60 * 1000));
    }
    // Animate moon orbit if this is an earth with a moon
    if (moonOrbitData.has(shape)) {
      const { pivot } = moonOrbitData.get(shape);
      // Moon's orbital period: 27.32 days
      pivot.rotation.y += (2 * Math.PI / 27.32) * (deltaMs * speedMultiplier / (24 * 60 * 60 * 1000));
    }
    // Animate planet orbit if it has a pivot (not the sun)
    if (planetOrbitData.has(shape)) {
      const pivot = planetOrbitData.get(shape);
      pivot.rotation.y += (planetSpeeds[planetName]?.orbit || 0) * (deltaMs * speedMultiplier / (24 * 60 * 60 * 1000));
    }
  });
  // Animate sun rotation
  const sunMesh = getSunMesh();
  if (sunMesh) {
    sunMesh.rotation.y += (planetSpeeds['sun']?.rotation || 0) * (deltaMs * speedMultiplier / (24 * 60 * 60 * 1000));
  }
  getRenderer().render(getScene(), getCamera());
};

initThree({
  solarSystemGroup,
  planetData,
  planetPhysicalData,
  planetSpeeds,
  createPlanet,
  createOrbitLine,
  daysSinceJ2000,
  moonOrbitData,
  planetOrbitData,
  shapes,
  animateCallback: animate // pass the animation loop
});
initCamera({
  video,
  canvas,
  hands,
  // onFrame is not needed because hands is provided and will be called automatically
});
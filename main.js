import { initThree, getRenderer, getScene, getCamera, getStarmapMesh, getSunMesh, MODEL_SCALE_FACTOR } from './three/scene.js';
import {
  planetData,
  planetPhysicalData,
  planetSpeeds,
  moonOrbitData,
  planetOrbitData,
  createOrbitLine,
  createPlanet,
  daysSinceJ2000,
  planetBaseSizes,
  sunBaseSize
} from './three/solarSystem.js';
import { setupHands, isPinch, areIndexFingersClose } from './gestures/hands.js';
import { initCamera } from './utils/camera.js';
import { initSpeedControls } from './ui/controls.js';
import { get3DCoords } from './utils/helpers.js';
import { initBodyList } from './ui/bodyList.js';
import { initSimDateDisplay, updateSimDateDisplay as updateSimDateDisplayModule } from './ui/simulationDate.js';
import { initScaleControls } from './ui/scaleControls.js';
import { initGestureController } from './gestures/gestureController.js';
import { updateCelestialAnimations } from './three/simulationAnimator.js';
import { setPlanetScales as setPlanetScalesModule } from './three/visualUtils.js';
import { initCameraController } from './camera/cameraController.js';

let video = document.getElementById('webcam');
let canvas = document.getElementById('canvas');
let ctx = canvas.getContext('2d');
let shapes = [];
let solarSystemGroup = new THREE.Group();
let yawObject = new THREE.Group();
let pitchObject = new THREE.Group();
yawObject.add(pitchObject);
let speedMultiplier = 1;
let lastAnimationTime = Date.now();
let speedSlider = document.getElementById('speed-slider');
let speedValue = document.getElementById('speed-value');
let scaleSlider = document.getElementById('scale-slider');
let scaleValue = document.getElementById('scale-value');
let velocityDisplay = document.getElementById('velocity-display');

// --- Fly-to and Tracking State ---
let trackedBody = null;
let flyToAnimation = {
  active: false,
  progress: 0,
  startTime: 0,
  duration: 1500, // ms for fly-to animation
  startPos: new THREE.Vector3(),
  endPos: new THREE.Vector3(),
  startPitch: 0, 
  targetToLookAt: new THREE.Vector3() 
};

const getTrackedBody = () => trackedBody;
const setTrackedBody = (body) => {
  trackedBody = body;
  if (body === null) {
    flyToAnimation.active = false; // Ensure animation stops if tracking is externally broken
    console.log("Tracking stopped.");
  } else {
    console.log("Now tracking:", body.userData.name || 'Unknown Body');
  }
};
// --- End Fly-to and Tracking State ---

// Initialize Camera Controller (ensure this is the only initialization)
const cameraController = initCameraController({
  getCamera,
  scaleSliderElement: scaleSlider
});

// --- Simulation time tracking ---
let simulationTime = Date.now(); // ms since epoch, starts at real time

// Initialize Gesture Controller
const processHandResults = initGestureController({
  getCamera,
  yawObject,
  pitchObject,
  isPinch,
  ctx,
  getTrackedBody: () => {
    return cameraController.isAnimating() || cameraController.getTrackedBodyInfo() !== null;
  },
  setTrackedBody: (body) => {
    if (body === null) {
      cameraController.cancelAnimationsAndFollow();
    }
  }
});

let hands = setupHands({ onResults: processHandResults });

// --- Velocity Calculation State ---
let lastCameraPosition = new THREE.Vector3(); // Still used for the actual velocity value
let lastPositionTimestampPerf; // Undefined initially, will use performance.now()
let lastYawObjectPosition = new THREE.Vector3(); // For debugging gesture-driven movement
let smoothedVelocity = 0; // For displaying a smoother velocity
const SMOOTHING_FACTOR = 0.1; // Adjust for more or less smoothing (0.0 to 1.0)
// --- End Velocity Calculation State ---

initSpeedControls({
  speedSlider,
  speedValue,
  onSpeedChange: (val) => { speedMultiplier = val; }
});

const animate = () => {
  if (lastPositionTimestampPerf === undefined) {
    const cam = getCamera();
    if (cam) {
        cam.getWorldPosition(lastCameraPosition);
        lastPositionTimestampPerf = performance.now();
        if (yawObject) { // Ensure yawObject exists
            lastYawObjectPosition.copy(yawObject.position);
        }
    } else {
        console.error("Velocity Calculation: Camera not available on first animate frame.");
        lastPositionTimestampPerf = performance.now();
        if (yawObject) { // Ensure yawObject exists
          lastYawObjectPosition.copy(yawObject.position); // Initialize even if camera fails for some reason
        }
    }
  }

  requestAnimationFrame(animate);
  const now = Date.now();
  const nowPerf = performance.now();

  const deltaMs = now - lastAnimationTime;
  lastAnimationTime = now;
  simulationTime += deltaMs * speedMultiplier;
  updateSimDateDisplayModule(simulationTime);

  const simDaysElapsedInFrame = (deltaMs * speedMultiplier / (24 * 60 * 60 * 1000));

  // --- Velocity Calculation ---
  const currentCameraPosition = new THREE.Vector3();
  const cam = getCamera();
  if (cam) {
    cam.getWorldPosition(currentCameraPosition);
  } else {
    console.error("Velocity calculation: Camera not found in animate loop.");
    currentCameraPosition.copy(lastCameraPosition);
  }

  // Actual velocity calculation uses camera's world position change
  const positionDelta = currentCameraPosition.distanceTo(lastCameraPosition);
  const timeDeltaSeconds = (nowPerf - lastPositionTimestampPerf) / 1000.0;

  let currentVelocity = 0;
  if (timeDeltaSeconds > 0.0001) {
    currentVelocity = positionDelta / timeDeltaSeconds;
  }

  // Apply smoothing
  smoothedVelocity = SMOOTHING_FACTOR * currentVelocity + (1 - SMOOTHING_FACTOR) * smoothedVelocity;

  // --- Logging for Debugging Gesture-driven yawObject movement ---
  /* // Removing for now, as behavior is understood
  if (yawObject) {
    const yawPositionDelta = yawObject.position.distanceTo(lastYawObjectPosition);
    console.log(
      `VC_YAW: lastYawX: ${lastYawObjectPosition.x.toFixed(2)}, ` +
      `currYawX: ${yawObject.position.x.toFixed(2)}, ` +
      `yawDelta: ${yawPositionDelta.toFixed(4)}, ` + // How much yawObject itself moved
      `camDelta: ${positionDelta.toFixed(4)}, ` + // How much camera's world pos changed
      `dt: ${timeDeltaSeconds.toFixed(4)}, ` +
      `vel: ${currentVelocity.toFixed(4)}, ` +
      `smoothVel: ${smoothedVelocity.toFixed(4)}` // Log smoothed too
    );
    lastYawObjectPosition.copy(yawObject.position); // Update for next frame's yaw comparison
  }
  */
  // --- End Logging --

  if (velocityDisplay) {
    // Display the smoothed velocity
    velocityDisplay.textContent = `Velocity: ${smoothedVelocity.toFixed(2)} units/s`;
  }

  // Update for next frame (for actual velocity calculation)
  lastCameraPosition.copy(currentCameraPosition);
  lastPositionTimestampPerf = nowPerf;
  // --- End Velocity Calculation ---

  updateCelestialAnimations({
    simDaysElapsedInFrame,
    shapes,
    getSunMesh,
    planetSpeeds,
    moonOrbitData,
    planetOrbitData
  });

  if (cameraController) {
    cameraController.updateCamera();
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
  animateCallback: animate,
  yawObject,
  pitchObject
});

// handleBodyClick function - accepts 'cc' (cameraController instance) as a parameter
const handleBodyClick = (targetMesh, bodyName, isMoon, cc) => { 
  if (!targetMesh) {
    console.error("handleBodyClick: targetMesh is null for", bodyName);
    return;
  }
  console.log("[Debug] In handleBodyClick, passed cc is:", cc);
  if (!cc) { 
    console.error("handleBodyClick: cameraController (cc parameter) was not provided or is falsy.");
    return;
  }

  console.log(`%c--- handleBodyClick for: ${bodyName} ---`, 'color: green; font-weight: bold;');

  const targetWorldPosition = new THREE.Vector3();
  targetMesh.getWorldPosition(targetWorldPosition);

  let baseSizeForOffset = 0.5; 
  if (bodyName === 'sun') {
    baseSizeForOffset = sunBaseSize || 1.2; 
  } else if (isMoon && targetMesh.geometry && targetMesh.geometry.parameters) {
    baseSizeForOffset = targetMesh.geometry.parameters.radius || 0.5;
  } else if (planetBaseSizes && planetBaseSizes[bodyName]) {
    baseSizeForOffset = planetBaseSizes[bodyName];
  } else {
    console.warn(`Could not determine specific base size for ${bodyName}, using default: ${baseSizeForOffset}`);
  }
  // Ensure baseSizeForOffset is a positive number. It ALREADY represents visual size.
  baseSizeForOffset = Math.max(0.1, baseSizeForOffset); 

  console.log(`  Target: ${bodyName}, World Pos: ${targetWorldPosition.x.toFixed(2)}, ${targetWorldPosition.y.toFixed(2)}, ${targetWorldPosition.z.toFixed(2)}`);
  console.log(`  BaseSize for offset calc: ${baseSizeForOffset.toFixed(2)} (scaled)`);

  cc.startFlyToAnimation({
    lookAtTargetPoint: targetWorldPosition,
    meshToFollowAfterAnimation: targetMesh,
    baseSizeForOffset: baseSizeForOffset
  });
};

// Initialize the body list UI
initBodyList({
  bodiesListUlElement: document.getElementById('bodies-list'),
  planetData,
  getCamera, // Still needed by bodyList for now, or can be removed if not used internally by it
  getSunMesh,
  shapes,
  planetBaseSizes,
  sunBaseSize,
  moonOrbitData,
  solarSystemGroup,
  cameraController: cameraController, // Pass the single cameraController instance
  onBodyClick: handleBodyClick 
});

// Initialize the simulation date display
initSimDateDisplay(document.getElementById('sim-date'));

// Initialize scale controls
initScaleControls({
  scaleSliderElement: scaleSlider,
  scaleValueElement: scaleValue,
  initialScale: 1,
  onScaleChange: (newScale) => {
    setPlanetScalesModule({ 
      scale: newScale, 
      shapes,
      moonOrbitData,
      getSunMesh 
    });
  }
});

animate();

initCamera({
  video,
  canvas,
  hands,
});

window.getScene = getScene;
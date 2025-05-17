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
  solarSystemGroup,
  cameraControls: cameraController, // Pass the cameraController here
  isPinch,
  ctx
});

let hands = setupHands({ onResults: processHandResults });

initSpeedControls({
  speedSlider,
  speedValue,
  onSpeedChange: (val) => { speedMultiplier = val; }
});

const animate = () => {
  requestAnimationFrame(animate);
  const now = Date.now();
  const deltaMs = now - lastAnimationTime;
  lastAnimationTime = now;
  simulationTime += deltaMs * speedMultiplier;
  updateSimDateDisplayModule(simulationTime);

  const simDaysElapsedInFrame = (deltaMs * speedMultiplier / (24 * 60 * 60 * 1000));

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
  animateCallback: animate
  // Note: yawObject and pitchObject are not directly passed if cameraController manages the main camera
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

  const baseViewDir = new THREE.Vector3(0, 0.2, -1); 
  baseViewDir.normalize();

  const solarSystemWorldQuaternion = new THREE.Quaternion();
  solarSystemGroup.getWorldQuaternion(solarSystemWorldQuaternion);
  
  const worldOrientedNormalizedViewDir = baseViewDir.clone().applyQuaternion(solarSystemWorldQuaternion);

  console.log(`  Target: ${bodyName}, World Pos: ${targetWorldPosition.x.toFixed(2)}, ${targetWorldPosition.y.toFixed(2)}, ${targetWorldPosition.z.toFixed(2)}`);
  console.log(`  BaseSize for offset calc: ${baseSizeForOffset.toFixed(2)} (scaled)`);
  console.log(`  Calculated worldOrientedNormalizedViewDir: ${worldOrientedNormalizedViewDir.x.toFixed(2)}, ${worldOrientedNormalizedViewDir.y.toFixed(2)}, ${worldOrientedNormalizedViewDir.z.toFixed(2)}`);

  cc.startFlyToAnimation({
    lookAtTargetPoint: targetWorldPosition,
    meshToFollowAfterAnimation: targetMesh,
    baseSizeForOffset: baseSizeForOffset,
    worldOrientedNormalizedViewDir: worldOrientedNormalizedViewDir
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
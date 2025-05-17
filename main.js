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

// Initialize Gesture Controller
const processHandResults = initGestureController({
  getCamera,
  yawObject,
  pitchObject,
  solarSystemGroup,
  isPinch,
  ctx,
  getTrackedBody, // Pass getter
  setTrackedBody  // Pass setter
});

let hands = setupHands({ onResults: processHandResults });

initSpeedControls({
  speedSlider,
  speedValue,
  onSpeedChange: (val) => { speedMultiplier = val; }
});

// --- Simulation time tracking ---
let simulationTime = Date.now(); // ms since epoch, starts at real time

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

  // --- Camera Fly-to and Tracking Logic (DIAGNOSTIC VERSION) ---
  if (flyToAnimation.active) {
    const elapsed = now - flyToAnimation.startTime;
    flyToAnimation.progress = Math.min(elapsed / flyToAnimation.duration, 1);

    // 1. ONLY Animate position
    yawObject.position.lerpVectors(flyToAnimation.startPos, flyToAnimation.endPos, flyToAnimation.progress);

    // NO orientation changes during the positional slide for this diagnostic
    // pitchObject.rotation.x = flyToAnimation.startPitch * (1 - flyToAnimation.progress);

    if (flyToAnimation.progress >= 1) {
      flyToAnimation.active = false;
      yawObject.position.copy(flyToAnimation.endPos); // Ensure exact end position
      console.log("Fly-to (slide) complete. Body:", (trackedBody ? trackedBody.userData.name : 'None'));
      
      if(trackedBody) {
        console.log("Applying final lookAt and pitch correction.");
        const tempTargetPos = new THREE.Vector3();
        trackedBody.getWorldPosition(tempTargetPos);
        yawObject.up.set(0,1,0);
        yawObject.lookAt(tempTargetPos); // Apply lookAt only AFTER slide
        pitchObject.rotation.x = 0;      // Correct pitch AFTER slide
      } else {
        console.log("Tracked body lost by end of animation, not applying final lookAt.");
      }
    }
  } else if (trackedBody) { // Normal tracking logic (if animation is not active)
    const targetWorldPosition = new THREE.Vector3();
    trackedBody.getWorldPosition(targetWorldPosition);

    const bodyName = trackedBody.userData.name;
    let bodyVisualSize = 0; 
    if (bodyName === 'sun') {
        bodyVisualSize = sunBaseSize || 1.2;
    } else if (trackedBody.isMesh && trackedBody.geometry && trackedBody.geometry.parameters && bodyName === 'moon') { 
        bodyVisualSize = trackedBody.geometry.parameters.radius * trackedBody.scale.x;
    } else if (planetBaseSizes[bodyName]) {
        bodyVisualSize = planetBaseSizes[bodyName];
    } else { 
        bodyVisualSize = 0.5; 
    }

    const track_x_offset = bodyVisualSize * 0; 
    const track_y_offset = bodyVisualSize * 2 + 3; 
    const track_z_offset = bodyVisualSize * 8 + 10; 
    const trackingOffset = new THREE.Vector3(track_x_offset, track_y_offset, track_z_offset);
    const desiredCameraPosition = new THREE.Vector3().copy(targetWorldPosition).add(trackingOffset);

    yawObject.position.lerp(desiredCameraPosition, 0.1); 
    yawObject.up.set(0,1,0);
    yawObject.lookAt(targetWorldPosition);
    pitchObject.rotation.x = 0; 
  }
  // --- End Camera Logic ---

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

// Initialize the body list UI after Three.js setup and planet creation

// --- Body Click Handler (DIAGNOSTIC VERSION) ---
const handleBodyClick = (targetGroup, bodyName, isMoon) => {
  if (!targetGroup) {
    console.error("handleBodyClick: targetGroup is null for", bodyName);
    return;
  }

  console.log(`%c--- handleBodyClick for: ${bodyName} ---`, 'color: blue; font-weight: bold;');
  console.log("Current yawObject.position (captured as startPos):", yawObject.position.x.toFixed(2), yawObject.position.y.toFixed(2), yawObject.position.z.toFixed(2));
  console.log("Current yawObject.quaternion:", yawObject.quaternion.x.toFixed(2), yawObject.quaternion.y.toFixed(2), yawObject.quaternion.z.toFixed(2), yawObject.quaternion.w.toFixed(2) );
  console.log("Current pitchObject.rotation.x:", pitchObject.rotation.x.toFixed(2));

  // Set trackedBody immediately so subsequent logic knows about it
  // (setTrackedBody will also clear flyToAnimation.active if body is null)
  setTrackedBody(targetGroup);

  const targetWorldPosition = new THREE.Vector3();
  targetGroup.getWorldPosition(targetWorldPosition);
  flyToAnimation.targetToLookAt.copy(targetWorldPosition); // For final lookAt

  let bodyVisualSize = 0;
  if (bodyName === 'sun') {
    bodyVisualSize = sunBaseSize || 1.2;
  } else if (isMoon && targetGroup.geometry && targetGroup.geometry.parameters) {
    bodyVisualSize = targetGroup.geometry.parameters.radius * targetGroup.scale.x;
  } else if (planetBaseSizes[bodyName]) {
    bodyVisualSize = planetBaseSizes[bodyName];
  } else { 
    bodyVisualSize = 0.5;
    console.warn(`Could not determine visual size for ${bodyName}, using default.`);
  }
  
  // New endPos calculation:
  const viewDistance = bodyVisualSize * 8 + 10; // Desired distance from the planet
  const directionToTarget = new THREE.Vector3().copy(targetWorldPosition).normalize();
  
  // If target is at origin (e.g. Sun initially), directionToTarget will be (0,0,0)
  // In that case, pick a default viewing direction, e.g., along Z axis.
  if (directionToTarget.lengthSq() === 0) { 
    directionToTarget.set(0, 0.2, 1).normalize(); // Default view, slightly from above
  }

  // Calculate endPos by moving back from the target along the view direction (origin-to-target or default)
  // but we want to be offset from the target, so we take target and add an offset vector.
  // The offset vector should point from target towards camera.
  // A simple offset: slightly above (Y) and back (Z relative to a common frame).
  // Let's stick to adding a fixed world-space offset for simplicity first, and ensure it's large enough.
  const y_offset = bodyVisualSize * 2 + 5; // Increased min Y offset slightly
  const z_offset_view = viewDistance; // Use viewDistance for Z
  
  // Create offset vector. This will be added to targetWorldPosition.
  // To view from Z, and target is at (tx, ty, tz), camera at (tx, ty + y_off, tz + z_off_view)
  const cameraOffset = new THREE.Vector3(0, y_offset, z_offset_view);
  
  flyToAnimation.endPos.copy(targetWorldPosition).add(cameraOffset);
  flyToAnimation.startPos.copy(yawObject.position); 
  flyToAnimation.startPitch = pitchObject.rotation.x; 

  flyToAnimation.active = true;
  flyToAnimation.progress = 0;
  flyToAnimation.startTime = Date.now();

  console.log(`Starting fly-to (DIAGNOSTIC - slide only) for ${bodyName}.`);
  console.log(`  StartPos (world): ${flyToAnimation.startPos.x.toFixed(2)}, ${flyToAnimation.startPos.y.toFixed(2)}, ${flyToAnimation.startPos.z.toFixed(2)}`);
  console.log(`  EndPos (world): ${flyToAnimation.endPos.x.toFixed(2)}, ${flyToAnimation.endPos.y.toFixed(2)}, ${flyToAnimation.endPos.z.toFixed(2)}`);
  console.log(`  TargetToLookAt (world): ${flyToAnimation.targetToLookAt.x.toFixed(2)}, ${flyToAnimation.targetToLookAt.y.toFixed(2)}, ${flyToAnimation.targetToLookAt.z.toFixed(2)}`);
};
// --- End Body Click Handler ---


initBodyList({
  bodiesListUlElement: document.getElementById('bodies-list'),
  planetData,
  getCamera,
  getSunMesh,
  shapes,
  planetBaseSizes,
  sunBaseSize,
  moonOrbitData,
  solarSystemGroup,
  onBodyClick: handleBodyClick // Pass the handler
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
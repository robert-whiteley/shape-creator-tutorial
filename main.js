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
import { initBodyList } from './ui/bodyList.js';
import { initSimDateDisplay, updateSimDateDisplay as updateSimDateDisplayModule } from './ui/simulationDate.js';
import { initScaleControls } from './ui/scaleControls.js';

let video = document.getElementById('webcam');
let canvas = document.getElementById('canvas');
let ctx = canvas.getContext('2d');
let shapes = [];
let solarSystemGroup = new THREE.Group();
let lastTwoHandDistance = null;
let livePreviousPinchDistance = null;
let speedMultiplier = 1;
let lastPanPosition = null;
let lastAnimationTime = Date.now();
let speedSlider = document.getElementById('speed-slider');
let speedValue = document.getElementById('speed-value');
let scaleSlider = document.getElementById('scale-slider');
let scaleValue = document.getElementById('scale-value');
let planetBaseSizes = {};
let sunBaseSize = null;

const RELATIVE_VIEW_DISTANCE_MULTIPLIER = 4.0; // For jump-to and follow distance

let followedObject = null; // Will become an object: { mesh, baseSize, worldOrientedNormalizedViewDir }

// --- Camera Animation State ---
let isCameraAnimating = false;
let animationStartTime = 0;
const ANIMATION_DURATION = 1500; // Fly-to duration in milliseconds (e.g., 1.5 seconds)
let cameraAnimationStartPos = new THREE.Vector3();
let cameraAnimationEndPos = new THREE.Vector3();
let cameraAnimationStartLookAt = new THREE.Vector3();
let cameraAnimationEndLookAt = new THREE.Vector3();
let targetObjectForAnimation = null; // Stores the mesh to be followed after animation

// New rotation state variables for two-hand gestures
let gestureInitialQuaternion = null;
let gestureInitialTwoHandAngle = null;
let gestureInitialTwoHandMidY = null;
let gestureInitialTwoHandMidX = null;

// --- UI Update for Bodies List ---

// New cameraControls object to manage camera animation state from other modules
const cameraControls = {
  startFlyToAnimation: ({ lookAtTargetPoint, meshToFollowAfterAnimation, baseSizeForOffset, worldOrientedNormalizedViewDir }) => {
    const camera = getCamera();
    if (!camera) return;

    cameraAnimationEndLookAt.copy(lookAtTargetPoint);

    const currentScale = parseInt(scaleSlider.value) || 1;
    const visualActualSize = baseSizeForOffset * currentScale;
    const offsetDistance = visualActualSize * RELATIVE_VIEW_DISTANCE_MULTIPLIER;

    const finalOffsetVector = worldOrientedNormalizedViewDir.clone().multiplyScalar(offsetDistance);
    cameraAnimationEndPos.copy(lookAtTargetPoint).add(finalOffsetVector);

    cameraAnimationStartPos.copy(camera.position);

    const tempLookAtVec = new THREE.Vector3(); // Renamed to avoid conflict
    camera.getWorldDirection(tempLookAtVec).multiplyScalar(10).add(camera.position);
    cameraAnimationStartLookAt.copy(tempLookAtVec);

    targetObjectForAnimation = {
        mesh: meshToFollowAfterAnimation,
        baseSize: baseSizeForOffset,
        worldOrientedNormalizedViewDir: worldOrientedNormalizedViewDir
    };
    isCameraAnimating = true;
    animationStartTime = Date.now();
  },
  cancelAnimationsAndFollow: () => {
    followedObject = null;
    isCameraAnimating = false;
    targetObjectForAnimation = null;
  }
};

// --- Simulation time tracking ---
let simulationTime = Date.now(); // ms since epoch, starts at real time

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
      cameraControls.cancelAnimationsAndFollow(); // Cancel fly-to or follow if two-hand gesture starts
      const camera = getCamera();
      const dx = r[8].x - l[8].x;
      const dy = r[8].y - l[8].y;
      const angle = Math.atan2(dy, dx);
      const distance = Math.hypot(dx, dy); // Current pinch distance
      const midY = (l[8].y + r[8].y) / 2;
      const midX = (l[8].x + r[8].x) / 2;

      if (gestureInitialTwoHandAngle === null) { // Detect start of a new two-hand gesture
        // Start of a new two-hand gesture
        gestureInitialQuaternion = solarSystemGroup.quaternion.clone();
        gestureInitialTwoHandAngle = angle;
        gestureInitialTwoHandMidY = midY;
        gestureInitialTwoHandMidX = midX;

        // Initialize states for zoom/dolly
        lastTwoHandDistance = distance;
        livePreviousPinchDistance = distance;
      } else {
        // Continuous gesture:
        // const camera = getCamera(); // Already got camera

        // 1. Calculate total deltas from gesture start
        const totalDeltaAngleY = angle - gestureInitialTwoHandAngle;
        const totalDeltaMidY = midY - gestureInitialTwoHandMidY;
        const totalDeltaMidX = midX - gestureInitialTwoHandMidX;

        // 2. Start with the initial orientation of the solar system group
        let newQuaternion = gestureInitialQuaternion.clone();

        // 3. Apply Y-axis rotation (world Y - for twisting hands)
        const rotY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), totalDeltaAngleY);
        newQuaternion.premultiply(rotY);


        // 4. Apply X-axis rotation (camera's right vector - for lifting plate)
        const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0); // Camera's local X axis in world space
        const rotationAmountX = -totalDeltaMidY * 4.0;
        const rotX = new THREE.Quaternion().setFromAxisAngle(cameraRight, rotationAmountX);
        newQuaternion.premultiply(rotX); // Apply camera-relative X rotation after world Y

        // 5. Apply Z-axis rotation (solar system's local Z - for side-to-side hand movement translating to roll)
        const rotationAmountZ = -totalDeltaMidX * 4.0;
        const rotZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rotationAmountZ); // Axis (0,0,1) is local to the current quaternion state
        newQuaternion.multiply(rotZ); // Multiply to apply in local space (after Y and X)
        
        solarSystemGroup.quaternion.copy(newQuaternion);

        // Continuous gesture: Camera Dolly (New Zoom Logic)
        if (livePreviousPinchDistance !== null) {
          const pinchDiff = distance - livePreviousPinchDistance;
          
          const DOLLY_SENSITIVITY = 25; // Base sensitivity
          
          const currentCameraDistanceToGroup = camera.position.distanceTo(solarSystemGroup.position);
          const adaptiveDollySensitivityFactor = Math.max(0.1, currentCameraDistanceToGroup / 20.0);
          const adaptiveDollySensitivity = DOLLY_SENSITIVITY * adaptiveDollySensitivityFactor;
          
          const dollyAmount = pinchDiff * adaptiveDollySensitivity;

          const viewDirection = camera.getWorldDirection(new THREE.Vector3());
          camera.position.addScaledVector(viewDirection, dollyAmount);
        }
        livePreviousPinchDistance = distance; // Update for next frame's delta
      }
      return; // Processed two-hand gesture
    }
  }

  // Reset two-hand gesture state if not actively pinching with two hands
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length < 2 ||
      !(isPinch(results.multiHandLandmarks[0]) && isPinch(results.multiHandLandmarks[1]))) {
    gestureInitialQuaternion = null; // Reset new rotation state
    gestureInitialTwoHandAngle = null;
    gestureInitialTwoHandMidY = null;
    gestureInitialTwoHandMidX = null;

    lastTwoHandDistance = null; // Reset zoom state
    livePreviousPinchDistance = null; // Reset for dolly zoom
  }

  // One-hand pinch for panning
  if (results.multiHandLandmarks.length > 0) {
    let pinchDetected = false;
    for (const landmarks of results.multiHandLandmarks) {
      if (isPinch(landmarks)) {
        cameraControls.cancelAnimationsAndFollow(); // Cancel fly-to or follow if one-hand gesture starts
        pinchDetected = true;
        const indexTip = landmarks[8]; // Normalized screen coordinates (0-1)
        const PAN_SENSITIVITY = 10; // Adjust as needed

        if (lastPanPosition === null) {
          lastPanPosition = { x: indexTip.x, y: indexTip.y };
        } else {
          const deltaX = indexTip.x - lastPanPosition.x;
          const deltaY = indexTip.y - lastPanPosition.y;

          const camera = getCamera();
          const camRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
          const camUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);

          const currentCameraDistanceToGroup = camera.position.distanceTo(solarSystemGroup.position);
          const panScaleFactor = Math.max(0.1, currentCameraDistanceToGroup / 10.0);

          solarSystemGroup.position.addScaledVector(camRight, deltaX * PAN_SENSITIVITY * panScaleFactor);
          solarSystemGroup.position.addScaledVector(camUp, -deltaY * PAN_SENSITIVITY * panScaleFactor);

          lastPanPosition = { x: indexTip.x, y: indexTip.y };
        }
        break;
      }
    }
    if (!pinchDetected) {
      lastPanPosition = null;
    }
  } else {
    lastPanPosition = null;
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

function setPlanetScales(scale) {
  shapes.forEach(shape => {
    const planetName = shape.userData ? shape.userData.name : null;

    if (!planetName) return;

    if (planetName === 'earth') {
      if (moonOrbitData.has(shape)) {
        const { moon: moonMesh, earthSpinnner } = moonOrbitData.get(shape);
        
        if (earthSpinnner && earthSpinnner.children[0]) {
          earthSpinnner.children[0].scale.set(scale, scale, scale);
        }
        
        if (moonMesh) {
          moonMesh.scale.set(scale, scale, scale);
        }
      }
    } else {
      if (shape.children[0]) {
        shape.children[0].scale.set(scale, scale, scale);
      }
    }
  });

  const sunMesh = getSunMesh();
  if (sunMesh) {
    sunMesh.scale.set(scale, scale, scale);
  }
}

const animate = () => {
  requestAnimationFrame(animate);
  const now = Date.now();
  const deltaMs = now - lastAnimationTime;
  lastAnimationTime = now;
  simulationTime += deltaMs * speedMultiplier;
  updateSimDateDisplayModule(simulationTime);

  const simDaysElapsedInFrame = (deltaMs * speedMultiplier / (24 * 60 * 60 * 1000));

  shapes.forEach(shape => {
    const userData = shape.userData || {};
    const planetName = userData.name;

    if (moonOrbitData.has(shape)) { // This is the earthSystemGroup
      const { pivot: moonOrbitalPivot, earthSpinnner } = moonOrbitData.get(shape);

      if (earthSpinnner && planetSpeeds['earth']) {
        earthSpinnner.rotation.y += planetSpeeds['earth'].rotation * simDaysElapsedInFrame;
      }

      if (moonOrbitalPivot) {
        moonOrbitalPivot.rotation.y += (2 * Math.PI / 27.32) * simDaysElapsedInFrame;
      }

    } else if (planetName && planetSpeeds[planetName] && planetSpeeds[planetName].rotation !== undefined) {
      shape.rotation.y += (planetSpeeds[planetName].rotation || 0) * simDaysElapsedInFrame;
    }

    if (planetOrbitData.has(shape)) {
      const sunOrbitPivot = planetOrbitData.get(shape);
      if (planetName && planetSpeeds[planetName] && planetSpeeds[planetName].orbit !== undefined) {
        sunOrbitPivot.rotation.y += (planetSpeeds[planetName].orbit || 0) * simDaysElapsedInFrame;
      }
    }
  });

  const sunMesh = getSunMesh();
  if (sunMesh) {
    sunMesh.rotation.y += (planetSpeeds['sun']?.rotation || 0) * simDaysElapsedInFrame;
  }

  const camera = getCamera();
  const tempWorldPos = new THREE.Vector3();
  const tempLookAt = new THREE.Vector3(); // Already defined inside cameraControls.startFlyToAnimation if needed there

  if (isCameraAnimating) {
    const elapsed = Date.now() - animationStartTime;
    let progress = Math.min(elapsed / ANIMATION_DURATION, 1.0);
    
    progress = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    camera.position.lerpVectors(cameraAnimationStartPos, cameraAnimationEndPos, progress);
    // tempLookAt is declared above, reuse it
    tempLookAt.lerpVectors(cameraAnimationStartLookAt, cameraAnimationEndLookAt, progress);
    camera.lookAt(tempLookAt);

    if (progress === 1.0) {
      isCameraAnimating = false;
      if (targetObjectForAnimation) {
        followedObject = targetObjectForAnimation;
        targetObjectForAnimation = null;
      }
    }
  } else if (followedObject && followedObject.mesh && followedObject.worldOrientedNormalizedViewDir) {
    followedObject.mesh.getWorldPosition(tempWorldPos);

    const currentScale = parseInt(scaleSlider.value) || 1;
    const visualActualSize = followedObject.baseSize * currentScale;
    
    const newOffsetDistance = visualActualSize * RELATIVE_VIEW_DISTANCE_MULTIPLIER;

    const currentOffsetVector = followedObject.worldOrientedNormalizedViewDir.clone().multiplyScalar(newOffsetDistance);

    camera.position.copy(tempWorldPos).add(currentOffsetVector);
    camera.lookAt(tempWorldPos);
  }

  getRenderer().render(getScene(), camera);
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
});

// Initialize the body list UI after Three.js setup and planet creation
initBodyList({
  bodiesListUlElement: document.getElementById('bodies-list'),
  planetData,
  getCamera,
  getSunMesh,
  shapes,
  planetBaseSizes,
  sunBaseSize,
  moonOrbitData,
  cameraControls,
  solarSystemGroup
});

// Initialize the simulation date display
initSimDateDisplay(document.getElementById('sim-date'));

// Initialize scale controls
initScaleControls({
  scaleSliderElement: scaleSlider,
  scaleValueElement: scaleValue,
  initialScale: 1,
  onScaleChange: setPlanetScales
});

animate();

initCamera({
  video,
  canvas,
  hands,
});
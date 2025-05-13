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
import { initGestureController } from './gestures/gestureController.js';

let video = document.getElementById('webcam');
let canvas = document.getElementById('canvas');
let ctx = canvas.getContext('2d');
let shapes = [];
let solarSystemGroup = new THREE.Group();
let speedMultiplier = 1;
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

// Initialize Gesture Controller
const processHandResults = initGestureController({
  getCamera,
  solarSystemGroup,
  cameraControls,
  isPinch,
  ctx
});

let hands = setupHands({ onResults: processHandResults });

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
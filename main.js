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
import { initCameraController } from './camera/cameraController.js';

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

// Initialize Camera Controller
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
  cameraControls: cameraController,
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

    if (moonOrbitData.has(shape)) {
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

  cameraController.updateCamera();

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
  cameraControls: cameraController,
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
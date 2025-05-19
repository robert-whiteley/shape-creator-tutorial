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
  // console.log("[Debug] In handleBodyClick, passed cc is:", cc);
  if (!cc) { 
    console.error("handleBodyClick: cameraController (cc parameter) was not provided or is falsy.");
    return;
  }

  console.log(`%c--- handleBodyClick for: ${bodyName}, isMoon: ${isMoon} ---`, 'color: green; font-weight: bold;');

  const targetWorldPosition = new THREE.Vector3();
  targetMesh.getWorldPosition(targetWorldPosition);

  let actualFillMesh; // This is the mesh whose geometry.parameters.radius and scale.x define the visual size

  if (bodyName === 'sun') {
    const sunPlanetGroup = getSunMesh();
    if (sunPlanetGroup && sunPlanetGroup.children[0] && sunPlanetGroup.children[0].children[0]) {
      actualFillMesh = sunPlanetGroup.children[0].children[0];
    }
  } else if (isMoon) {
    // For the Moon, assume targetMesh IS the moon's fill mesh, as passed by initBodyList
    actualFillMesh = targetMesh;
  } else { // Earth or other planets
    // Find the main group for this planet from the 'shapes' array
    const planetGroup = shapes.find(s => s.userData && s.userData.name === bodyName);
    if (planetGroup) {
      if (bodyName === 'earth') {
        const earthMoonData = moonOrbitData.get(planetGroup); // planetGroup is earthSystemGroup for Earth
        if (earthMoonData && earthMoonData.earthSpinner && earthMoonData.earthSpinner.children[0]) {
          actualFillMesh = earthMoonData.earthSpinner.children[0];
        }
      } else { // Other planets (Mars, Jupiter, etc.)
        // planetGroup is likely the axialSpinGroup, its first child is the fillMesh's group, then fillMesh
        if (planetGroup.children[0] && planetGroup.children[0].children[0]) {
          actualFillMesh = planetGroup.children[0].children[0];
        }
      }
    }
  }

  // If the above specific logic didn't find actualFillMesh, 
  // but targetMesh itself has geometry (e.g. initBodyList passed the fillMesh directly)
  if (!actualFillMesh && targetMesh && targetMesh.geometry && targetMesh.geometry.parameters) {
    // console.log(`  actualFillMesh not found via specific logic for ${bodyName}. Using targetMesh itself as actualFillMesh.`);
    actualFillMesh = targetMesh;
  }

  let currentVisualRadius = 0.1; // Default to a small positive radius

  if (actualFillMesh && actualFillMesh.geometry && actualFillMesh.geometry.parameters && 
      typeof actualFillMesh.geometry.parameters.radius === 'number' && 
      actualFillMesh.scale && typeof actualFillMesh.scale.x === 'number') {
    const geomRadius = actualFillMesh.geometry.parameters.radius;
    const scaleX = actualFillMesh.scale.x;
    currentVisualRadius = geomRadius * scaleX;
    // console.log(`  For ${bodyName}: Determined actualFillMesh. geomRadius=${geomRadius.toFixed(4)}, scaleX=${scaleX.toFixed(4)}, visualRadius=${currentVisualRadius.toFixed(4)}`);
  } else {
    // console.warn(`  Could not determine currentVisualRadius from actualFillMesh for ${bodyName}. Mesh:`, actualFillMesh);
    // Fallback to original base sizes (these are unscaled, so less accurate for camera offset if body is scaled)
    if (bodyName === 'sun') {
      currentVisualRadius = sunBaseSize;
    } else if (isMoon) {
      currentVisualRadius = planetBaseSizes.moon || 0.25; // planetBaseSizes.moon is unscaled radius
    } else if (planetBaseSizes[bodyName]) {
      currentVisualRadius = planetBaseSizes[bodyName];
    } else {
      // console.log(`  Using absolute default radius 0.1 for ${bodyName}`);
      currentVisualRadius = 0.1; // Absolute fallback if no info
    }
    // console.log(`  Using fallback/original radius for ${bodyName}: ${currentVisualRadius.toFixed(4)}`);
  }
  
  const baseSizeForOffset = Math.max(0.05, currentVisualRadius || 0.05); // Ensure a minimum size
  console.log(`  Final baseSizeForOffset for ${bodyName}: ${baseSizeForOffset.toFixed(4)} (current visual radius)`);

  cc.startFlyToAnimation({
    lookAtTargetPoint: targetWorldPosition,
    meshToFollowAfterAnimation: targetMesh, // This is the mesh the camera will actually follow
    baseSizeForOffset: baseSizeForOffset    // This is our calculated current visual radius of the body
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

const scalePlanetsButton = document.getElementById('scalePlanetsButton');
if (scalePlanetsButton) {
  scalePlanetsButton.addEventListener('click', () => {
    console.log("Scale Planets button clicked");

    const newRelativeDiameters = {
      sun: 1.0, mercury: 0.20, venus: 0.25, earth: 0.28, mars: 0.22,
      jupiter: 0.40, saturn: 0.38, uranus: 0.32, neptune: 0.32,
    };
    const newRelativeOrbitRadii = {
      mercury: 2.0, venus: 3.0, earth: 4.0, mars: 5.0,
      jupiter: 7.0, saturn: 9.0, uranus: 11.0, neptune: 13.0,
    };

    const sunPlanetGroup = getSunMesh(); // This is the planetGroup for the Sun
    if (!sunPlanetGroup || !sunPlanetGroup.children[0] || !sunPlanetGroup.children[0].children[0]) {
        console.error("Sun mesh structure not found as expected.");
        return;
    }
    const sunFillMesh = sunPlanetGroup.children[0].children[0]; // Sun's axialSpinGroup -> fillMesh
    
    const sunOriginalBaseRadius = sunBaseSize; // From solarSystem.js (should be 1.0)
    const currentSunScaleFactor = sunFillMesh.scale.x;
    const currentSunDisplayRadius = sunOriginalBaseRadius * currentSunScaleFactor;

    console.log(`Sun Base Radius: ${sunOriginalBaseRadius}, Current Sun Scale: ${currentSunScaleFactor}, Current Sun Display Radius: ${currentSunDisplayRadius}`);

    shapes.forEach(planetGroup => {
      const planetName = planetGroup.userData ? planetGroup.userData.name : null;
      if (!planetName || !newRelativeDiameters[planetName]) {
        console.log(`Skipping ${planetName || 'Unknown Planet'} as it's not in newRelativeDiameters`);
        return; // Skip if not in our list (e.g., Pluto, Moon, or if userData is missing)
      }

      let planetFillMesh;
      const originalPlanetBaseRadius = planetBaseSizes[planetName];

      if (!originalPlanetBaseRadius) {
          console.warn(`Original base radius for ${planetName} not found in planetBaseSizes. Skipping size update.`);
          return; // Cannot calculate new scale without original base size
      }

      if (planetName === 'earth') {
        const earthMoonData = moonOrbitData.get(planetGroup); // planetGroup for Earth is earthSystemGroup
        if (earthMoonData && earthMoonData.earthSpinner && earthMoonData.earthSpinner.children[0]) {
          planetFillMesh = earthMoonData.earthSpinner.children[0]; // Actual Earth mesh
           // Note: Moon is not in newRelativeDiameters, so it won't be processed by this loop for size.
        } else {
          console.error('Earth mesh structure not found for scaling.');
          return;
        }
      } else if (planetName === 'sun') {
        planetFillMesh = sunFillMesh; // Already got this
      } else {
        // For other planets, planetGroup -> axialSpinGroup -> fillMesh
        if (planetGroup.children[0] && planetGroup.children[0].children[0]) {
          planetFillMesh = planetGroup.children[0].children[0];
        } else {
          console.error(`Mesh structure for ${planetName} not found as expected.`);
          return;
        }
      }
      
      // Update Size
      const newTargetPlanetRadius = newRelativeDiameters[planetName] * currentSunDisplayRadius;
      const newPlanetScaleFactor = originalPlanetBaseRadius !== 0 ? newTargetPlanetRadius / originalPlanetBaseRadius : 0;
      
      console.log(`Planet: ${planetName}, Original Base: ${originalPlanetBaseRadius}, New Target Radius: ${newTargetPlanetRadius}, New Scale Factor: ${newPlanetScaleFactor}`);
      
      if (planetFillMesh) {
        planetFillMesh.scale.set(newPlanetScaleFactor, newPlanetScaleFactor, newPlanetScaleFactor);
      } else {
        console.warn(`Could not find fill mesh for ${planetName} to apply scale.`);
      }

      // Update Orbit Radius (if not Sun and in the orbit list)
      if (planetName !== 'sun' && newRelativeOrbitRadii[planetName]) {
        const orbitParams = planetOrbitData.get(planetGroup);
        if (orbitParams) {
          const newTargetOrbitSemiMajorAxis = newRelativeOrbitRadii[planetName] * currentSunDisplayRadius;
          console.log(`Planet: ${planetName}, New Orbit Radius (a): ${newTargetOrbitSemiMajorAxis}`);
          orbitParams.a = newTargetOrbitSemiMajorAxis;

          // Update Orbit Line
          if (orbitParams.orbitLineMesh) {
            solarSystemGroup.remove(orbitParams.orbitLineMesh);
            if (orbitParams.orbitLineMesh.geometry) orbitParams.orbitLineMesh.geometry.dispose();
            if (orbitParams.orbitLineMesh.material) orbitParams.orbitLineMesh.material.dispose();
          }
          
          // Ensure all params for createOrbitLine are valid, esp. eccentricity
          const e = orbitParams.e !== undefined ? orbitParams.e : 0;
          const i = orbitParams.i !== undefined ? orbitParams.i : 0;
          const node = orbitParams.node !== undefined ? orbitParams.node : 0;
          const peri = orbitParams.peri !== undefined ? orbitParams.peri : 0;

          const newOrbitLine = createOrbitLine(orbitParams.a, e, i, node, peri, 128, 0xffffff, 0.2);
          orbitParams.orbitLineMesh = newOrbitLine;
          solarSystemGroup.add(newOrbitLine);
        } else {
          console.warn(`Orbit params not found for ${planetName} to update orbit radius.`);
        }
      }
    });
    console.log("Planet scaling and orbit adjustment finished.");
  });
} else {
  console.error("Scale Planets button not found in the DOM.");
}
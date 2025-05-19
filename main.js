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
let interpolationScaleSlider = document.getElementById('interpolation-scale-slider');
let interpolationScaleValue = document.getElementById('interpolation-scale-value');
let velocityDisplay = document.getElementById('velocity-display');

// --- State for S0 (real) and S1 (artistic) scales/orbits ---
let s0_params = {};
let s1_params = {};
// Stores the Sun's display radius when S1 is calculated by the button,
// used for consistent scaling of other bodies if S1 definition depends on it.
let currentSunDisplayRadiusForS1Calculation = null; 

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

// Function to get the actual mesh that is scaled (fill mesh)
function getPlanetFillMesh(planetGroup, planetName) {
  if (!planetGroup) return null;

  if (planetName === 'sun') {
    // sunMesh (from getSunMesh()) is the planetGroup. Structure: Group -> AxialSpinGroup -> FillMesh
    return planetGroup.children[0]?.children[0];
  }
  if (planetName === 'earth') {
    // earthSystemGroup is the planetGroup.
    const earthData = moonOrbitData.get(planetGroup); // planetGroup is earthSystemGroup
    return earthData?.earthSpinner?.children[0]; // This is Earth's fill mesh
  }
  // For other planets: planetGroup (e.g. jupiterGroup) -> AxialSpinGroup -> FillMesh
  if (planetGroup.children && planetGroup.children[0] && planetGroup.children[0].children[0]) {
    return planetGroup.children[0].children[0];
  }
  console.warn(`Could not find fill mesh for ${planetName}`);
  return null;
}

function captureS0State() {
  console.log("Capturing S0 state...");
  // S0 for Sun
  const sunGroup = getSunMesh(); // This is the main group for the sun
  if (sunGroup) {
    const sunName = sunGroup.userData.name || 'sun'; // Assuming userData.name is set during creation
    s0_params[sunName] = {
      meshScaleFactor: 1.0, // By definition for S0
      // orbitA: N/A for Sun, or use sunBaseSize if a dimension is needed
    };
    const sunFillMesh = getPlanetFillMesh(sunGroup, sunName);
    if (sunFillMesh) {
      sunFillMesh.userData.currentVisualScaleFactor = 1.0;
    } else {
      console.warn("Sun fill mesh not found for S0 capture.");
    }
  } else {
    console.warn("Sun group not found for S0 capture.");
  }

  // S0 for Planets (including Earth)
  shapes.forEach(planetGroup => {
    const name = planetGroup.userData.name;
    if (!name || name === 'sun') return; // Sun handled above, skip if no name

    const orbitalParams = planetOrbitData.get(planetGroup);
    s0_params[name] = {
      meshScaleFactor: 1.0, // By definition for S0
      orbitA: orbitalParams ? orbitalParams.a : 0, // Store initial semi-major axis
      // Store other S0 orbital elements if they might change, though typically only 'a' changes with this scaling
      e: orbitalParams ? orbitalParams.e : 0,
      i: orbitalParams ? orbitalParams.i : 0,
      node: orbitalParams ? orbitalParams.node : 0,
      peri: orbitalParams ? orbitalParams.peri : 0,
    };
    const fillMesh = getPlanetFillMesh(planetGroup, name);
    if (fillMesh) {
      fillMesh.userData.currentVisualScaleFactor = 1.0;
    } else {
      console.warn(`${name} fill mesh not found for S0 capture.`);
    }

    // S0 for Moon (if current planet is Earth)
    if (name === 'earth') {
      const earthData = moonOrbitData.get(planetGroup); // planetGroup is earthSystemGroup
      if (earthData && earthData.moon) {
        s0_params['moon'] = {
          meshScaleFactor: 1.0, // By definition for S0
          orbitA_around_earth: earthData.initialMoonDistance,
          // Moon's orbit around Earth is simplified, primarily radius changes
        };
        earthData.moon.userData.currentVisualScaleFactor = 1.0;
      } else {
        console.warn("Moon data not found for S0 capture with Earth.");
      }
    }
  });

  // Initialize s1_params as a deep copy of s0_params
  s1_params = JSON.parse(JSON.stringify(s0_params));
  console.log("S0 State Captured:", s0_params);
  console.log("S1 State Initialized:", s1_params);
}

// Function to apply interpolated scale to all bodies and orbits
function applyInterpolatedScale(alpha) {
  // console.log(`Applying interpolated scale with alpha: ${alpha}`);
  if (!s0_params || Object.keys(s0_params).length === 0 || !s1_params || Object.keys(s1_params).length === 0) {
    console.warn("S0 or S1 params not ready for applyInterpolatedScale.");
    return;
  }

  const sunGroup = getSunMesh();
  const sunName = sunGroup?.userData?.name || 'sun';

  // --- Apply to Sun ---
  if (sunGroup && s0_params[sunName] && s1_params[sunName]) {
    const sunFillMesh = getPlanetFillMesh(sunGroup, sunName);
    if (sunFillMesh) {
      const targetScaleSun = (1 - alpha) * s0_params[sunName].meshScaleFactor + alpha * s1_params[sunName].meshScaleFactor;
      sunFillMesh.scale.set(targetScaleSun, targetScaleSun, targetScaleSun);
      sunFillMesh.userData.currentVisualScaleFactor = targetScaleSun;
    }
  }

  // --- Apply to Planets ---
  shapes.forEach(planetGroup => {
    const name = planetGroup.userData.name;
    if (!name || name === sunName) return; // Sun handled above or skip if no name

    const fillMesh = getPlanetFillMesh(planetGroup, name);
    const s0p = s0_params[name];
    const s1p = s1_params[name];

    if (fillMesh && s0p && s1p) {
      const targetScalePlanet = (1 - alpha) * s0p.meshScaleFactor + alpha * s1p.meshScaleFactor;
      fillMesh.scale.set(targetScalePlanet, targetScalePlanet, targetScalePlanet);
      fillMesh.userData.currentVisualScaleFactor = targetScalePlanet;
    }

    // Update planet orbits (except for Sun)
    const orbitParams = planetOrbitData.get(planetGroup);
    if (orbitParams && s0p && s1p && typeof s0p.orbitA === 'number' && typeof s1p.orbitA === 'number') {
      const targetOrbitA = (1 - alpha) * s0p.orbitA + alpha * s1p.orbitA;
      orbitParams.a = targetOrbitA;

      // Redraw orbit line
      if (orbitParams.orbitLineMesh) {
        solarSystemGroup.remove(orbitParams.orbitLineMesh);
        if (orbitParams.orbitLineMesh.geometry) orbitParams.orbitLineMesh.geometry.dispose();
        if (orbitParams.orbitLineMesh.material) orbitParams.orbitLineMesh.material.dispose();
      }
      // Use S0 eccentricity, inclination, etc. for the orbit shape, only semi-major axis 'a' changes
      const newOrbitLine = createOrbitLine(targetOrbitA, s0p.e, s0p.i, s0p.node, s0p.peri, 128, 0xffffff, 0.2);
      orbitParams.orbitLineMesh = newOrbitLine;
      solarSystemGroup.add(newOrbitLine);
    }

    // --- Apply to Moon (if current planet is Earth) ---
    if (name === 'earth') {
      const earthData = moonOrbitData.get(planetGroup); // planetGroup is earthSystemGroup
      const s0Moon = s0_params.moon;
      const s1Moon = s1_params.moon;

      if (earthData && earthData.moon && earthData.pivot && s0Moon && s1Moon) {
        const moonMesh = earthData.moon;
        const moonPivot = earthData.pivot;

        // Scale Moon mesh
        const targetScaleMoon = (1 - alpha) * s0Moon.meshScaleFactor + alpha * s1Moon.meshScaleFactor;
        moonMesh.scale.set(targetScaleMoon, targetScaleMoon, targetScaleMoon);
        moonMesh.userData.currentVisualScaleFactor = targetScaleMoon;

        // Scale Moon orbit radius & redraw line
        if (typeof s0Moon.orbitA_around_earth === 'number' && typeof s1Moon.orbitA_around_earth === 'number') {
          const targetMoonOrbitRadius = (1 - alpha) * s0Moon.orbitA_around_earth + alpha * s1Moon.orbitA_around_earth;
          
          moonMesh.position.set(targetMoonOrbitRadius, 0, 0); // Moon position relative to its pivot
          earthData.initialMoonDistance = targetMoonOrbitRadius; // Update stored distance

          if (earthData.orbitLine) {
            moonPivot.remove(earthData.orbitLine); // Orbit line is child of pivot
            if (earthData.orbitLine.geometry) earthData.orbitLine.geometry.dispose();
            if (earthData.orbitLine.material) earthData.orbitLine.material.dispose();
          }
          const newMoonLine = createOrbitLine(targetMoonOrbitRadius, 0, 0, 0, 0, 64, 0x888888, 0.3);
          earthData.orbitLine = newMoonLine;
          moonPivot.add(newMoonLine);
        }
      }
    }
  });

  if (interpolationScaleValue) {
    interpolationScaleValue.textContent = `${Math.round(alpha * 100)}%`;
  }
}

// Call captureS0State after solar system is initialized by initThree
captureS0State();
// Apply initial scale (S0)
applyInterpolatedScale(0.0);
if (interpolationScaleSlider) {
    interpolationScaleSlider.value = "0"; // Set slider to 0
}


// Event listener for the new interpolation slider
if (interpolationScaleSlider) {
  interpolationScaleSlider.addEventListener('input', (event) => {
    const alpha = parseFloat(event.target.value);
    applyInterpolatedScale(alpha);
  });
}


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

animate();

initCamera({
  video,
  canvas,
  hands,
});

window.getScene = getScene;

const TARGET_S1_SUN_SCALE_FACTOR = 20.0; // Example: Sun is 20x its base size in S1 visuals.
                                         // This factor determines the S1 sun size, which then acts as a reference.

// handleBodyClick function - accepts 'cc' (cameraController instance) as a parameter
// ... (this function remains, ensure it's not inside the slider listener)

// --- Sun Initialization for S1 calculation ---
// let initialSunVisualRadiusForCameraScaling = 1.0; // This was for camera adjustment post-button
// The important part for S1 calculation is sunBaseSize for the true S0 radius.

const scalePlanetsButton = document.getElementById('scalePlanetsButton');
if (scalePlanetsButton) {
  scalePlanetsButton.addEventListener('click', () => {
    console.log("'Apply Artistic Scale' button clicked. Defining S1 state...");

    // These are the artistic proportions for S1 state
    const newRelativeDiameters = {
      sun: 1.0, // Sun's S1 visual diameter becomes the reference unit for other S1 diameters
      mercury: 0.20, venus: 0.25, earth: 0.28, mars: 0.22,
      jupiter: 0.40, saturn: 0.38, uranus: 0.32, neptune: 0.32,
      pluto: 0.10, moon: 0.08,
    };
    const newRelativeOrbitRadii = { // Orbits around Sun, relative to S1 Sun's visual radius as 1 unit
      mercury: 2.0, venus: 3.0, earth: 4.0, mars: 5.0,
      jupiter: 7.0, saturn: 9.0, uranus: 11.0, neptune: 13.0,
      pluto: 15.0,
    };

    const sunGroup = getSunMesh();
    const sunName = sunGroup?.userData?.name || 'sun';

    // 1. Determine Sun's S1 scale and the resulting S1 display radius for reference
    if (!s1_params[sunName]) s1_params[sunName] = {};
    s1_params[sunName].meshScaleFactor = TARGET_S1_SUN_SCALE_FACTOR;
    // currentSunDisplayRadiusForS1Calculation is the visual radius of the Sun in S1 state
    currentSunDisplayRadiusForS1Calculation = sunBaseSize * s1_params[sunName].meshScaleFactor;
    if (currentSunDisplayRadiusForS1Calculation === 0) {
        console.error("S1 currentSunDisplayRadius is 0, cannot proceed."); return;
    }

    // 2. Calculate S1 parameters for Planets
    shapes.forEach(planetGroup => {
      const name = planetGroup.userData.name;
      if (!name || name === sunName) return; // Sun handled, skip if no name

      if (!s1_params[name]) s1_params[name] = {};
      const s0p_orbit = s0_params[name]; // For inheriting e, i, node, peri

      // S1 Planet Mesh Scale Factor
      if (newRelativeDiameters[name] && planetBaseSizes[name]) {
        const newTargetPlanetRadiusS1 = newRelativeDiameters[name] * currentSunDisplayRadiusForS1Calculation;
        s1_params[name].meshScaleFactor = newTargetPlanetRadiusS1 / planetBaseSizes[name];
      } else {
        s1_params[name].meshScaleFactor = s0_params[name]?.meshScaleFactor || 1.0; // Fallback to S0
        console.warn(`Missing data for S1 mesh scale for ${name}, using S0 scale.`);
      }

      // S1 Planet Orbit Semi-Major Axis
      if (newRelativeOrbitRadii[name]) {
        s1_params[name].orbitA = newRelativeOrbitRadii[name] * currentSunDisplayRadiusForS1Calculation;
      } else {
        s1_params[name].orbitA = s0_params[name]?.orbitA || 0; // Fallback to S0
        console.warn(`Missing data for S1 orbit radius for ${name}, using S0 orbit.`);
      }
      // Preserve other orbital elements from S0 for S1 orbits
      s1_params[name].e = s0p_orbit?.e;
      s1_params[name].i = s0p_orbit?.i;
      s1_params[name].node = s0p_orbit?.node;
      s1_params[name].peri = s0p_orbit?.peri;

      // --- S1 for Moon (if current planet is Earth) ---
      if (name === 'earth') {
        if (!s1_params.moon) s1_params.moon = {};
        
        // S1 Moon Mesh Scale Factor
        if (newRelativeDiameters.moon && planetBaseSizes.moon) {
          const newTargetMoonRadiusS1 = newRelativeDiameters.moon * currentSunDisplayRadiusForS1Calculation;
          s1_params.moon.meshScaleFactor = newTargetMoonRadiusS1 / planetBaseSizes.moon;
        } else {
          s1_params.moon.meshScaleFactor = s0_params.moon?.meshScaleFactor || 1.0; // Fallback
          console.warn("Missing data for S1 Moon mesh scale, using S0 scale.");
        }

        // S1 Moon Orbit Radius around Earth
        // Original logic: 0.42 * currentSunDisplayRadius (which is currentSunDisplayRadiusForS1Calculation here)
        s1_params.moon.orbitA_around_earth = 0.42 * currentSunDisplayRadiusForS1Calculation;
      }
    });

    console.log("S1 params defined:", JSON.parse(JSON.stringify(s1_params)));

    // 3. Apply the S1 state and update slider
    applyInterpolatedScale(1.0);
    if (interpolationScaleSlider) {
        interpolationScaleSlider.value = "1";
    }
    // interpolationScaleValue is updated by applyInterpolatedScale

    // Old camera adjustment logic removed for now. 
    // Camera will adjust based on tracked object's currentVisualScaleFactor.
  });
}
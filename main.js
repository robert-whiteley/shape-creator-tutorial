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
    console.log("Scale Planets button clicked, now including Pluto & Moon scaling.");

    // --- Capture initial state for camera scaling ---
    const sunPlanetGroupForInit = getSunMesh(); 
    let initialSunVisualRadiusForCameraScaling = 1.0; 
    if (sunPlanetGroupForInit && sunPlanetGroupForInit.children[0] && sunPlanetGroupForInit.children[0].children[0]) {
        const sunFillMeshForInit = sunPlanetGroupForInit.children[0].children[0];
        initialSunVisualRadiusForCameraScaling = sunFillMeshForInit.geometry.parameters.radius * sunFillMeshForInit.scale.x;
    }
    if (initialSunVisualRadiusForCameraScaling === 0) {
        initialSunVisualRadiusForCameraScaling = 1.0; 
    }
    let oldEarthOrbitRadius = -1;
    const earthGroupForScaling = shapes.find(s => s.userData && s.userData.name === 'earth');
    if (earthGroupForScaling) {
        const earthOrbitParams = planetOrbitData.get(earthGroupForScaling);
        if (earthOrbitParams && typeof earthOrbitParams.a === 'number') {
            oldEarthOrbitRadius = earthOrbitParams.a;
        }
    }

    const newRelativeDiameters = {
      sun: 1.0, mercury: 0.20, venus: 0.25, earth: 0.28, mars: 0.22,
      jupiter: 0.40, saturn: 0.38, uranus: 0.32, neptune: 0.32,
      pluto: 0.10, moon: 0.08, // Added Pluto and Moon
    };
    const newRelativeOrbitRadii = { // Orbits around Sun, relative to currentSunDisplayRadius as 1 unit
      mercury: 2.0, venus: 3.0, earth: 4.0, mars: 5.0,
      jupiter: 7.0, saturn: 9.0, uranus: 11.0, neptune: 13.0,
      pluto: 15.0, // Added Pluto
    };

    const sunPlanetGroup = getSunMesh(); 
    if (!sunPlanetGroup || !sunPlanetGroup.children[0] || !sunPlanetGroup.children[0].children[0]) {
        console.error("Sun mesh structure not found as expected."); return;
    }
    const sunFillMesh = sunPlanetGroup.children[0].children[0]; 
    const sunOriginalBaseRadius = sunBaseSize; 
    const currentSunScaleFactorBeforeButton = sunFillMesh.scale.x; 
    const currentSunDisplayRadius = sunOriginalBaseRadius * currentSunScaleFactorBeforeButton; 
    if (currentSunDisplayRadius === 0) {
        console.error("currentSunDisplayRadius is 0, cannot proceed."); return;
    }

    shapes.forEach(planetGroup => {
      const planetName = planetGroup.userData ? planetGroup.userData.name : null;
      // Moon is handled specially within Earth's case, so skip main processing for 'moon' here
      if (!planetName || (!newRelativeDiameters[planetName] && planetName !== 'earth') || planetName === 'moon') { 
          if (planetName === 'moon') {
            // console.log("Skipping Moon in main loop, handled with Earth.");
          } else if (!newRelativeDiameters[planetName]) {
            // console.log(`Skipping ${planetName || 'Unknown Planet'} as it's not in newRelativeDiameters for direct scaling.`);
          }
          return; 
      }

      let planetFillMeshToScale;
      const originalPlanetBaseRadius = planetBaseSizes[planetName];
      if (typeof originalPlanetBaseRadius !== 'number') { 
          console.warn(`Original base radius for ${planetName} not found or invalid. Skipping size update.`);
          return; 
      }
      
      if (planetName === 'earth') {
        const earthMoonData = moonOrbitData.get(planetGroup); // planetGroup for Earth is earthSystemGroup
        if (earthMoonData && earthMoonData.earthSpinner && earthMoonData.earthSpinner.children[0]) {
          planetFillMeshToScale = earthMoonData.earthSpinner.children[0]; // Earth's mesh
        } else { console.error('Earth mesh structure not found for scaling.'); return; }
      } else if (planetName === 'sun') {
        planetFillMeshToScale = sunFillMesh; 
      } else { // Other planets (Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto)
        if (planetGroup.children[0] && planetGroup.children[0].children[0]) {
          planetFillMeshToScale = planetGroup.children[0].children[0];
        } else { console.error(`Mesh structure for ${planetName} not found as expected.`); return; }
      }
      
      const newTargetPlanetRadius = newRelativeDiameters[planetName] * currentSunDisplayRadius;
      const newPlanetScaleFactor = (originalPlanetBaseRadius !== 0) ? (newTargetPlanetRadius / originalPlanetBaseRadius) : (newRelativeDiameters[planetName] === 0 ? 0 : 1);
      
      if (planetFillMeshToScale) {
        planetFillMeshToScale.scale.set(newPlanetScaleFactor, newPlanetScaleFactor, newPlanetScaleFactor);
        console.log(`Scaled ${planetName} by ${newPlanetScaleFactor.toFixed(3)}`);
      }

      // Orbit around Sun (for planets including Pluto)
      if (planetName !== 'sun' && newRelativeOrbitRadii[planetName]) {
        const orbitParams = planetOrbitData.get(planetGroup);
        if (orbitParams) {
          const newTargetOrbitSemiMajorAxis = newRelativeOrbitRadii[planetName] * currentSunDisplayRadius;
          orbitParams.a = newTargetOrbitSemiMajorAxis;
          if (orbitParams.orbitLineMesh) {
            solarSystemGroup.remove(orbitParams.orbitLineMesh);
            if (orbitParams.orbitLineMesh.geometry) orbitParams.orbitLineMesh.geometry.dispose();
            if (orbitParams.orbitLineMesh.material) orbitParams.orbitLineMesh.material.dispose();
          }
          const e = orbitParams.e !== undefined ? orbitParams.e : 0;
          const i = orbitParams.i !== undefined ? orbitParams.i : 0;
          const node = orbitParams.node !== undefined ? orbitParams.node : 0;
          const peri = orbitParams.peri !== undefined ? orbitParams.peri : 0;
          const newOrbitLine = createOrbitLine(orbitParams.a, e, i, node, peri, 128, 0xffffff, 0.2);
          orbitParams.orbitLineMesh = newOrbitLine;
          solarSystemGroup.add(newOrbitLine);
          console.log(`Rescaled orbit for ${planetName} to a: ${newTargetOrbitSemiMajorAxis.toFixed(2)}`);
        } 
      }

      // --- Special handling for Moon if current planet is Earth ---
      if (planetName === 'earth') {
        const earthDataForMoon = moonOrbitData.get(planetGroup); // planetGroup is earthSystemGroup
        if (earthDataForMoon && earthDataForMoon.moon && earthDataForMoon.pivot && earthDataForMoon.orbitLine) {
          const moonMesh = earthDataForMoon.moon;
          const moonPivot = earthDataForMoon.pivot;
          const oldMoonOrbitLine = earthDataForMoon.orbitLine;
          
          // 1. Scale Moon size
          const moonOriginalBaseRadius = planetBaseSizes['moon'];
          if (typeof moonOriginalBaseRadius === 'number' && newRelativeDiameters['moon']) {
            const newTargetMoonRadius = newRelativeDiameters['moon'] * currentSunDisplayRadius;
            const newMoonScaleFactor = (moonOriginalBaseRadius !== 0) ? (newTargetMoonRadius / moonOriginalBaseRadius) : (newRelativeDiameters['moon'] === 0 ? 0 : 1);
            moonMesh.scale.set(newMoonScaleFactor, newMoonScaleFactor, newMoonScaleFactor);
            console.log(`Scaled Moon by ${newMoonScaleFactor.toFixed(3)}`);
          } else {
            console.warn("Could not scale Moon: missing base radius or relative diameter for Moon.");
          }

          // 2. Scale Moon orbit around Earth
          const newMoonOrbitRadiusAroundEarth = 0.42 * currentSunDisplayRadius; // 1.5 * Earth's new diameter (0.28 * currentSunDisplayRadius)
          moonPivot.position.x = newMoonOrbitRadiusAroundEarth; // Assuming x is the distance component for moonPivot
          earthDataForMoon.initialMoonDistance = newMoonOrbitRadiusAroundEarth; // Update for consistency if used elsewhere
          
          // 3. Redraw Moon's orbit line
          planetGroup.remove(oldMoonOrbitLine); // Orbit line is child of Earth's group
          if (oldMoonOrbitLine.geometry) oldMoonOrbitLine.geometry.dispose();
          if (oldMoonOrbitLine.material) oldMoonOrbitLine.material.dispose();
          
          const newMoonLine = createOrbitLine(newMoonOrbitRadiusAroundEarth, 0, 0, 0, 0, 64, 0x888888, 0.3);
          planetGroup.add(newMoonLine);
          earthDataForMoon.orbitLine = newMoonLine; // Update the reference
          console.log(`Rescaled Moon orbit around Earth to radius: ${newMoonOrbitRadiusAroundEarth.toFixed(2)}`);
        } else {
          console.warn("Could not find all necessary Moon data/objects when scaling Earth.");
        }
      }
    });
    console.log("Planet, Pluto, and Moon scaling and orbit adjustments finished.");

    // --- Adjust camera position ---
    const RELATIVE_VIEW_DISTANCE_MULTIPLIER = 2.5; 
    const cam = getCamera();
    const trackedInfo = cameraController.getTrackedBodyInfo();
    if (trackedInfo && trackedInfo.mesh && cam && trackedInfo.worldOrientedNormalizedViewDir) {
        const bodyName = trackedInfo.mesh.userData ? trackedInfo.mesh.userData.name : null;
        if (!bodyName) { return; }
        const isMoon = bodyName === 'moon';
        let actualFillMeshOfTrackedBody;
        if (bodyName === 'sun') { actualFillMeshOfTrackedBody = getSunMesh()?.children[0]?.children[0]; }
        else if (isMoon) { actualFillMeshOfTrackedBody = trackedInfo.mesh; }
        else {
            const pg = shapes.find(s => s.userData && s.userData.name === bodyName);
            if (pg) {
                if (bodyName === 'earth') { actualFillMeshOfTrackedBody = moonOrbitData.get(pg)?.earthSpinner?.children[0]; }
                else { actualFillMeshOfTrackedBody = pg.children[0]?.children[0]; }
            }
        }
        if (actualFillMeshOfTrackedBody && actualFillMeshOfTrackedBody.geometry && actualFillMeshOfTrackedBody.geometry.parameters) {
            const newActualVisualRadius = actualFillMeshOfTrackedBody.geometry.parameters.radius * actualFillMeshOfTrackedBody.scale.x;
            trackedInfo.baseSize = newActualVisualRadius; 
            const trackedBodyWorldPosition = new THREE.Vector3();
            actualFillMeshOfTrackedBody.getWorldPosition(trackedBodyWorldPosition);
            const globalScaleSliderValue = parseInt(scaleSlider.value) || 1;
            const effectiveSizeForOffset = newActualVisualRadius * globalScaleSliderValue; 
            const newOffsetDistance = effectiveSizeForOffset * RELATIVE_VIEW_DISTANCE_MULTIPLIER;
            const cameraDirection = trackedInfo.worldOrientedNormalizedViewDir.clone(); 
            const desiredCameraWorldPos = new THREE.Vector3().copy(trackedBodyWorldPosition).addScaledVector(cameraDirection, newOffsetDistance);
            if (cam.parent) { cam.parent.worldToLocal(cam.position.copy(desiredCameraWorldPos)); }
            else { cam.position.copy(desiredCameraWorldPos); }
            cam.updateMatrixWorld(true);
            cam.lookAt(trackedBodyWorldPosition);
        } 
    } else if (cam) { 
        let viewScaleFactor = 1.0;
        if (earthGroupForScaling && typeof oldEarthOrbitRadius === 'number' && oldEarthOrbitRadius > 0.0001) { 
            const newEarthOrbitParams = planetOrbitData.get(earthGroupForScaling);
            if (newEarthOrbitParams && typeof newEarthOrbitParams.a === 'number') {
                const newEarthOrbitRadius = newEarthOrbitParams.a;
                viewScaleFactor = newEarthOrbitRadius / oldEarthOrbitRadius;
            } else {
                 viewScaleFactor = currentSunDisplayRadius / initialSunVisualRadiusForCameraScaling; 
            }
        } else {
            viewScaleFactor = currentSunDisplayRadius / initialSunVisualRadiusForCameraScaling; 
        }
        if (isFinite(viewScaleFactor) && viewScaleFactor > 0.0001 && Math.abs(viewScaleFactor - 1.0) > 0.0001) { 
            yawObject.position.multiplyScalar(viewScaleFactor);
        }
    }
  });
} else {
  console.error("Scale Planets button not found in the DOM.");
}
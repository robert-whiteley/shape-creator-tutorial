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
let shapeCreationCooldown = 1000;
let solarSystemGroup = new THREE.Group();
let lastTwoHandDistance = null;
let lastSolarSystemScale = 1;
let livePreviousPinchDistance = null;
let speedMultiplier = 1;
let lastPanPosition = null;
let lastCameraOffsetDirection = null;
let initialCameraDistanceToGroup = null;
let lastAnimationTime = Date.now();
let speedSlider = document.getElementById('speed-slider');
let speedValue = document.getElementById('speed-value');
let scaleSlider = document.getElementById('scale-slider');
let scaleValue = document.getElementById('scale-value');
let planetBaseSizes = {};
let sunBaseSize = null;

let followedObject = null; // The 3D object mesh the camera is currently following
let worldOffsetToFollowTarget = new THREE.Vector3(); // Desired world-space offset from target to camera

// --- Camera Animation State ---
let isCameraAnimating = false;
let animationStartTime = 0;
const ANIMATION_DURATION = 1500; // Fly-to duration in milliseconds (e.g., 1.5 seconds)
let cameraAnimationStartPos = new THREE.Vector3();
let cameraAnimationEndPos = new THREE.Vector3();
let cameraAnimationStartLookAt = new THREE.Vector3();
let cameraAnimationEndLookAt = new THREE.Vector3();
let targetObjectForAnimation = null; // Stores the mesh to be followed after animation

// --- UI Update for Bodies List ---
const bodiesListUl = document.getElementById('bodies-list');

export function updateBodiesList() {
  if (!bodiesListUl) return;
  bodiesListUl.innerHTML = ''; // Clear existing items

  // --- Sun ---
  const sunLi = document.createElement('li');
  const sunSpan = document.createElement('span'); // Create a span for the text
  sunSpan.textContent = 'Sun';
  sunSpan.style.cursor = 'pointer'; // Indicate clickable
  sunSpan.addEventListener('click', () => { // Attach listener to span
    handleBodyClick('sun');
  });
  sunLi.appendChild(sunSpan); // Add span to li
  bodiesListUl.appendChild(sunLi);

  const planetsUl = document.createElement('ul');
  sunLi.appendChild(planetsUl);

  planetData.forEach(planetEntry => {
    const planetNameLower = planetEntry.name.toLowerCase();
    if (planetNameLower === 'sun') return;

    const planetDisplayName = planetNameLower.charAt(0).toUpperCase() + planetNameLower.slice(1);
    const planetLi = document.createElement('li');
    const planetSpan = document.createElement('span'); // Create a span for the text
    planetSpan.textContent = planetDisplayName;
    planetSpan.style.cursor = 'pointer'; // Indicate clickable
    planetSpan.dataset.bodyName = planetNameLower; // Keep data attribute if needed, though less critical on span
    planetSpan.addEventListener('click', () => { // Attach listener to span
      handleBodyClick(planetNameLower);
    });
    planetLi.appendChild(planetSpan); // Add span to li
    planetsUl.appendChild(planetLi);

    if (planetNameLower === 'earth') {
      const moonsUl = document.createElement('ul');
      planetLi.appendChild(moonsUl);

      const moonLi = document.createElement('li');
      const moonSpan = document.createElement('span'); // Create a span for the text
      moonSpan.textContent = 'Moon';
      moonSpan.style.cursor = 'pointer'; // Indicate clickable
      moonSpan.addEventListener('click', () => { // Attach listener to span
        handleBodyClick('moon');
      });
      moonLi.appendChild(moonSpan); // Add span to li
      moonsUl.appendChild(moonLi);
    }
  });
}

function handleBodyClick(bodyNameKey) {
  const camera = getCamera();
  let targetObjectMesh = null;
  const targetBodyWorldPosition = new THREE.Vector3(); // World position of the body itself
  let specificBaseSize = 1;

  // Cancel any ongoing follow or animation before starting a new one
  followedObject = null;
  isCameraAnimating = false;
  targetObjectForAnimation = null;

  if (bodyNameKey === 'sun') {
    targetObjectMesh = getSunMesh();
    if (targetObjectMesh && typeof sunBaseSize === 'number') {
        specificBaseSize = sunBaseSize;
    }
  } else if (bodyNameKey === 'moon') {
    const earthShapeGroup = shapes.find(s => s.userData && s.userData.name === 'earth');
    if (earthShapeGroup && moonOrbitData.has(earthShapeGroup)) {
      const { moon } = moonOrbitData.get(earthShapeGroup);
      if (moon && moon.userData && moon.userData.name === 'moon') {
        targetObjectMesh = moon;
        if (planetBaseSizes['earth']) {
          specificBaseSize = (planetBaseSizes['earth'] || 1) * 0.273;
        } else {
          // Fallback if earth's base size isn't found (e.g. before full init)
          // Use a generic moon size relative to a default planet size
          const defaultPlanetSize = 0.5; // A typical base size for planets if not specified
          const moonToPlanetRatio = 0.273; // Moon is ~27.3% size of Earth
          specificBaseSize = defaultPlanetSize * moonToPlanetRatio;
        }
      }
    }
  } else { // It's a planet
    const shapeGroup = shapes.find(s => s.userData && s.userData.name === bodyNameKey);
    if (shapeGroup && shapeGroup.children[0]) {
      targetObjectMesh = shapeGroup.children[0];
      if (planetBaseSizes[bodyNameKey]) {
        specificBaseSize = planetBaseSizes[bodyNameKey];
      } else {
        const planetEntry = planetData.find(p => p.name === bodyNameKey);
        if (planetEntry) {
            specificBaseSize = planetEntry.size;
        } else {
            specificBaseSize = 0.5; // Default if not found
        }
      }
    }
  }

  if (targetObjectMesh) {
    targetObjectMesh.getWorldPosition(targetBodyWorldPosition);

    // Get the current scale from the slider
    const currentScale = parseInt(scaleSlider.value) || 1;
    const visualActualSize = specificBaseSize * currentScale;

    // Define a multiplier for how far the camera should be, relative to the visual size.
    // e.g., 4.0 means the camera is positioned at a distance roughly 4x the object's visual radius/diameter.
    const RELATIVE_VIEW_DISTANCE_MULTIPLIER = 4.0; 

    const offsetDistance = visualActualSize * RELATIVE_VIEW_DISTANCE_MULTIPLIER;
    
    const cameraOffsetDirection = new THREE.Vector3(0, 0.75, 1);
    cameraOffsetDirection.normalize();
    cameraOffsetDirection.multiplyScalar(offsetDistance);
    const solarSystemWorldQuaternion = solarSystemGroup.getWorldQuaternion(new THREE.Quaternion());
    cameraOffsetDirection.applyQuaternion(solarSystemWorldQuaternion);
    cameraAnimationEndPos.copy(targetBodyWorldPosition).add(cameraOffsetDirection);

    // Set up animation parameters
    cameraAnimationStartPos.copy(camera.position); // Current camera position is the start
    
    // Current lookAt point (approximated)
    const tempLookAt = new THREE.Vector3();
    camera.getWorldDirection(tempLookAt).multiplyScalar(10).add(camera.position); // Point 10 units in front of camera
    cameraAnimationStartLookAt.copy(tempLookAt); 

    cameraAnimationEndLookAt.copy(targetBodyWorldPosition); // Final lookAt is the target body center

    targetObjectForAnimation = targetObjectMesh; // Store for follow-up after animation
    isCameraAnimating = true;
    animationStartTime = Date.now();

  } else {
    // No target found, ensure animation state is reset (already done at the top)
  }
}

// New rotation state variables for two-hand gestures
let gestureInitialQuaternion = null;
let gestureInitialTwoHandAngle = null;
let gestureInitialTwoHandMidY = null;
let gestureInitialTwoHandMidX = null;

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
      isCameraAnimating = false; // Gesture started, cancel fly-to animation
      followedObject = null;      // Also stop any following
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
        const camera = getCamera(); // Get camera instance

        // 1. Calculate total deltas from gesture start
        const totalDeltaAngleY = angle - gestureInitialTwoHandAngle;
        const totalDeltaMidY = midY - gestureInitialTwoHandMidY;
        const totalDeltaMidX = midX - gestureInitialTwoHandMidX;

        // 2. Start with the initial orientation of the solar system group
        let newQuaternion = gestureInitialQuaternion.clone();

        // 3. Apply Y-axis rotation (world Y - for twisting hands)
        // Original effect: solarSystemGroup.rotation.y = lastSolarSystemRotationY + deltaAngle;
        // The 'deltaAngle' was (angle - lastTwoHandAngle).
        // Positive totalDeltaAngleY (hands rotate counter-clockwise from above) should rotate scene CCW.
        // However, the original was `+ deltaAngle` where `deltaAngle` was current - previous.
        // Let's keep it direct: positive totalDeltaAngleY rotates positively around world Y.
        const rotY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), totalDeltaAngleY);
        // Apply world Y rotation first to the initial state.
        // To match typical screen-based rotation where rotating hands right (CW) spins object right (CW from top view):
        // If totalDeltaAngleY is positive for CCW hand rotation, use -totalDeltaAngleY for CW scene rotation.
        // However, the original was `+ deltaAngle` where `deltaAngle` was current - previous.
        // Let's keep it direct: positive totalDeltaAngleY rotates positively around world Y.
        newQuaternion.premultiply(rotY);


        // 4. Apply X-axis rotation (camera's right vector - for lifting plate)
        // Original effect: solarSystemGroup.rotation.x = lastSolarSystemRotationX - deltaMidY * 4.0;
        // Negative totalDeltaMidY (hands move up) should lift the plate up (rotate scene "backwards" over X).
        const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0); // Camera's local X axis in world space
        const rotationAmountX = -totalDeltaMidY * 4.0; // Negative deltaMidY for upward motion = positive rotation around cameraRight
        const rotX = new THREE.Quaternion().setFromAxisAngle(cameraRight, rotationAmountX);
        newQuaternion.premultiply(rotX); // Apply camera-relative X rotation after world Y

        // 5. Apply Z-axis rotation (solar system's local Z - for side-to-side hand movement translating to roll)
        // Original effect: solarSystemGroup.rotation.z = lastSolarSystemRotationZ - deltaMidX * 4.0;
        // Negative totalDeltaMidX (hands move left) should roll scene "left" (positive rotation around local Z).
        const rotationAmountZ = -totalDeltaMidX * 4.0;
        const rotZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rotationAmountZ); // Axis (0,0,1) is local to the current quaternion state
        newQuaternion.multiply(rotZ); // Multiply to apply in local space (after Y and X)
        
        solarSystemGroup.quaternion.copy(newQuaternion);

        // Continuous gesture: Camera Dolly (New Zoom Logic)
        if (livePreviousPinchDistance !== null) {
          const pinchDiff = distance - livePreviousPinchDistance;
          
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
        isCameraAnimating = false; // Gesture started, cancel fly-to animation
        followedObject = null;      // Also stop any following
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

  const camera = getCamera();
  const tempWorldPos = new THREE.Vector3(); // For reuse
  const tempLookAt = new THREE.Vector3(); // For reuse

  if (isCameraAnimating) {
    const elapsed = Date.now() - animationStartTime;
    let progress = Math.min(elapsed / ANIMATION_DURATION, 1.0);
    
    // Simple ease-out: progress = 1 - Math.pow(1 - progress, 3); // Optional easing
    // Smoother step (ease-in-out):
    progress = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    camera.position.lerpVectors(cameraAnimationStartPos, cameraAnimationEndPos, progress);
    tempLookAt.lerpVectors(cameraAnimationStartLookAt, cameraAnimationEndLookAt, progress);
    camera.lookAt(tempLookAt);

    if (progress === 1.0) {
      isCameraAnimating = false;
      if (targetObjectForAnimation) {
        followedObject = targetObjectForAnimation;
        targetObjectForAnimation = null;
        // Update worldOffsetToFollowTarget based on the final animated position
        // Ensure camera.position is exactly cameraAnimationEndPos before calculating this offset
        camera.position.copy(cameraAnimationEndPos); // Ensure exact end position
        followedObject.getWorldPosition(tempWorldPos);
        worldOffsetToFollowTarget.subVectors(camera.position, tempWorldPos);
      } 
    }
  } else if (followedObject) {
    // Camera following logic (runs if not animating and there's a followed object)
    followedObject.getWorldPosition(tempWorldPos);
    camera.position.copy(tempWorldPos).add(worldOffsetToFollowTarget);
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
  animateCallback: animate // pass the animation loop
});

updateBodiesList(); // Initial call after planets are created

animate();

initCamera({
  video,
  canvas,
  hands,
  // onFrame is not needed because hands is provided and will be called automatically
});
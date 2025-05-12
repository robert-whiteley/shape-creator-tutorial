import { initThree, getRenderer, getScene, getCamera } from './three/scene.js';
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
const shapeCreationCooldown = 1000;
let solarSystemGroup = new THREE.Group();
let lastTwoHandAngle = null;
let lastSolarSystemRotationY = 0;
let lastTwoHandDistance = null;
let lastSolarSystemScale = 1;
let lastTwoHandMidY = null;
let lastSolarSystemRotationX = 0;
let lastTwoHandMidX = null;
let lastSolarSystemRotationZ = 0;
let speedMultiplier = 1;
const speedSlider = document.getElementById('speed-slider');
const speedValue = document.getElementById('speed-value');
let lastAnimationTime = Date.now();

const neonColors = [0xFF00FF, 0x00FFFF, 0xFF3300, 0x39FF14, 0xFF0099, 0x00FF00, 0xFF6600, 0xFFFF00];
let colorIndex = 0;

const getNextNeonColor = () => {
    const color = neonColors[colorIndex];
    colorIndex = (colorIndex + 1) % neonColors.length;
    return color;
};

const get3DCoords = (normX, normY) => {
  const x = (normX - 0.5) * 10;
  const y = (0.5 - normY) * 10;
  return new THREE.Vector3(x, y, 0);
};

const isPinch = (landmarks) => {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  return d(landmarks[4], landmarks[8]) < 0.06;
};

const areIndexFingersClose = (l, r) => {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  return d(l[8], r[8]) < 0.12;
};

const findNearestShape = (position) => {
  let minDist = Infinity;
  let closest = null;
  shapes.forEach(shape => {
    const dist = shape.position.distanceTo(position);
    if (dist < 1.5 && dist < minDist) {
      minDist = dist;
      closest = shape;
    }
  });
  return closest;
};

const isInRecycleBinZone = (position) => {
  const vector = position.clone().project(camera);
  const screenX = ((vector.x + 1) / 2) * window.innerWidth;
  const screenY = ((-vector.y + 1) / 2) * window.innerHeight;

  const binWidth = 160;
  const binHeight = 160;
  const binLeft = window.innerWidth - 60 - binWidth;
  const binTop = window.innerHeight - 60 - binHeight;
  const binRight = binLeft + binWidth;
  const binBottom = binTop + binHeight;

  const adjustedX = window.innerWidth - screenX;

  return adjustedX >= binLeft && adjustedX <= binRight && screenY >= binTop && screenY <= binBottom;
};

const hands = new Hands({ locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });

hands.onResults(results => {
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

  // Two-hand pinch for rotation (Y, X, Z) and scaling
  if (results.multiHandLandmarks.length === 2) {
    const [l, r] = results.multiHandLandmarks;
    const leftPinch = isPinch(l);
    const rightPinch = isPinch(r);
    if (leftPinch && rightPinch) {
      // Calculate angle between the two index fingers
      const dx = r[8].x - l[8].x;
      const dy = r[8].y - l[8].y;
      const angle = Math.atan2(dy, dx);
      const distance = Math.hypot(dx, dy);
      const midY = (l[8].y + r[8].y) / 2;
      const midX = (l[8].x + r[8].x) / 2;
      if (lastTwoHandAngle === null || lastTwoHandDistance === null || lastTwoHandMidY === null || lastTwoHandMidX === null) {
        lastTwoHandAngle = angle;
        lastSolarSystemRotationY = solarSystemGroup.rotation.y;
        lastTwoHandDistance = distance;
        lastSolarSystemScale = solarSystemGroup.scale.x;
        lastTwoHandMidY = midY;
        lastSolarSystemRotationX = solarSystemGroup.rotation.x;
        lastTwoHandMidX = midX;
        lastSolarSystemRotationZ = solarSystemGroup.rotation.z;
      } else {
        // Rotation Y
        const deltaAngle = angle - lastTwoHandAngle;
        solarSystemGroup.rotation.y = lastSolarSystemRotationY - deltaAngle;
        // Rotation X (up/down)
        const deltaMidY = midY - lastTwoHandMidY;
        solarSystemGroup.rotation.x = lastSolarSystemRotationX + deltaMidY * 4.0; // Sensitivity
        // Rotation Z (sideways)
        const deltaMidX = midX - lastTwoHandMidX;
        solarSystemGroup.rotation.z = lastSolarSystemRotationZ + deltaMidX * 4.0; // Sensitivity
        // Scaling
        const scale = Math.max(0.2, Math.min(3, lastSolarSystemScale * (distance / lastTwoHandDistance)));
        solarSystemGroup.scale.set(scale, scale, scale);
      }
      return;
    }
  }
  lastTwoHandAngle = null;
  lastTwoHandDistance = null;
  lastTwoHandMidY = null;
  lastTwoHandMidX = null;
  // One-hand pinch for panning
  if (results.multiHandLandmarks.length > 0) {
    for (const landmarks of results.multiHandLandmarks) {
      if (isPinch(landmarks)) {
        const indexTip = landmarks[8];
        const position = get3DCoords(indexTip.x, indexTip.y);
        solarSystemGroup.position.copy(position);
        break;
      }
    }
  }
});

const initCamera = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
  video.srcObject = stream;
  await new Promise(resolve => video.onloadedmetadata = resolve);
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  new Camera(video, {
    onFrame: async () => await hands.send({ image: video }),
    width: video.videoWidth,
    height: video.videoHeight
  }).start();
};

if (speedSlider && speedValue) {
  const REALTIME_SPEED = 0.0000116;
  function updateSpeedDisplay() {
    const val = parseFloat(speedSlider.value);
    if (Math.abs(val - REALTIME_SPEED) < 1e-7) {
      speedValue.textContent = '1x realtime';
    } else {
      speedValue.textContent = (val / REALTIME_SPEED).toFixed(2) + 'x';
    }
  }
  speedSlider.addEventListener('input', () => {
    speedMultiplier = parseFloat(speedSlider.value);
    updateSpeedDisplay();
  });
  updateSpeedDisplay(); // Set initial display
}

const animate = () => {
  requestAnimationFrame(animate);
  const now = Date.now();
  const deltaDays = ((now - lastAnimationTime) / 1000) * speedMultiplier; // 1s = 1 Earth day
  lastAnimationTime = now;
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
      shape.rotation.y += (planetSpeeds[planetName]?.rotation || 0) * deltaDays;
    }
    // Animate moon orbit if this is an earth with a moon
    if (moonOrbitData.has(shape)) {
      const { pivot } = moonOrbitData.get(shape);
      // Moon's orbital period: 27.32 days
      pivot.rotation.y += (2 * Math.PI / 27.32) * deltaDays;
    }
    // Animate planet orbit if it has a pivot (not the sun)
    if (planetOrbitData.has(shape)) {
      const pivot = planetOrbitData.get(shape);
      pivot.rotation.y += (planetSpeeds[planetName]?.orbit || 0) * deltaDays;
    }
  });
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
  animateCallback: animate // pass the animation loop
});
initCamera();
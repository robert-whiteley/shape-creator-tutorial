let video = document.getElementById('webcam');
let canvas = document.getElementById('canvas');
let ctx = canvas.getContext('2d');
let scene, camera, renderer;
let shapes = [];
let currentShape = null;
let isPinching = false;
let shapeScale = 1;
let originalDistance = null;
let selectedShape = null;
let shapeCreatedThisPinch = false;
let lastShapeCreationTime = 0;
const shapeCreationCooldown = 1000;
const moonOrbitData = new Map(); // Map from earth group to {pivot, moon}
let solarSystemGroup = null;
let lastTwoHandAngle = null;
let lastSolarSystemRotationY = 0;

const planetData = [
  { name: 'sun', texture: 'textures/sun.jpg', size: 1.2 * 0.8 },
  { name: 'mercury', texture: 'textures/mercury.jpg', size: 0.25 * 0.8 },
  { name: 'venus', texture: 'textures/venus.jpg', size: 0.4 * 0.8 },
  { name: 'earth', texture: 'textures/earth.jpg', size: 0.5 * 0.8 },
  { name: 'mars', texture: 'textures/mars.jpg', size: 0.35 * 0.8 },
  { name: 'jupiter', texture: 'textures/jupiter.jpg', size: 0.9 * 0.8 },
  { name: 'saturn', texture: 'textures/saturn.jpg', size: 0.8 * 0.8 },
  { name: 'uranus', texture: 'textures/uranus.jpg', size: 0.6 * 0.8 },
  { name: 'neptune', texture: 'textures/neptune.jpg', size: 0.6 * 0.8 },
  { name: 'pluto', texture: 'textures/pluto.jpg', size: 0.18 * 0.8 }
];

function createPlanet({ texture, size, name }, position) {
  const geometry = new THREE.SphereGeometry(size, 32, 32);
  const group = new THREE.Group();
  const planetTexture = new THREE.TextureLoader().load(texture);
  const material = new THREE.MeshBasicMaterial({ map: planetTexture });
  const fillMesh = new THREE.Mesh(geometry, material);
  const wireframeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
  const wireframeMesh = new THREE.Mesh(geometry, wireframeMaterial);
  group.add(fillMesh);
  group.add(wireframeMesh);
  group.position.copy(position);
  scene.add(group);
  // If this is earth, add a moon
  if (name === 'earth') {
    const moonPivot = new THREE.Group();
    group.add(moonPivot);
    const moonGeometry = new THREE.SphereGeometry(0.18, 32, 32);
    const moonTexture = new THREE.TextureLoader().load('textures/moon.jpg');
    const moonMaterial = new THREE.MeshBasicMaterial({ map: moonTexture });
    const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
    moonMesh.position.set(0.8, 0, 0);
    moonPivot.add(moonMesh);
    moonOrbitData.set(group, { pivot: moonPivot, moon: moonMesh });
  }
  shapes.push(group);
  return group;
}

const initThree = () => {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 5;
  renderer = new THREE.WebGLRenderer({ alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById('three-canvas').appendChild(renderer.domElement);
  const light = new THREE.AmbientLight(0xffffff, 1);
  scene.add(light);
  // Create a group for the whole solar system
  solarSystemGroup = new THREE.Group();
  scene.add(solarSystemGroup);
  // Reverse the planet order so the sun is on the far right
  const reversedPlanets = [...planetData].reverse();
  const totalPlanets = reversedPlanets.length;
  const viewWidth = 8;
  const spacing = (viewWidth / (totalPlanets - 1)) * 1.3;
  const startX = -((spacing * (totalPlanets - 1)) / 2);
  reversedPlanets.forEach((planet, i) => {
    const planetGroup = createPlanet(planet, new THREE.Vector3(startX + i * spacing, 0, 0));
    solarSystemGroup.add(planetGroup);
  });
  animate();
};

const animate = () => {
  requestAnimationFrame(animate);
  shapes.forEach(shape => {
    if (shape !== selectedShape) {
      shape.rotation.y += 0.01;
    }
    // Animate moon orbit if this is an earth with a moon
    if (moonOrbitData.has(shape)) {
      const { pivot } = moonOrbitData.get(shape);
      pivot.rotation.y += 0.03; // Moon orbit speed
    }
  });
  renderer.render(scene, camera);
};

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
  const recycleBin = document.getElementById('recycle-bin');

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

  // Two-hand pinch for rotation
  if (results.multiHandLandmarks.length === 2) {
    const [l, r] = results.multiHandLandmarks;
    const leftPinch = isPinch(l);
    const rightPinch = isPinch(r);
    if (leftPinch && rightPinch) {
      // Calculate angle between the two index fingers
      const dx = r[8].x - l[8].x;
      const dy = r[8].y - l[8].y;
      const angle = Math.atan2(dy, dx);
      if (lastTwoHandAngle === null) {
        lastTwoHandAngle = angle;
        lastSolarSystemRotationY = solarSystemGroup.rotation.y;
      } else {
        const delta = angle - lastTwoHandAngle;
        solarSystemGroup.rotation.y = lastSolarSystemRotationY - delta;
      }
      return;
    }
  }
  lastTwoHandAngle = null;
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

initThree();
initCamera();
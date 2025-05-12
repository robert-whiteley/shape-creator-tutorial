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
  // Reverse the planet order so the sun is on the far right
  const reversedPlanets = [...planetData].reverse();
  // Calculate dynamic spacing based on window width and number of planets
  const totalPlanets = reversedPlanets.length;
  const viewWidth = 8; // World units to fit in camera view (adjust as needed)
  const spacing = (viewWidth / (totalPlanets - 1)) * 1.3;
  const startX = -((spacing * (totalPlanets - 1)) / 2);
  reversedPlanets.forEach((planet, i) => {
    createPlanet(planet, new THREE.Vector3(startX + i * spacing, 0, 0));
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

  // Existing shape interaction and gesture logic...
  if (results.multiHandLandmarks.length === 2) {
    const [l, r] = results.multiHandLandmarks;
    const leftPinch = isPinch(l);
    const rightPinch = isPinch(r);
    const indexesClose = areIndexFingersClose(l, r);

    if (leftPinch && rightPinch) {
      const left = l[8];
      const right = r[8];
      const centerX = (left.x + right.x) / 2;
      const centerY = (left.y + right.y) / 2;
      const distance = Math.hypot(left.x - right.x, left.y - right.y);

      if (!isPinching) {
        const now = Date.now();
        if (!shapeCreatedThisPinch && indexesClose && now - lastShapeCreationTime > shapeCreationCooldown) {
          currentShape = createRandomShape(get3DCoords(centerX, centerY));
          lastShapeCreationTime = now;
          shapeCreatedThisPinch = true;
          originalDistance = distance;
        }
      } else if (currentShape && originalDistance) {
        shapeScale = distance / originalDistance;
        currentShape.scale.set(shapeScale, shapeScale, shapeScale);
      }
      isPinching = true;
      recycleBin.classList.remove('active');
      return;
    }
  }

  isPinching = false;
  shapeCreatedThisPinch = false;
  originalDistance = null;
  currentShape = null;

  if (results.multiHandLandmarks.length > 0) {
    for (const landmarks of results.multiHandLandmarks) {
      const indexTip = landmarks[8];
      const position = get3DCoords(indexTip.x, indexTip.y);

      if (isPinch(landmarks)) {
        if (!selectedShape) {
          selectedShape = findNearestShape(position);
        }
        if (selectedShape) {
          selectedShape.position.copy(position);

          const inBin = isInRecycleBinZone(selectedShape.position);
          selectedShape.children.forEach(child => {
            if (child.material && child.material.wireframe) {
              child.material.color.set(inBin ? 0xff0000 : 0xffffff);
            }
          });
          if (inBin) {
            recycleBin.classList.add('active');
          } else {
            recycleBin.classList.remove('active');
          }
        }
      } else {
        if (selectedShape && isInRecycleBinZone(selectedShape.position)) {
          scene.remove(selectedShape);
          shapes = shapes.filter(s => s !== selectedShape);
        }
        selectedShape = null;
        recycleBin.classList.remove('active');
      }
    }
  } else {
    if (selectedShape && isInRecycleBinZone(selectedShape.position)) {
      scene.remove(selectedShape);
      shapes = shapes.filter(s => s !== selectedShape);
    }
    selectedShape = null;
    recycleBin.classList.remove('active');
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
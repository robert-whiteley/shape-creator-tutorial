// three/scene.js
// Handles Three.js scene, camera, renderer, and animation loop

// Assumes THREE is globally available or imported elsewhere

let scene, camera, renderer;
let lastAnimationTime = Date.now();
let starmapMesh = null;
let sunMesh = null;

export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getRenderer() { return renderer; }
export function getStarmapMesh() { return starmapMesh; }
export function getSunMesh() { return sunMesh; }

export function initThree({
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
  animateCallback
}) {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(5, 3, 5); // Set camera at an angle
  camera.lookAt(0, 0, 0); // Look at the center
  renderer = new THREE.WebGLRenderer({ alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  document.getElementById('three-canvas').appendChild(renderer.domElement);
  // Add lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambientLight);
  // Add a shadow-casting PointLight at the sun's position
  const sunLight = new THREE.PointLight(0xffffff, 1.2, 100);
  sunLight.position.set(0, 0, 0); // Sun is at the origin
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  sunLight.shadow.bias = -0.005;
  scene.add(sunLight);
  // Add a firey sun mesh at the center (not affected by lighting)
  const sunGeometry = new THREE.SphereGeometry(1.2 * 0.8, 32, 32);
  const sunTexture = new THREE.TextureLoader().load('textures/sun.jpg');
  const sunMaterial = new THREE.MeshBasicMaterial({ map: sunTexture });
  // For extra glow, add emissive color (if using MeshStandardMaterial, but MeshBasicMaterial is always emissive)
  sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
  sunMesh.position.set(0, 0, 0);
  sunMesh.castShadow = false;
  sunMesh.receiveShadow = false;
  solarSystemGroup.add(sunMesh);
  // Add solar system group
  scene.add(solarSystemGroup);
  // Add planets and orbits
  const reversedPlanets = [...planetData].reverse();
  const totalPlanets = reversedPlanets.length;
  const viewWidth = 8;
  const spacing = (viewWidth / (totalPlanets - 1)) * 1.3;
  const startX = -((spacing * (totalPlanets - 1)) / 2);
  const days = daysSinceJ2000();
  reversedPlanets.forEach((planet, i) => {
    if (planet.name === 'sun') {
      // The sun is only a light, not a mesh
      return;
    }
    const pos = new THREE.Vector3(startX + i * spacing, 0, 0);
    const planetGroup = createPlanet(planet, pos.clone(), shapes);
    if (!planetGroup) return;
    const pivot = new THREE.Group();
    pivot.position.set(0, 0, 0);
    planetGroup.position.copy(pos.clone().sub(new THREE.Vector3(startX + (totalPlanets-1) * spacing, 0, 0)));
    pivot.add(planetGroup);
    const period = planetPhysicalData[planet.name]?.orbit;
    if (period && period > 0) {
      const fraction = (days / period) % 1;
      pivot.rotation.y = fraction * 2 * Math.PI;
    }
    solarSystemGroup.add(pivot);
    planetOrbitData.set(planetGroup, pivot);
    const orbitRadius = planetGroup.position.length();
    const orbitLine = createOrbitLine(orbitRadius, 128, 0xffffff, 0.2);
    solarSystemGroup.add(orbitLine);
  });
  // Add starmap sphere (background)
  const starmapGeometry = new THREE.SphereGeometry(500, 64, 64);
  const starmapTexture = new THREE.TextureLoader().load('textures/starmap.jpg');
  const starmapMaterial = new THREE.MeshBasicMaterial({
    map: starmapTexture,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.5 // Slightly translucent
  });
  starmapMesh = new THREE.Mesh(starmapGeometry, starmapMaterial);
  starmapMesh.renderOrder = -1; // Render behind everything
  solarSystemGroup.add(starmapMesh);
  animateCallback();
}

// The animation loop should be handled in main.js or another module, as it depends on more than just scene/camera/renderer. 
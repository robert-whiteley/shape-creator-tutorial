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
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 25000);
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
  const sunLight = new THREE.PointLight(0xffffff, 1.2, 0); // Set range to 0 for infinite
  sunLight.position.set(0, 0, 0); // Sun is at the origin
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024; // Consider increasing for better shadow quality if needed
  sunLight.shadow.mapSize.height = 1024; // Consider increasing for better shadow quality if needed
  sunLight.shadow.camera.near = 1; // Adjusted for solar system scale
  sunLight.shadow.camera.far = 15000; // Adjusted for solar system scale (max orbit ~7780)
  sunLight.shadow.bias = -0.005;
  scene.add(sunLight);
  // Add a firey sun mesh at the center (not affected by lighting)
  const sunInfo = planetData.find(p => p.name === 'sun');
  const sunGeometry = new THREE.SphereGeometry(sunInfo.size, 32, 32);
  const sunTexture = new THREE.TextureLoader().load('textures/sun.jpg');
  const sunMaterial = new THREE.MeshBasicMaterial({ map: sunTexture });
  sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
  sunMesh.position.set(0, 0, 0);
  sunMesh.castShadow = false;
  sunMesh.receiveShadow = false;
  solarSystemGroup.add(sunMesh);
  // Add solar system group
  scene.add(solarSystemGroup);
  // Real mean orbital radii in km (center-to-center, semi-major axis)
  const planetOrbitRadiiKm = {
    mercury: 57900000,    // Mean distance: 57.9 million km
    venus:   108200000,   // Mean distance: 108.2 million km
    earth:   149600000,   // Mean distance: 149.6 million km
    mars:    228000000,   // Mean distance: 228.0 million km (was 227.9)
    jupiter: 778500000,   // Mean distance: 778.5 million km
    saturn:  1432000000,  // Mean distance: 1432.0 million km (was 1433)
    uranus:  2867000000,  // Mean distance: 2867.0 million km (was 2871)
    neptune: 4515000000,  // Mean distance: 4515.0 million km (was 4495)
    pluto:   5906400000   // Mean distance: 5906.4 million km (was 590.6)
  };
  // Use the same scale as planet sizes
  const ORBIT_SCALE = 1.2 / 696340; // Same as PLANET_SCALE
  // Add planets and orbits
  const reversedPlanets = [...planetData].reverse();
  const days = daysSinceJ2000();
  reversedPlanets.forEach((planet, i) => {
    if (planet.name === 'sun') {
      // The sun is only a light, not a mesh
      return;
    }
    // Use real orbital radius for position (scaled)
    const orbitRadius = (planetOrbitRadiiKm[planet.name] || 0) * ORBIT_SCALE;
    const pos = new THREE.Vector3(orbitRadius, 0, 0);
    const planetGroup = createPlanet(planet, pos.clone(), shapes);
    if (!planetGroup) return;
    const pivot = new THREE.Group();
    pivot.position.set(0, 0, 0);
    planetGroup.position.copy(pos);
    pivot.add(planetGroup);
    const period = planetPhysicalData[planet.name]?.orbit;
    if (period && period > 0) {
      const fraction = (days / period) % 1;
      pivot.rotation.y = fraction * 2 * Math.PI;
    }
    solarSystemGroup.add(pivot);
    planetOrbitData.set(planetGroup, pivot);
    // Draw orbit line at correct radius
    const orbitLine = createOrbitLine(orbitRadius, 128, 0xffffff, 0.2);
    solarSystemGroup.add(orbitLine);
  });
  // Add starmap sphere (background)
  // Determine the maximum orbital radius to size the starmap appropriately
  const maxOrbitKmVal = Math.max(...Object.values(planetOrbitRadiiKm));
  const maxScaledOrbitRadiusVal = maxOrbitKmVal * ORBIT_SCALE;
  const starmapRadius = maxScaledOrbitRadiusVal * 2; // Make starmap 2.5x the largest orbit
  const starmapGeometry = new THREE.SphereGeometry(starmapRadius, 64, 64);
  const starmapTexture = new THREE.TextureLoader().load('textures/starmap.jpg');
  const starmapMaterial = new THREE.MeshBasicMaterial({
    map: starmapTexture,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.5 // Slightly translucent
  });
  starmapMesh = new THREE.Mesh(starmapGeometry, starmapMaterial);
  starmapMesh.renderOrder = -1; // Render behind everything
  solarSystemGroup.add(starmapMesh); // Reverted: Add starmap back to solarSystemGroup
  animateCallback();
}

// The animation loop should be handled in main.js or another module, as it depends on more than just scene/camera/renderer. 
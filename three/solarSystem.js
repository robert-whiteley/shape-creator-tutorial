// three/solarSystem.js
// Handles planet and solar system creation logic and helpers

// Assumes THREE is globally available or imported elsewhere

export const planetData = [
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

// Orbital and rotation periods in Earth days
export const planetPhysicalData = {
  mercury:  { orbit: 87.97,   rotation: 58.646 },
  venus:    { orbit: 224.70,  rotation: -243.025 }, // retrograde
  earth:    { orbit: 365.26,  rotation: 0.997 },
  mars:     { orbit: 686.98,  rotation: 1.026 },
  jupiter:  { orbit: 4332.59, rotation: 0.4135 },
  saturn:   { orbit: 10759.22,rotation: 0.444 },
  uranus:   { orbit: 30688.5, rotation: -0.718 }, // retrograde
  neptune:  { orbit: 60182,   rotation: 0.671 },
  pluto:    { orbit: 90560,   rotation: -6.387 }, // retrograde
  sun:      { orbit: 0,       rotation: 25.0 } // sun's rotation ~25 days, no orbit
};

// Precompute normalized angular speeds (radians per animation frame, relative to Earth)
export const planetSpeeds = {};
Object.keys(planetPhysicalData).forEach(name => {
  const { orbit, rotation } = planetPhysicalData[name];
  planetSpeeds[name] = {
    orbit: orbit > 0 ? (2 * Math.PI) / orbit : 0, // radians per Earth day
    rotation: (2 * Math.PI) / rotation // radians per Earth day (can be negative)
  };
});

export const moonOrbitData = new Map(); // Map from earth group to {pivot, moon}
export const planetOrbitData = new Map(); // Map from planet group to its pivot

export function createOrbitLine(radius, segments = 128, color = 0xffffff, opacity = 0.25) {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    positions.push(Math.cos(theta) * radius, 0, Math.sin(theta) * radius);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  return new THREE.Line(geometry, material);
}

export function createPlanet({ texture, size, name }, position, shapes) {
  if (name === 'sun') {
    // Do not create a mesh for the sun; it will be represented by a DirectionalLight
    return null;
  }
  const geometry = new THREE.SphereGeometry(size, 32, 32);
  const planetTexture = new THREE.TextureLoader().load(texture);
  const material = new THREE.MeshStandardMaterial({ map: planetTexture });
  const fillMesh = new THREE.Mesh(geometry, material);
  fillMesh.castShadow = true;
  fillMesh.receiveShadow = true;

  if (name === 'earth') {
    const earthSystemGroup = new THREE.Group(); // Main group for Earth & Moon system
    earthSystemGroup.userData = { name: name };

    const earthAxialSpinGroup = new THREE.Group(); // Group for Earth's axial spin
    earthAxialSpinGroup.add(fillMesh); // Add Earth mesh to the spinner
    earthSystemGroup.add(earthAxialSpinGroup);

    const moonPivot = new THREE.Group(); // Moon's orbital pivot
    const moonGeometry = new THREE.SphereGeometry(0.136 * 0.8, 32, 32);
    const moonTexture = new THREE.TextureLoader().load('textures/moon.jpg');
    const moonMaterial = new THREE.MeshStandardMaterial({ map: moonTexture });
    const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
    moonMesh.userData = { name: 'moon' };
    moonMesh.castShadow = true;
    moonMesh.receiveShadow = true;
    moonMesh.position.set(12.0, 0, 0); // Position moon relative to its pivot
    moonPivot.add(moonMesh);
    earthSystemGroup.add(moonPivot); // Add moon's pivot to the main system group

    moonOrbitData.set(earthSystemGroup, { 
      pivot: moonPivot, // For moon's orbit
      moon: moonMesh,
      earthSpinnner: earthAxialSpinGroup // For Earth's axial spin
    });

    const moonOrbitLine = createOrbitLine(12.0, 128, 0xffffff, 0.3);
    earthSystemGroup.add(moonOrbitLine); // Add orbit line to the main system group

    earthSystemGroup.position.copy(position); // Position the whole system
    shapes.push(earthSystemGroup);
    return earthSystemGroup;

  } else {
    // For other planets, the existing group structure is fine
    const group = new THREE.Group();
    group.userData = { name: name };
    group.add(fillMesh);
    group.position.copy(position);
    shapes.push(group);
    return group;
  }
}

// Helper: Days since J2000.0 (Jan 1, 2000, 12:00 TT)
export function daysSinceJ2000() {
  const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0, 0); // months are 0-based
  const now = Date.now();
  return (now - J2000) / (1000 * 60 * 60 * 24);
} 
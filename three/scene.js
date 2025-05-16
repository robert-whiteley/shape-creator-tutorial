// three/scene.js
// Handles Three.js scene, camera, renderer, and animation loop

// Assumes THREE is globally available or imported elsewhere

export const MODEL_SCALE_FACTOR = 1.2 / 696340; // Same as PLANET_SCALE. Used for orbits and planet sizes.

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
  animateCallback,
  yawObject,
  pitchObject
}) {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 25000);
  camera.position.set(0, 0, 0); // Camera always at origin in its parent
  if (pitchObject && yawObject) {
    pitchObject.add(camera);
    yawObject.position.set(0, 0, 0); // Initial camera position in world
    scene.add(yawObject);
  }
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
  // Add planets and orbits
  const reversedPlanets = [...planetData].reverse();
  const days = daysSinceJ2000();

  // Process all bodies, including the Sun, through createPlanet
  planetData.forEach((planetBodyData) => { // Changed from reversedPlanets and iterating over planetData directly
    // if (planet.name === 'sun') {
    //   // The sun is only a light, not a mesh -- This comment is no longer true, sun is created via createPlanet
    //   return;
    // }

    // Use real orbital radius for position (scaled)
    // For the Sun, orbitRadiusKm will be undefined, scaledSemiMajorAxis will be 0, initialX will be 0.
    const orbitRadiusKm = planetOrbitRadiiKm[planetBodyData.name]; 
    const scaledSemiMajorAxis = orbitRadiusKm ? orbitRadiusKm * MODEL_SCALE_FACTOR : 0;
    const initialX = scaledSemiMajorAxis;
    const pos = new THREE.Vector3(initialX, 0, 0); // Sun will be at (0,0,0)

    const planetGroup = createPlanet(planetBodyData, pos.clone(), shapes);
    if (!planetGroup) return; // Should not happen for the sun now

    // If this is the Sun, assign its visual part to the module's sunMesh variable
    // so getSunMesh() can still return it if needed elsewhere (e.g. UI, info display).
    // The sun's planetGroup contains the axialSpinGroup as its first child.
    if (planetBodyData.name === 'sun') {
      sunMesh = planetGroup; // Or planetGroup.userData.axialSpinGroup, or planetGroup.children[0].children[0] for the raw mesh
                           // Let's assign the main group for now. getSunMesh might be used to get the overall object.
    }

    // Get eccentricity, inclination, etc. - For Sun, these are mostly 0 or not applicable for orbit
    const eccentricity = planetPhysicalData[planetBodyData.name]?.eccentricity || 0;
    const inclinationDeg = planetPhysicalData[planetBodyData.name]?.inclination || 0;
    const inclinationRad = inclinationDeg * (Math.PI / 180);

    // Get Longitude of Ascending Node (Ω) in degrees and convert to radians
    const nodeDeg = planetPhysicalData[planetBodyData.name]?.node || 0;
    const nodeRad = nodeDeg * (Math.PI / 180);

    // Get Argument of Perihelion (ω) in degrees and convert to radians
    let periDeg = planetPhysicalData[planetBodyData.name]?.peri || 0;
    if (periDeg < 0) periDeg += 360; // Ensure positive angle
    const periRad = periDeg * (Math.PI / 180);

    // The pivot group's direct rotation will be replaced by direct position updates.
    // However, the planetGroup is still added to solarSystemGroup.
    // We might not need a dedicated 'pivot' in the old sense for sun orbits.
    // Let's rethink what planetOrbitData stores. It should map the planetGroup to its orbital params.
    // The planetGroup itself will have its position updated.
    // The 'pivot' was used to establish a rotational center. The Sun (0,0,0) is the focal point.

    // The planetGroup is added directly to solarSystemGroup, its position will be updated.
    solarSystemGroup.add(planetGroup); // Add planet group (e.g. earthSystemGroup or individual planet group)

    // Store 'a' and 'e' for animation.
    // The 'key' is the planetGroup that will be moved.
    planetOrbitData.set(planetGroup, {
      a: scaledSemiMajorAxis,
      e: eccentricity,
      i: inclinationRad, // Store inclination in radians
      node: nodeRad,     // Store Longitude of Ascending Node in radians
      peri: periRad,     // Store Argument of Perihelion in radians
      // We also need mean motion 'n', which is planetSpeeds[planet.name].orbit
      n: planetSpeeds[planetBodyData.name]?.orbit || 0,
      // We'll need a way to track the current Mean Anomaly (M) for each planet.
      // Let's initialize it based on the initial rotation, which simulated a starting position.
      // M = n * t. If initial rotation was fraction * 2PI, then M_initial = fraction * 2PI
      // M: (planetPhysicalData[planet.name]?.orbit > 0) ? ((days / planetPhysicalData[planet.name].orbit) % 1) * 2 * Math.PI : 0
      // New M calculation based on M0 at J2000.0:
      M: (() => {
        const m0Deg = planetPhysicalData[planetBodyData.name]?.m0 || 0;
        let m0Rad = m0Deg * (Math.PI / 180);
        const currentN = planetSpeeds[planetBodyData.name]?.orbit || 0;
        let initialM = m0Rad + (currentN * days);
        initialM = initialM % (2 * Math.PI); // Normalize to [0, 2PI)
        if (initialM < 0) initialM += (2 * Math.PI); // Ensure positive
        return initialM;
      })()
    });

    // Initial positioning of the planet group itself using a simplified approach for now.
    // This will be immediately updated by the first frame of the animation loop using Kepler's laws.
    // The `pos` used in `createPlanet` might give it an initial offset if not handled carefully.
    // `createPlanet` sets planetGroup.position.copy(position) for non-Earth systems.
    // For Earth system, earthSystemGroup.position.copy(position) is called.
    // This initial position should ideally be derived from M_initial, a, and e.

    // Let's ensure the planetGroup starts at a position that will be overwritten.
    // Or, better, calculate its initial position correctly here.
    // For now, createPlanet places it. The animation will take over.


    // The old pivot logic for sun orbits:
    // const pivot = new THREE.Group();
    // pivot.position.set(0, 0, 0);
    // planetGroup.position.copy(pos); // Planet relative to pivot
    // pivot.add(planetGroup);
    // const period = planetPhysicalData[planet.name]?.orbit;
    // if (period && period > 0) {
    //   const fraction = (days / period) % 1;
    //   pivot.rotation.y = fraction * 2 * Math.PI; // Initial rotation based on current date
    // }
    // solarSystemGroup.add(pivot);
    // planetOrbitData.set(planetGroup, pivot); // OLD: storing pivot

    // Draw orbit line at correct radius (this will need to become an elliptical line)
    // Only draw orbit lines for bodies that actually orbit
    if (planetBodyData.name !== 'sun' && scaledSemiMajorAxis > 0) { 
    const orbitLine = createOrbitLine(scaledSemiMajorAxis, eccentricity, inclinationRad, nodeRad, periRad, 128, 0xffffff, 0.2);
    solarSystemGroup.add(orbitLine);
    }
  });
  // Add starmap sphere (background)
  // Determine the maximum orbital radius to size the starmap appropriately
  const maxOrbitKmVal = Math.max(...Object.values(planetOrbitRadiiKm));
  const maxScaledOrbitRadiusVal = maxOrbitKmVal * MODEL_SCALE_FACTOR;
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
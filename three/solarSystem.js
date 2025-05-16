// three/solarSystem.js
// Handles planet and solar system creation logic and helpers

// Assumes THREE is globally available or imported elsewhere

export const planetData = [
  { name: 'sun', texture: 'textures/sun.jpg', size: 1.2 },
  { name: 'mercury', texture: 'textures/mercury.jpg', size: 0.25 },
  { name: 'venus', texture: 'textures/venus.jpg', size: 0.4 },
  { name: 'earth', texture: 'textures/earth.jpg', size: 0.5 },
  { name: 'moon', texture: 'textures/moon.jpg', size: 0.136 },
  { name: 'mars', texture: 'textures/mars.jpg', size: 0.35 },
  { name: 'jupiter', texture: 'textures/jupiter.jpg', size: 0.9 },
  { name: 'saturn', texture: 'textures/saturn.jpg', size: 0.8 },
  { name: 'uranus', texture: 'textures/uranus.jpg', size: 0.6 },
  { name: 'neptune', texture: 'textures/neptune.jpg', size: 0.6 },
  { name: 'pluto', texture: 'textures/pluto.jpg', size: 0.18 }
];

// Create and export planetBaseSizes and sunBaseSize
export const planetBaseSizes = {};
export let sunBaseSize = null;

planetData.forEach(planet => {
  planetBaseSizes[planet.name] = planet.size;
  if (planet.name === 'sun') sunBaseSize = planet.size;
});

// Orbital and rotation periods in Earth days
export const planetPhysicalData = {
  mercury:  { orbit: 87.97,   rotation: 58.646, eccentricity: 0.206, inclination: 7.0, node: 48.331, peri: 29.127, l0: 252.25032350, peri0: 77.45779628, m0: 174.79252722, axialTilt: 0.034 },
  venus:    { orbit: 224.70,  rotation: -243.025, eccentricity: 0.007, inclination: 3.4, node: 76.680, peri: 54.922, l0: 181.97909950, peri0: 131.60246718, m0: 50.37663232, axialTilt: 177.4 },
  earth:    { orbit: 365.26,  rotation: 0.997, eccentricity: 0.017, inclination: 0.0, node: 0.0,    peri: 102.938, l0: 100.46457166, peri0: 102.93768193, m0: -2.47311027, axialTilt: 23.44 },
  mars:     { orbit: 686.98,  rotation: 1.026, eccentricity: 0.094, inclination: 1.8, node: 49.559, peri: 286.497, l0: 355.44656795, peri0: 336.05637041, m0: 19.39019754, axialTilt: 25.2 },
  jupiter:  { orbit: 4332.59, rotation: 0.4135, eccentricity: 0.049, inclination: 1.3, node: 100.474, peri: -85.746, l0: 34.39644051, peri0: 14.72847983, m0: 19.66796068, axialTilt: 3.1 },
  saturn:   { orbit: 10759.22,rotation: 0.444, eccentricity: 0.052, inclination: 2.5, node: 113.662, peri: -21.063, l0: 49.95424423, peri0: 92.59887831, m0: -42.64463408, axialTilt: 26.7 },
  uranus:   { orbit: 30688.5, rotation: -0.718, eccentricity: 0.047, inclination: 0.8, node: 74.017, peri: 96.937, l0: 313.23810451, peri0: 170.95427630, m0: 142.28382821, axialTilt: 97.8 },
  neptune:  { orbit: 60182,   rotation: 0.671, eccentricity: 0.010, inclination: 1.8, node: 131.784, peri: -86.820, l0: 304.87997031, peri0: 44.96476227, m0: 259.91520804, axialTilt: 28.3 },
  pluto:    { orbit: 90560,   rotation: -6.387, eccentricity: 0.244, inclination: 17.2, node: 110.303, peri: 113.763, l0: 238.92881, peri0: 224.06676, m0: 14.86205, axialTilt: 119.5 },
  sun:      { orbit: 0,       rotation: 25.0, eccentricity: 0, inclination: 0, node: 0, peri: 0, l0: 0, peri0: 0, m0: 0, axialTilt: 7.25 }
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
export const planetOrbitData = new Map(); // Map from planet group to its orbital params {a, e, n, M, i, node, peri}

export function createOrbitLine(semiMajorAxis, eccentricity, inclinationRad, nodeRad, periRad, segments = 128, color = 0xffffff, opacity = 0.25) {
  const geometry = new THREE.BufferGeometry();
  const positions = [];

  const a = semiMajorAxis;
  const e = eccentricity;
  const i = inclinationRad;
  const node = nodeRad;
  const peri = periRad;

  // Pre-calculate cosines and sines for transformation
  const cos_peri = Math.cos(peri);
  const sin_peri = Math.sin(peri);
  const cos_node = Math.cos(node);
  const sin_node = Math.sin(node);
  const cos_i = Math.cos(i);
  const sin_i = Math.sin(i);

  if (e < 0 || e >= 1) {
    console.warn(`Invalid eccentricity ${e} for orbit line, drawing inclined, oriented circle.`);
    // Draw a circle, but still apply inclination, node, and peri for orientation
    for (let j = 0; j <= segments; j++) {
      const trueAnomaly = (j / segments) * Math.PI * 2;
      const r = a; // For a circle

      // Position in orbital plane (around focus at origin, as if perihelion is along x-axis)
      const x_prime = r * Math.cos(trueAnomaly);
      const y_prime = r * Math.sin(trueAnomaly);

      // Transform to ecliptic coordinates
      const cos_nu_plus_peri = Math.cos(trueAnomaly + peri);
      const sin_nu_plus_peri = Math.sin(trueAnomaly + peri);

      const x_ecl = r * (cos_node * cos_nu_plus_peri - sin_node * sin_nu_plus_peri * cos_i);
      const y_ecl = r * (sin_node * cos_nu_plus_peri + cos_node * sin_nu_plus_peri * cos_i);
      const z_ecl = r * (sin_nu_plus_peri * sin_i);

      positions.push(x_ecl, z_ecl, y_ecl); // Y-up swap for Three.js
    }
  } else {
    const b = a * Math.sqrt(1 - e * e); // Semi-minor axis
    const c = a * e; // Distance from center to focus (Sun)

    for (let j = 0; j <= segments; j++) {
      // Instead of parametric angle, let's use true anomaly (nu) to trace the ellipse path
      // relative to the focus, which makes applying orbital elements more direct.
      // However, generating points evenly by true anomaly for an ellipse is non-trivial.
      // A simpler way for visualization is to use the parametric form of an ellipse
      // centered at (0,0) and then shift it so one focus is at the origin, then rotate.

      const thetaParam = (j / segments) * Math.PI * 2; // Parameter angle for ellipse generation
      // Coordinates of ellipse centered at (0,0) in its own plane (x_op, y_op)
      let x_op = a * Math.cos(thetaParam);
      let y_op = b * Math.sin(thetaParam);

      // Shift ellipse so the focus (Sun) is at the origin of this plane.
      // The Sun is at one focus, (-c, 0) if perihelion is on positive x-axis.
      // Or (c,0) and we draw from -a to a+2c etc. Standard is Sun at origin.
      // To place the sun at the origin, the ellipse center is at (c, 0) from the sun.
      // So points (x_op, y_op) relative to ellipse center become (x_op - c, y_op) relative to sun.
      x_op = x_op - c; // x_prime in orbital plane, relative to focus
      const z_op = y_op; // y_prime in orbital plane, relative to focus (using z for the other in-plane axis)

      // Now, x_op is along the direction of periapsis (from focus).
      // z_op is 90 deg to this in the orbital plane.
      // These are equivalent to r*cos(nu) and r*sin(nu) if we had nu.
      // We need to apply argument of perihelion (peri) first within this 2D plane.
      const x_rotated_in_plane = x_op * cos_peri - z_op * sin_peri;
      const z_rotated_in_plane = x_op * sin_peri + z_op * cos_peri;

      // Now transform these (x_rotated_in_plane, 0, z_rotated_in_plane) to the ecliptic frame
      // using inclination (i) and longitude of ascending node (node).
      // x_ecl = x_rotated_in_plane * cos_node - (z_rotated_in_plane * cos_i) * sin_node;
      // y_ecl = x_rotated_in_plane * sin_node + (z_rotated_in_plane * cos_i) * cos_node;
      // z_ecl = z_rotated_in_plane * sin_i;
      
      // Using the combined formula for clarity, where nu_plus_peri effectively defines the orientation in the inclined plane.
      // The (x_rotated_in_plane, z_rotated_in_plane) are essentially (r cos(nu_eff), r sin(nu_eff))
      // where nu_eff is an effective true anomaly corresponding to thetaParam and shifted for periapsis.
      // This is becoming overly complex. Let's use the direct transformation from (r, nu)
      // For drawing the ellipse, we need points (x,y,z) in ecliptic coords.
      // We can iterate true anomaly nu from 0 to 2PI.
      // r = a * (1 - e^2) / (1 + e * cos(nu_point))
      // x_orb_plane_pt = r * cos(nu_point)
      // z_orb_plane_pt = r * sin(nu_point)
      // These (x_orb_plane_pt, z_orb_plane_pt) are coordinates in the orbital plane with the x-axis pointing to perihelion.
      // This is NOT what the parametric form gives directly relative to focus. 

      // Let's use the standard transformation, where (x_prime, y_prime) are in the orbital plane,
      // x_prime along the line from focus to perihelion.
      // thetaParam is essentially our true anomaly for plotting purposes here.
      const nu_point = thetaParam;
      const r_point = a * (1 - e*e) / (1 + e * Math.cos(nu_point));
      
      // If eccentricity is very low, r_point can be huge if 1+e*cos(nu_point) is near zero.
      // This happens if e is close to 1 and nu_point is near PI.
      // The parametric form is more stable for plotting a full ellipse.
      // Let's stick to the parametric form for x_op, y_op and then transform.
      // (x_op, y_op) are points on ellipse centered at origin. x_op from -a to a, y_op from -b to b.
      // Shift so focus is at origin: (x_op - c, y_op)
      const x_focal = a * Math.cos(thetaParam) - c; // x in orbital plane, origin at focus, direction of periapsis along x-axis
      const y_focal = b * Math.sin(thetaParam); // y in orbital plane, origin at focus

      // (x_focal, y_focal) are (r*cos(v), r*sin(v)) where v is true anomaly. Let v = thetaParam for this construction.
      // This means x_focal is r*cos(v) and y_focal is r*sin(v).
      // Now apply argument of perihelion (peri), inclination (i), and node (Ω).
      const cos_v_plus_peri = Math.cos(thetaParam + peri); // Using thetaParam as v effectively.
      const sin_v_plus_peri = Math.sin(thetaParam + peri);
      // The r for this point is sqrt(x_focal^2 + y_focal^2)
      // This is not ideal. The r must be consistent with the (v+peri) angle.

      // Correct approach for plotting given a, e, i, node, peri:
      // Iterate theta (true anomaly, nu) from 0 to 2PI.
      // For each theta:
      // 1. Calculate r = a * (1 - e^2) / (1 + e * cos(theta))
      // 2. These (r, theta) are polar coordinates in the orbital plane, with theta=0 being perihelion direction.
      //    Convert to Cartesian in orbital plane: x_orb_p = r * cos(theta), y_orb_p = r * sin(theta)
      // 3. Transform (x_orb_p, y_orb_p, 0) to ecliptic coordinates using i, node, peri.
      //    The standard transformation uses (nu + peri) for the angle in the inclined plane.
      const nu_current = (j / segments) * Math.PI * 2; 
      let r_current = (a * (1 - e*e)) / (1 + e * Math.cos(nu_current));
      if (e === 0) r_current = a; // For perfect circle, formula can be unstable if e is exactly 0 due to (1-e*e)

      const cos_current_nu_plus_peri = Math.cos(nu_current + peri);
      const sin_current_nu_plus_peri = Math.sin(nu_current + peri);

      const x_ecl = r_current * (cos_node * cos_current_nu_plus_peri - sin_node * sin_current_nu_plus_peri * cos_i);
      const y_ecl = r_current * (sin_node * cos_current_nu_plus_peri + cos_node * sin_current_nu_plus_peri * cos_i);
      const z_ecl = r_current * (sin_current_nu_plus_peri * sin_i);

      positions.push(x_ecl, z_ecl, y_ecl); // Y-up swap for Three.js
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  return new THREE.Line(geometry, material);
}

export function createPlanet({ texture, size, name }, position, shapes) {
  // if (name === 'sun') {
  //   // Do not create a mesh for the sun; it will be represented by a DirectionalLight
  //   return null;
  // }
  const geometry = new THREE.SphereGeometry(size, 32, 32);
  const planetTexture = new THREE.TextureLoader().load(texture);
  
  let material;
  if (name === 'sun') {
    // Sun should glow and not be affected by scene lights
    material = new THREE.MeshBasicMaterial({ map: planetTexture, emissive: 0xffddaa, emissiveIntensity: 0.6 });
  } else {
    material = new THREE.MeshStandardMaterial({ map: planetTexture });
  }

  const fillMesh = new THREE.Mesh(geometry, material);
  fillMesh.castShadow = true;
  fillMesh.receiveShadow = true;

  if (name === 'sun') {
    fillMesh.castShadow = false;
    fillMesh.receiveShadow = false;
  }

  const planetTilt = planetPhysicalData[name]?.axialTilt || 0; // Get axial tilt, default to 0
  const axialSpinGroup = new THREE.Group(); // Group for axial spin and tilt
  axialSpinGroup.add(fillMesh);
  // Apply axial tilt. This tilts the planet's local Y-axis (spin axis).
  // We rotate around the Z-axis to tilt the North Pole (initially +Y) towards +X or -X.
  // This is a common convention, assuming orbit is in XZ plane initially.
  axialSpinGroup.rotation.z = THREE.MathUtils.degToRad(planetTilt);

  if (name === 'earth') {
    const earthSystemGroup = new THREE.Group(); // Main group for Earth & Moon system
    earthSystemGroup.userData = { name: name };

    // earthAxialSpinGroup already exists conceptually, now it's our axialSpinGroup
    earthSystemGroup.add(axialSpinGroup); // Add the already tilted axialSpinGroup

    // Find moon data from planetData
    const moonData = planetData.find(p => p.name === 'moon');
    if (!moonData) {
      console.error("Moon data not found in planetData!");
      // Fallback or error handling
    }
    const moonSize = moonData ? moonData.size : 0.136; // Use moonData.size, fallback to old value
    const moonTexturePath = moonData ? moonData.texture : 'textures/moon.jpg'; // Use moonData.texture

    const moonPivot = new THREE.Group(); // Moon's orbital pivot
    const moonGeometry = new THREE.SphereGeometry(moonSize, 32, 32); // Use moonSize
    const moonTexture = new THREE.TextureLoader().load(moonTexturePath); // Use moonTexturePath
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
      earthSpinner: axialSpinGroup // Corrected: Store the new axialSpinGroup as earthSpinner
    });

    const moonOrbitLine = createOrbitLine(12.0, 0, 0, 0, 0, 128, 0xffffff, 0.3); // Moon orbit assumed in Earth's orbital plane for now (0 inclination relative to it)
    earthSystemGroup.add(moonOrbitLine); // Add orbit line to the main system group

    earthSystemGroup.position.copy(position); // Position the whole system
    shapes.push(earthSystemGroup);
    return earthSystemGroup;

  } else {
    // For other planets, the existing group structure is fine for orbit,
    // but we add the axialSpinGroup to it.
    const group = new THREE.Group();
    group.userData = { name: name };
    group.add(axialSpinGroup); // Add the tilted planet to the main orbital group
    group.userData.axialSpinGroup = axialSpinGroup; // Store reference for animator
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
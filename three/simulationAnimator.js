// three/simulationAnimator.js
// Handles the animation updates for celestial bodies (rotation and orbit).

// Helper function to solve Kepler's Equation M = E - e * sin(E) for E
// using Newton's method
function solveKeplerEquation(M, e, maxIter = 8, tolerance = 1e-7) {
  let E = M; // Initial guess for Eccentric Anomaly
  // For higher eccentricities, a different initial guess might be better.
  // E.g., for e > 0.8, E = M + e * Math.sin(M) or E = Math.PI;
  if (e > 0.8) { 
    E = Math.PI; 
  }


  for (let i = 0; i < maxIter; i++) {
    const f = E - e * Math.sin(E) - M; // f(E)
    const fPrime = 1 - e * Math.cos(E); // f'(E)
    if (Math.abs(fPrime) < 1e-10) { // Avoid division by zero if fPrime is too small
        // This can happen if e is very close to 1 and E is close to 0 or PI
        // Or if the derivative is pathologically small.
        // A more robust solver might be needed for extreme cases, or adjust M slightly.
        break; 
    }
    const deltaE = f / fPrime;
    E = E - deltaE;
    if (Math.abs(deltaE) < tolerance) {
      break;
    }
  }
  return E;
}


export function updateCelestialAnimations({
  simDaysElapsedInFrame,
  shapes,           // Array of planet/earthSystem groups
  getSunMesh,       // Function to get the Sun's mesh
  planetSpeeds,     // Data object for rotation/orbit speeds
  moonOrbitData,    // Map for Earth-Moon system specifics
  planetOrbitData   // Map from planet group to its orbital params {a, e, n, M}
}) {
  // Animate planet shapes (axial rotation and orbit around sun)
  shapes.forEach(shape => {
    const userData = shape.userData || {};
    const planetName = userData.name;

    // Earth System (Earth axial spin, Moon orbit)
    if (moonOrbitData.has(shape)) { // This is the earthSystemGroup
      const { pivot: moonOrbitalPivot, earthSpinnner } = moonOrbitData.get(shape);

      // Earth's axial spin (on its dedicated spinner group)
      if (earthSpinnner && planetSpeeds['earth']) {
        earthSpinnner.rotation.y += planetSpeeds['earth'].rotation * simDaysElapsedInFrame;
      }

      // Moon's orbit (on its dedicated pivot - circular around Earth)
      if (moonOrbitalPivot) {
        // Assuming moon's orbital period is 27.32 Earth days
        moonOrbitalPivot.rotation.y += (2 * Math.PI / 27.32) * simDaysElapsedInFrame;
      }
      // The main 'shape' (earthSystemGroup) itself does not get direct axial rotation here.
      // Its orbital motion around the Sun is handled below.

    } else if (planetName && planetSpeeds[planetName] && planetSpeeds[planetName].rotation !== undefined) {
      // For other planets (not Earth system, not Sun mesh), apply their axial rotation to the main shape group
      shape.rotation.y += (planetSpeeds[planetName].rotation || 0) * simDaysElapsedInFrame;
    }

    // Animate planet orbit around the sun using Keplerian elements
    if (planetOrbitData.has(shape)) {
      const orbitalParams = planetOrbitData.get(shape); // This is a reference to the object in the Map
      let { a, e, n, M, i, node, peri } = orbitalParams; // Added i, node, peri

      // 1. Update Mean Anomaly (M)
      M += n * simDaysElapsedInFrame;
      M = M % (2 * Math.PI); // Normalize M to [0, 2PI)
      if (M < 0) M += 2 * Math.PI; // Ensure M is positive

      // 2. Solve Kepler's Equation for Eccentric Anomaly (E)
      const E = solveKeplerEquation(M, e);

      // 3. Calculate True Anomaly (nu)
      // nu = 2 * atan2(sqrt(1+e) * sin(E/2), sqrt(1-e) * cos(E/2))
      const sinE2 = Math.sin(E / 2);
      const cosE2 = Math.cos(E / 2);
      const nu = 2 * Math.atan2(Math.sqrt(1 + e) * sinE2, Math.sqrt(1 - e) * cosE2);

      // 4. Calculate heliocentric distance (r)
      // r = a * (1 - e * cos(E))
      const r = a * (1 - e * Math.cos(E));

      // 5. Calculate Cartesian coordinates (x_orb, z_orb) in the planet's orbital plane
      // (assuming perihelion is along the x-axis of this plane, before applying argument of perihelion)
      const x_prime = r * Math.cos(nu);
      const y_prime = r * Math.sin(nu); // This is effectively the 'z' in a 2D orbital plane calculation

      // Transformation from orbital plane to ecliptic coordinates:
      // P = perihelion argument, O = longitude of ascending node, i = inclination
      // x = r * (cos(O)cos(P+v) - sin(O)sin(P+v)cos(i))
      // y = r * (sin(O)cos(P+v) + cos(O)sin(P+v)cos(i))
      // z = r * (sin(P+v)sin(i))
      // Where v is the true anomaly (nu)
      // Our x_prime, y_prime are r*cos(nu) and r*sin(nu) respectively IF perihelion was at nu=0 along the reference x-axis.
      // We need to first rotate by argument of perihelion (peri) in the orbital plane.
      const x_orb_plane = x_prime * Math.cos(peri) - y_prime * Math.sin(peri);
      const z_orb_plane = x_prime * Math.sin(peri) + y_prime * Math.cos(peri);
      // y_orb_plane is 0 as we are in the 2D orbital plane initially.

      // Now apply inclination (i) and longitude of ascending node (node)
      // Rotate by i around the line of nodes (which is the reference x-axis after rotating by node).
      // Simpler: construct the final position vector by applying rotations sequentially.

      // Position in orbital frame (y is up, perpendicular to orbit plane)
      // X_orb points to perihelion, Z_orb is in direction of motion at perihelion (for prograde)
      // However, our (x_prime, y_prime) are already r*cos(nu) and r*sin(nu).
      // Let's use the standard transformation formulas for clarity.
      // (x_h, y_h, z_h) are heliocentric ecliptic coordinates.
      // v = nu (true anomaly)
      // ω = peri (argument of perihelion)
      // Ω = node (longitude of ascending node)
      // i = i (inclination)

      const cos_nu_plus_peri = Math.cos(nu + peri);
      const sin_nu_plus_peri = Math.sin(nu + peri);
      const cos_node = Math.cos(node);
      const sin_node = Math.sin(node);
      const cos_i = Math.cos(i);
      const sin_i = Math.sin(i);

      const x_ecl = r * (cos_node * cos_nu_plus_peri - sin_node * sin_nu_plus_peri * cos_i);
      const y_ecl = r * (sin_node * cos_nu_plus_peri + cos_node * sin_nu_plus_peri * cos_i);
      const z_ecl = r * (sin_nu_plus_peri * sin_i);
      
      // 6. Update planet's world position
      // The sun (focus) is at (0,0,0) in the solarSystemGroup.
      // The calculated coordinates are already heliocentric.
      shape.position.set(x_ecl, z_ecl, y_ecl); // Swapping y and z based on Three.js Y-up vs common Z-up in orbital mechanics
      // IMPORTANT: Standard orbital mechanics often uses Z as 'up' relative to the ecliptic plane.
      // Three.js uses Y as 'up'.
      // x_ecl -> x
      // y_ecl -> z (Projection onto the ecliptic plane's XY, if we imagine X-Y as ecliptic in Three.js)
      // z_ecl -> y (The 'height' above/below the ecliptic plane in Three.js)
      // So the mapping should be: shape.position.set(x_ecl, z_ecl, y_ecl); if Y is up in Three.js
      // Let's re-verify the axes. Standard orbital elements: X towards vernal equinox, Y 90deg east in ecliptic, Z normal to ecliptic.
      // Three.js default: Y is up.
      // If our ecliptic plane is XZ in Three.js, then:
      // x_ecl maps to Three.js X
      // y_ecl maps to Three.js Z
      // z_ecl maps to Three.js Y (height above/below ecliptic)
      shape.position.set(x_ecl, z_ecl, y_ecl); 

      // Store updated M back into the map
      orbitalParams.M = M % (2 * Math.PI); // Keep M in [0, 2*PI)
    }
  });

  // Animate sun rotation (handled separately as it's not in 'shapes')
  const sunMesh = getSunMesh();
  if (sunMesh && planetSpeeds['sun'] && planetSpeeds['sun'].rotation !== undefined) {
    sunMesh.rotation.y += (planetSpeeds['sun'].rotation || 0) * simDaysElapsedInFrame;
  }
} 
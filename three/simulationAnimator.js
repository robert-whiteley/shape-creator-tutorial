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
      let { a, e, n, M } = orbitalParams;

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

      // 5. Calculate Cartesian coordinates (x, z) assuming orbit in XZ plane
      // Sun is at (0,0,0) which is a focus of the ellipse.
      const x = r * Math.cos(nu);
      const z = r * Math.sin(nu);
      // y = 0 for now (no orbital inclination)

      // 6. Update planet's position
      // 'shape' is the planetGroup itself (e.g., earthSystemGroup or individual planet's group)
      shape.position.set(x, 0, z);

      // 7. Store updated M back into the orbitalParams object in the map
      orbitalParams.M = M; 
      // No need for planetOrbitData.set(shape, orbitalParams) because orbitalParams is a reference
      // to the object in the map, so its properties are directly updated.
    }
  });

  // Animate sun rotation (handled separately as it's not in 'shapes')
  const sunMesh = getSunMesh();
  if (sunMesh && planetSpeeds['sun'] && planetSpeeds['sun'].rotation !== undefined) {
    sunMesh.rotation.y += (planetSpeeds['sun'].rotation || 0) * simDaysElapsedInFrame;
  }
} 
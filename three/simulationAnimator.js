// three/simulationAnimator.js
// Handles the animation updates for celestial bodies (rotation and orbit).

export function updateCelestialAnimations({
  simDaysElapsedInFrame,
  shapes,           // Array of planet/earthSystem groups
  getSunMesh,       // Function to get the Sun's mesh
  planetSpeeds,     // Data object for rotation/orbit speeds
  moonOrbitData,    // Map for Earth-Moon system specifics
  planetOrbitData   // Map for planet orbital pivots
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

      // Moon's orbit (on its dedicated pivot)
      if (moonOrbitalPivot) {
        // Assuming moon's orbital period is 27.32 Earth days
        moonOrbitalPivot.rotation.y += (2 * Math.PI / 27.32) * simDaysElapsedInFrame;
      }
      // The main 'shape' (earthSystemGroup) itself does not get direct axial rotation here.

    } else if (planetName && planetSpeeds[planetName] && planetSpeeds[planetName].rotation !== undefined) {
      // For other planets (not Earth system, not Sun mesh), apply their axial rotation to the main shape group
      shape.rotation.y += (planetSpeeds[planetName].rotation || 0) * simDaysElapsedInFrame;
    }

    // Animate planet orbit around the sun (applies to earthSystemGroup as well)
    if (planetOrbitData.has(shape)) {
      const sunOrbitPivot = planetOrbitData.get(shape);
      // planetName on 'shape.userData.name' (e.g., 'earth') is used to get the correct orbital speed.
      if (planetName && planetSpeeds[planetName] && planetSpeeds[planetName].orbit !== undefined) {
        sunOrbitPivot.rotation.y += (planetSpeeds[planetName].orbit || 0) * simDaysElapsedInFrame;
      }
    }
  });

  // Animate sun rotation (handled separately as it's not in 'shapes')
  const sunMesh = getSunMesh();
  if (sunMesh && planetSpeeds['sun'] && planetSpeeds['sun'].rotation !== undefined) {
    sunMesh.rotation.y += (planetSpeeds['sun'].rotation || 0) * simDaysElapsedInFrame;
  }
} 
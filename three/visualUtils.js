// three/visualUtils.js
// Utilities for managing visual aspects of the Three.js scene, like scaling.

export function setPlanetScales({
  scale,
  shapes,         // Array of planet/earthSystem groups
  moonOrbitData,  // Map for Earth-Moon system specifics
  getSunMesh      // Function to get the Sun's mesh
}) {
  shapes.forEach(shape => {
    const planetName = shape.userData ? shape.userData.name : null;

    if (!planetName) return;

    if (planetName === 'earth') {
      // Earth system uses moonOrbitData to get specific meshes
      if (moonOrbitData.has(shape)) {
        const { moon: moonMesh, earthSpinner } = moonOrbitData.get(shape);
        
        // Scale Earth mesh (child of earthSpinner group)
        if (earthSpinner && earthSpinner.children[0]) {
          earthSpinner.children[0].scale.set(scale, scale, scale);
        }
        
        // Scale Moon mesh (directly available from moonOrbitData)
        if (moonMesh) {
          moonMesh.scale.set(scale, scale, scale);
        }
      }
    } else {
      // For other planets, the mesh is assumed to be the first child of the shape group
      if (shape.children[0]) {
        shape.children[0].scale.set(scale, scale, scale);
      }
    }
  });

  // Scale the sun mesh
  const sunMesh = getSunMesh();
  if (sunMesh) {
    sunMesh.scale.set(scale, scale, scale);
  }
} 
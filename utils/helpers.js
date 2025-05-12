// Utility Functions Module
// General-purpose helpers

export function get3DCoords(normX, normY) {
  const x = (normX - 0.5) * 10;
  const y = (0.5 - normY) * 10;
  return new THREE.Vector3(x, y, 0);
} 
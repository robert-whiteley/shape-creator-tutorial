// three/scene.js
// Handles Three.js scene, camera, renderer, and animation loop

// Assumes THREE is globally available or imported elsewhere

let scene, camera, renderer;
let lastAnimationTime = Date.now();

export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getRenderer() { return renderer; }

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
  camera.position.z = 5;
  renderer = new THREE.WebGLRenderer({ alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById('three-canvas').appendChild(renderer.domElement);
  const light = new THREE.AmbientLight(0xffffff, 1);
  scene.add(light);
  // Add solar system group
  scene.add(solarSystemGroup);
  // Add planets and orbits
  const reversedPlanets = [...planetData].reverse();
  const totalPlanets = reversedPlanets.length;
  const viewWidth = 8;
  const spacing = (viewWidth / (totalPlanets - 1)) * 1.3;
  const startX = -((spacing * (totalPlanets - 1)) / 2);
  let sunGroup = null;
  const days = daysSinceJ2000();
  reversedPlanets.forEach((planet, i) => {
    const pos = new THREE.Vector3(startX + i * spacing, 0, 0);
    const planetGroup = createPlanet(planet, pos.clone(), shapes);
    if (planet.name === 'sun') {
      planetGroup.position.set(0, 0, 0);
      solarSystemGroup.add(planetGroup);
      sunGroup = planetGroup;
    } else {
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
    }
  });
  animateCallback();
}

// The animation loop should be handled in main.js or another module, as it depends on more than just scene/camera/renderer. 
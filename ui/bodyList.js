// ui/bodyList.js
// Manages the dynamic list of celestial bodies and handles clicks for camera focus.

export function initBodyList({
  bodiesListUlElement,
  planetData,
  getCamera,
  getSunMesh,
  shapes, // array of planet/earthSystem groups
  planetBaseSizes,
  sunBaseSize,
  moonOrbitData, // Map from earthSystemGroup to its moon data
  cameraControls, // { startFlyToAnimation({lookAtTargetPoint, meshToFollowAfterAnimation, baseSizeForOffset, worldOrientedNormalizedViewDir}), cancelAnimationsAndFollow }
  solarSystemGroup // The main THREE.Group for the solar system, used for quaternion
}) {
  if (!bodiesListUlElement) {
    console.error("Bodies list UL element not provided to initBodyList.");
    return;
  }

  function handleBodyClick(bodyNameKey) {
    cameraControls.cancelAnimationsAndFollow();

    const camera = getCamera(); // Should be available
    let targetObjectMesh = null;
    const targetBodyWorldPosition = new THREE.Vector3(); // Assumes THREE is global
    let specificBaseSize = 1;

    if (bodyNameKey === 'sun') {
      targetObjectMesh = getSunMesh();
      if (targetObjectMesh && typeof sunBaseSize === 'number') {
        specificBaseSize = sunBaseSize;
      }
    } else if (bodyNameKey === 'moon') {
      const earthShapeGroup = shapes.find(s => s.userData && s.userData.name === 'earth');
      if (earthShapeGroup && moonOrbitData.has(earthShapeGroup)) {
        const { moon } = moonOrbitData.get(earthShapeGroup);
        if (moon && moon.userData && moon.userData.name === 'moon') {
          targetObjectMesh = moon;
          if (planetBaseSizes['earth']) {
            specificBaseSize = (planetBaseSizes['earth'] || 1) * 0.273;
          } else {
            const defaultPlanetSize = 0.5;
            const moonToPlanetRatio = 0.273;
            specificBaseSize = defaultPlanetSize * moonToPlanetRatio;
          }
        }
      }
    } else { // It's a planet
      const shapeGroup = shapes.find(s => s.userData && s.userData.name === bodyNameKey);
      if (shapeGroup) {
        if (bodyNameKey === 'earth') {
          if (moonOrbitData.has(shapeGroup)) { // shapeGroup is earthSystemGroup
            const { earthSpinner } = moonOrbitData.get(shapeGroup);
            if (earthSpinner && earthSpinner.children[0]) {
              targetObjectMesh = earthSpinner.children[0]; // Actual Earth sphere mesh
            }
          }
        } else {
          if (shapeGroup.children[0]) {
            targetObjectMesh = shapeGroup.children[0];
          }
        }

        if (planetBaseSizes[bodyNameKey]) {
          specificBaseSize = planetBaseSizes[bodyNameKey];
        } else {
          const planetEntry = planetData.find(p => p.name === bodyNameKey);
          if (planetEntry) {
            specificBaseSize = planetEntry.size;
          } else {
            specificBaseSize = 0.5; // Default if not found
          }
        }
      }
    }

    if (targetObjectMesh) {
      targetObjectMesh.getWorldPosition(targetBodyWorldPosition);

      const baseViewDir = new THREE.Vector3(0, 0.75, 1); // Viewing angle relative to object
      baseViewDir.normalize();

      // Get the solar system's current world orientation to make the view direction relative to it
      const solarSystemWorldQuaternion = solarSystemGroup.getWorldQuaternion(new THREE.Quaternion());
      const worldOrientedNormalizedViewDir = baseViewDir.clone().applyQuaternion(solarSystemWorldQuaternion);

      cameraControls.startFlyToAnimation({
        lookAtTargetPoint: targetBodyWorldPosition.clone(),
        meshToFollowAfterAnimation: targetObjectMesh,
        baseSizeForOffset: specificBaseSize,
        worldOrientedNormalizedViewDir: worldOrientedNormalizedViewDir.clone()
      });
    }
  }

  function updateBodiesListInternal() {
    bodiesListUlElement.innerHTML = ''; // Clear existing items

    // Sun
    const sunLi = document.createElement('li');
    const sunSpan = document.createElement('span');
    sunSpan.textContent = 'Sun';
    sunSpan.style.cursor = 'pointer';
    sunSpan.addEventListener('click', () => handleBodyClick('sun'));
    sunLi.appendChild(sunSpan);
    bodiesListUlElement.appendChild(sunLi);

    const planetsUl = document.createElement('ul');
    sunLi.appendChild(planetsUl);

    planetData.forEach(planetEntry => {
      const planetNameLower = planetEntry.name.toLowerCase();
      if (planetNameLower === 'sun') return;

      const planetDisplayName = planetNameLower.charAt(0).toUpperCase() + planetNameLower.slice(1);
      const planetLi = document.createElement('li');
      const planetSpan = document.createElement('span');
      planetSpan.textContent = planetDisplayName;
      planetSpan.style.cursor = 'pointer';
      planetSpan.addEventListener('click', () => handleBodyClick(planetNameLower));
      planetLi.appendChild(planetSpan);
      planetsUl.appendChild(planetLi);

      if (planetNameLower === 'earth') {
        const moonsUl = document.createElement('ul');
        planetLi.appendChild(moonsUl);

        const moonLi = document.createElement('li');
        const moonSpan = document.createElement('span');
        moonSpan.textContent = 'Moon';
        moonSpan.style.cursor = 'pointer';
        moonSpan.addEventListener('click', () => handleBodyClick('moon'));
        moonLi.appendChild(moonSpan);
        moonsUl.appendChild(moonLi);
      }
    });
  }

  // Initial population of the list
  updateBodiesListInternal();
} 
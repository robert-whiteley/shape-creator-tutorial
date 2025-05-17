// ui/bodyList.js
// Manages the dynamic list of celestial bodies and handles clicks for camera focus.

export function initBodyList({
  bodiesListUlElement,
  planetData,
  getCamera, // Retained for potential future use, though not directly used if cc handles all
  getSunMesh,
  shapes, // array of planet/earthSystem groups
  planetBaseSizes,
  sunBaseSize,
  moonOrbitData, // Map from earthSystemGroup to its moon data
  solarSystemGroup, // The main THREE.Group for the solar system, used for quaternion
  cameraController, // Added: direct reference to cameraController
  onBodyClick // Callback: onBodyClick(targetGroup, bodyName, isMoon, cameraController)
}) {
  if (!bodiesListUlElement) {
    console.error("Bodies list UL element not provided to initBodyList.");
    return;
  }
  if (!cameraController) {
    console.warn("initBodyList: cameraController was not provided. Fly-to clicks may not work.");
    // Decide if this is a critical error or just a warning
  }

  function updateBodiesListInternal() {
    bodiesListUlElement.innerHTML = ''; // Clear existing items

    // Sun
    const sunLi = document.createElement('li');
    const sunSpan = document.createElement('span');
    sunSpan.textContent = 'Sun';
    sunSpan.style.cursor = 'pointer';
    sunSpan.dataset.bodyName = 'sun'; // Store body name
    sunLi.appendChild(sunSpan);
    bodiesListUlElement.appendChild(sunLi);

    sunSpan.addEventListener('click', () => {
      if (onBodyClick) {
        const sunMesh = getSunMesh(); 
        if (sunMesh) {
          // Pass cameraController to the onBodyClick callback
          onBodyClick(sunMesh, 'sun', false, cameraController);
        } else {
          console.warn("Sun mesh not found for click event.");
        }
      }
    });

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
      planetSpan.dataset.bodyName = planetNameLower; // Store body name
      planetLi.appendChild(planetSpan);
      planetsUl.appendChild(planetLi);

      planetSpan.addEventListener('click', () => {
        if (onBodyClick) {
          const targetShape = shapes.find(s => s.userData.name === planetNameLower);
          if (targetShape) {
            // Pass cameraController to the onBodyClick callback
            onBodyClick(targetShape, planetNameLower, false, cameraController);
          } else {
            console.warn(`Shape not found for ${planetNameLower}`);
          }
        }
      });

      if (planetNameLower === 'earth') {
        const moonsUl = document.createElement('ul');
        planetLi.appendChild(moonsUl);

        const moonLi = document.createElement('li');
        const moonSpan = document.createElement('span');
        moonSpan.textContent = 'Moon';
        moonSpan.style.cursor = 'pointer';
        moonSpan.dataset.bodyName = 'moon'; // Store body name
        moonLi.appendChild(moonSpan);
        moonsUl.appendChild(moonLi);

        moonSpan.addEventListener('click', () => {
          if (onBodyClick) {
            const earthSystemGroup = shapes.find(s => s.userData.name === 'earth');
            if (earthSystemGroup && moonOrbitData.has(earthSystemGroup)) {
              const moonData = moonOrbitData.get(earthSystemGroup);
              if (moonData && moonData.moon) {
                // Pass cameraController to the onBodyClick callback
                onBodyClick(moonData.moon, 'moon', true, cameraController);
              } else {
                console.warn("Moon mesh not found in moonOrbitData for Earth.");
              }
            } else {
              console.warn("Earth system group or moon data not found for Moon click.");
            }
          }
        });
      }
    });
  }

  // Initial population of the list
  updateBodiesListInternal();
} 
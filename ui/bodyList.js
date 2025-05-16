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
  solarSystemGroup // The main THREE.Group for the solar system, used for quaternion
}) {
  if (!bodiesListUlElement) {
    console.error("Bodies list UL element not provided to initBodyList.");
    return;
  }

  function updateBodiesListInternal() {
    bodiesListUlElement.innerHTML = ''; // Clear existing items

    // Sun
    const sunLi = document.createElement('li');
    const sunSpan = document.createElement('span');
    sunSpan.textContent = 'Sun';
    sunSpan.style.cursor = 'pointer';
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
      planetLi.appendChild(planetSpan);
      planetsUl.appendChild(planetLi);

      if (planetNameLower === 'earth') {
        const moonsUl = document.createElement('ul');
        planetLi.appendChild(moonsUl);

        const moonLi = document.createElement('li');
        const moonSpan = document.createElement('span');
        moonSpan.textContent = 'Moon';
        moonSpan.style.cursor = 'pointer';
        moonLi.appendChild(moonSpan);
        moonsUl.appendChild(moonLi);
      }
    });
  }

  // Initial population of the list
  updateBodiesListInternal();
} 
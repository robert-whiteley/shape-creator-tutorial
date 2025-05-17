// camera/cameraController.js
// Manages camera animations (fly-to) and following logic.

export function initCameraController({
  getCamera,          // Function to get the THREE.Camera instance
  scaleSliderElement  // The HTML slider element for current visual scale
}) {
  let isCameraAnimating = false;
  let animationStartTime = 0;
  const ANIMATION_DURATION = 1500; // ms
  let cameraAnimationStartPos = new THREE.Vector3();
  let cameraAnimationEndPos = new THREE.Vector3();
  let cameraAnimationStartLookAt = new THREE.Vector3();
  let cameraAnimationEndLookAt = new THREE.Vector3();

  let followedObject = null; // { mesh, baseSize, worldOrientedNormalizedViewDir }
  let targetObjectForAnimation = null; // Stores the mesh details to be followed after animation

  const RELATIVE_VIEW_DISTANCE_MULTIPLIER = 20.0; // Increased for better viewing distance

  function startFlyToAnimation({ 
    lookAtTargetPoint,          // THREE.Vector3: world position of the object to look at
    meshToFollowAfterAnimation, // THREE.Mesh: the object to start following after animation
    baseSizeForOffset,          // number: base size of the target for offset calculation
    worldOrientedNormalizedViewDir // THREE.Vector3: pre-calculated view direction for offset
  }) {
    const camera = getCamera();
    if (!camera) return;

    cancelAnimationsAndFollowInternal(); // Clear any existing state first

    // Set the final point the camera should be looking at
    cameraAnimationEndLookAt.copy(lookAtTargetPoint);

    // Calculate the camera's final offset position
    const currentScale = parseInt(scaleSliderElement.value) || 1;
    const visualActualSize = baseSizeForOffset * currentScale;
    const offsetDistance = visualActualSize * RELATIVE_VIEW_DISTANCE_MULTIPLIER;
    const finalOffsetVector = worldOrientedNormalizedViewDir.clone().multiplyScalar(offsetDistance);
    cameraAnimationEndPos.copy(lookAtTargetPoint).add(finalOffsetVector);

    // Capture the camera's current position and orientation for the start of the animation
    cameraAnimationStartPos.copy(camera.position);
    const tempWorldDirection = new THREE.Vector3();
    camera.getWorldDirection(tempWorldDirection);
    cameraAnimationStartLookAt.copy(camera.position).add(tempWorldDirection.multiplyScalar(10)); // A point in front of current view

    // Store details for the object to be followed after animation completes
    targetObjectForAnimation = {
        mesh: meshToFollowAfterAnimation,
        baseSize: baseSizeForOffset,
        worldOrientedNormalizedViewDir: worldOrientedNormalizedViewDir.clone() // Store a clone
    };

    isCameraAnimating = true;
    animationStartTime = Date.now();
  }

  function cancelAnimationsAndFollowInternal() {
    isCameraAnimating = false;
    followedObject = null;
    targetObjectForAnimation = null;
    // console.log("Camera animations and follow cancelled.");
  }

  function updateCamera() {
    const camera = getCamera();
    if (!camera) return;

    const tempWorldPos = new THREE.Vector3(); 
    const tempLookAt = new THREE.Vector3();   

    if (isCameraAnimating) {
      const elapsed = Date.now() - animationStartTime;
      let progress = Math.min(elapsed / ANIMATION_DURATION, 1.0);
      // Ease in-out quad easing
      progress = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2; 

      camera.position.lerpVectors(cameraAnimationStartPos, cameraAnimationEndPos, progress);
      tempLookAt.lerpVectors(cameraAnimationStartLookAt, cameraAnimationEndLookAt, progress);
      camera.lookAt(tempLookAt);

      if (progress === 1.0) {
        isCameraAnimating = false;
        camera.position.copy(cameraAnimationEndPos); // Snap to final position
        camera.lookAt(cameraAnimationEndLookAt);   // Snap to final lookAt

        if (targetObjectForAnimation) {
          followedObject = targetObjectForAnimation;
          targetObjectForAnimation = null;
          // console.log("Fly-to animation complete. Now following:", followedObject.mesh.userData.name || 'Unknown Body');
        } else {
          // console.log("Fly-to animation complete. No object to follow.");
        }
      }
    } else if (followedObject && followedObject.mesh && followedObject.worldOrientedNormalizedViewDir) {
      followedObject.mesh.getWorldPosition(tempWorldPos);

      const currentScale = parseInt(scaleSliderElement.value) || 1;
      const visualActualSize = followedObject.baseSize * currentScale;
      const newOffsetDistance = visualActualSize * RELATIVE_VIEW_DISTANCE_MULTIPLIER;
      
      const currentOffsetVector = followedObject.worldOrientedNormalizedViewDir.clone().multiplyScalar(newOffsetDistance);
      const desiredCameraPosition = tempWorldPos.clone().add(currentOffsetVector);

      // Smoothly interpolate camera position towards the desired tracking position
      camera.position.lerp(desiredCameraPosition, 0.1); 
      camera.lookAt(tempWorldPos); // Continuously look at the followed object's center
    }
  }

  return {
    startFlyToAnimation,
    cancelAnimationsAndFollow: cancelAnimationsAndFollowInternal,
    updateCamera,
    isAnimating: () => isCameraAnimating, 
    getTrackedBodyInfo: () => followedObject // Provides {mesh, baseSize, worldOrientedNormalizedViewDir}
  };
}

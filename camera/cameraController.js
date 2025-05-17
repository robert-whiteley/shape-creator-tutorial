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
  let cameraAnimationEndLookAt = new THREE.Vector3(); // Still used as the target for camera.lookAt()
  let cameraAnimationControlPoint = new THREE.Vector3(); // For Bezier curve
  let cameraAnimationTransitionPointPos = new THREE.Vector3(); // Position at the Bezier-to-Linear transition

  const TRANSITION_PROGRESS_POINT = 0.7; // At 70% progress, switch to linear

  let followedObject = null; // { mesh, baseSize, worldOrientedNormalizedViewDir }
  let targetObjectForAnimation = null; // Stores the mesh details to be followed after animation

  const RELATIVE_VIEW_DISTANCE_MULTIPLIER = 20.0; // Increased for better viewing distance

  function startFlyToAnimation({ 
    lookAtTargetPoint,          // THREE.Vector3: world position of the object to look at
    meshToFollowAfterAnimation, // THREE.Mesh: the object to start following after animation
    baseSizeForOffset          // number: base size of the target for offset calculation
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

    // Determine the direction for the final offset: from target to where camera started animation
    const directionForFinalOffset = new THREE.Vector3().subVectors(camera.position, lookAtTargetPoint);
    if (directionForFinalOffset.lengthSq() < 0.0001) { // Camera is (almost) at the target point
        // Fallback: Use camera's current forward direction, or a default offset like (0,0,1) if needed
        camera.getWorldDirection(directionForFinalOffset); // Get current camera forward
        directionForFinalOffset.negate(); // We want to be behind the target from its perspective
        if (directionForFinalOffset.lengthSq() < 0.0001) { // Still no good (e.g. camera at origin looking at origin)
            directionForFinalOffset.set(0, 0.3, 1); // Default fallback offset direction
        }
    }
    directionForFinalOffset.normalize();

    const finalOffsetVector = directionForFinalOffset.clone().multiplyScalar(offsetDistance);
    cameraAnimationEndPos.copy(lookAtTargetPoint).add(finalOffsetVector);

    // Capture the camera's current position for the start of the animation
    cameraAnimationStartPos.copy(camera.position);
    // const tempWorldDirection = new THREE.Vector3(); // Not needed for P1 calculation this way
    // camera.getWorldDirection(tempWorldDirection); // Not needed for P1 calculation this way
    // cameraAnimationStartLookAt.copy(camera.position).add(tempWorldDirection.multiplyScalar(10)); // Not used

    // Calculate control point P1 for Bezier curve
    const initialCamDir = new THREE.Vector3();
    camera.getWorldDirection(initialCamDir); // Normalized

    const P0 = cameraAnimationStartPos;
    const P2 = cameraAnimationEndPos;

    const P0toP2vec = new THREE.Vector3().subVectors(P2, P0);
    const distP0P2 = P0toP2vec.length();

    const P0toP2norm = P0toP2vec.clone().normalize();
    let sideDir = new THREE.Vector3().crossVectors(initialCamDir, P0toP2norm);

    if (distP0P2 < 0.001) { // If start and end are basically the same, no curve needed
        cameraAnimationControlPoint.copy(P0); // or lerp(P0,P2,0.5)
    } else {
        if (sideDir.lengthSq() < 0.0001) { // initialCamDir is (anti)parallel to P0-P2 direct line
            if (Math.abs(initialCamDir.y) < 0.9) {
                sideDir.crossVectors(initialCamDir, new THREE.Vector3(0, 1, 0));
            } else {
                sideDir.crossVectors(initialCamDir, new THREE.Vector3(1, 0, 0));
            }
        }
        sideDir.normalize();

        const forwardAmount = distP0P2 * 0.4; // How much to initially go "straight"
        const sidewaysAmount = distP0P2 * 0.3; // How much to "loop out"

        cameraAnimationControlPoint.copy(P0)
            .addScaledVector(initialCamDir, forwardAmount)
            .addScaledVector(sideDir, sidewaysAmount);
    }

    // Calculate the position on the Bezier curve at the transition point
    const tTransition = TRANSITION_PROGRESS_POINT;
    const oneMinusTTransition = 1.0 - tTransition;
    const p0CoeffTransition = oneMinusTTransition * oneMinusTTransition;
    const p1CoeffTransition = 2.0 * oneMinusTTransition * tTransition;
    const p2CoeffTransition = tTransition * tTransition;

    cameraAnimationTransitionPointPos.copy(cameraAnimationStartPos).multiplyScalar(p0CoeffTransition)
        .addScaledVector(cameraAnimationControlPoint, p1CoeffTransition)
        .addScaledVector(cameraAnimationEndPos, p2CoeffTransition);

    // Store details for the object to be followed after animation completes
    targetObjectForAnimation = {
        mesh: meshToFollowAfterAnimation,
        baseSize: baseSizeForOffset,
        worldOrientedNormalizedViewDir: directionForFinalOffset.clone() // Use the new dynamic direction
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

      if (progress < TRANSITION_PROGRESS_POINT) {
        // Use Bezier curve for the first part of the animation
        const tBez = progress; // Use original progress for this segment calculation up to transition point
        const oneMinusTBez = 1.0 - tBez;
        const p0CoeffBez = oneMinusTBez * oneMinusTBez;
        const p1CoeffBez = 2.0 * oneMinusTBez * tBez;
        const p2CoeffBez = tBez * tBez;

        camera.position.copy(cameraAnimationStartPos).multiplyScalar(p0CoeffBez)
            .addScaledVector(cameraAnimationControlPoint, p1CoeffBez)
            .addScaledVector(cameraAnimationEndPos, p2CoeffBez);
      } else {
        // Use linear interpolation for the remainder of the animation
        const linearProgress = (progress - TRANSITION_PROGRESS_POINT) / (1.0 - TRANSITION_PROGRESS_POINT);
        camera.position.lerpVectors(cameraAnimationTransitionPointPos, cameraAnimationEndPos, linearProgress);
      }
      
      // Always look at the target body's center
      camera.lookAt(cameraAnimationEndLookAt);

      if (progress === 1.0) {
        isCameraAnimating = false;
        camera.position.copy(cameraAnimationEndPos); // Snap to final position
        camera.lookAt(cameraAnimationEndLookAt);   // Ensure final orientation is correct

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

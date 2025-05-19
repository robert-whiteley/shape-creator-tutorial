// camera/cameraController.js
// Manages camera animations (fly-to) and following logic.

export function initCameraController({
  getCamera,          // Function to get the THREE.Camera instance
  // scaleSliderElement  // The HTML slider element for current visual scale -- REMOVED
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

  const RELATIVE_VIEW_DISTANCE_MULTIPLIER = 2.5; // Target 1.5 radii from surface (2.5 radii from center)

  function startFlyToAnimation({ 
    lookAtTargetPoint,          // THREE.Vector3: world position of the object to look at
    meshToFollowAfterAnimation, // THREE.Mesh: the object to start following after animation
    baseSizeForOffset          // number: base size of the target for offset calculation
  }) {
    const camera = getCamera();
    if (!camera) return;

    cancelAnimationsAndFollowInternal(); // Clear any existing state first

    const initialCameraWorldPos = new THREE.Vector3();
    camera.getWorldPosition(initialCameraWorldPos);

    // Set the final point the camera should be looking at
    cameraAnimationEndLookAt.copy(lookAtTargetPoint);

    // Calculate the camera's final offset position
    const offsetDistance = baseSizeForOffset * RELATIVE_VIEW_DISTANCE_MULTIPLIER;

    // Determine the direction for the final offset: from target to where camera started animation
    const directionForFinalOffset = new THREE.Vector3().subVectors(initialCameraWorldPos, lookAtTargetPoint);
    if (directionForFinalOffset.lengthSq() < 0.0001) { 
        camera.getWorldDirection(directionForFinalOffset); 
        directionForFinalOffset.negate(); 
        if (directionForFinalOffset.lengthSq() < 0.0001) { 
            directionForFinalOffset.set(0, 0.3, 1); 
        }
    }
    directionForFinalOffset.normalize();

    const finalOffsetVector = directionForFinalOffset.clone().multiplyScalar(offsetDistance);
    cameraAnimationEndPos.copy(lookAtTargetPoint).add(finalOffsetVector);

    console.log("--- Fly-to Animation Calculation Values ---");
    console.log("Target Body Center (lookAtTargetPoint):", lookAtTargetPoint.x.toFixed(2), lookAtTargetPoint.y.toFixed(2), lookAtTargetPoint.z.toFixed(2));
    console.log("Camera Start World Pos (initialCameraWorldPos):", initialCameraWorldPos.x.toFixed(2), initialCameraWorldPos.y.toFixed(2), initialCameraWorldPos.z.toFixed(2));
    console.log("Planet Base Size (baseSizeForOffset):", baseSizeForOffset.toFixed(2));
    console.log("RELATIVE_VIEW_DISTANCE_MULTIPLIER:", RELATIVE_VIEW_DISTANCE_MULTIPLIER.toFixed(2));
    console.log("Calculated Offset Distance (offsetDistance):", offsetDistance.toFixed(2));
    console.log("Direction for Final Offset (normalized):", directionForFinalOffset.x.toFixed(2), directionForFinalOffset.y.toFixed(2), directionForFinalOffset.z.toFixed(2));
    console.log("Final Offset Vector (to be added to target center):", finalOffsetVector.x.toFixed(2), finalOffsetVector.y.toFixed(2), finalOffsetVector.z.toFixed(2));
    console.log("Camera Final Destination (cameraAnimationEndPos):", cameraAnimationEndPos.x.toFixed(2), cameraAnimationEndPos.y.toFixed(2), cameraAnimationEndPos.z.toFixed(2));
    console.log("-------------------------------------------");

    // Capture the camera's current world position for the start of the animation
    cameraAnimationStartPos.copy(initialCameraWorldPos);

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

      let calculatedWorldPositionForCamera = new THREE.Vector3();

      // Restore Original Bezier/Linear Path Logic
      if (progress < TRANSITION_PROGRESS_POINT) {
        // Use Bezier curve for the first part of the animation
        const tBez = progress; 
        const oneMinusTBez = 1.0 - tBez;
        const p0CoeffBez = oneMinusTBez * oneMinusTBez;
        const p1CoeffBez = 2.0 * oneMinusTBez * tBez;
        const p2CoeffBez = tBez * tBez;

        calculatedWorldPositionForCamera.copy(cameraAnimationStartPos).multiplyScalar(p0CoeffBez)
            .addScaledVector(cameraAnimationControlPoint, p1CoeffBez)
            .addScaledVector(cameraAnimationEndPos, p2CoeffBez);
      } else {
        // Use linear interpolation for the remainder of the animation
        const linearProgress = (progress - TRANSITION_PROGRESS_POINT) / (1.0 - TRANSITION_PROGRESS_POINT);
        calculatedWorldPositionForCamera.lerpVectors(cameraAnimationTransitionPointPos, cameraAnimationEndPos, linearProgress);
      }

      // Convert target world position to parent's local space and set camera.position
      if (camera.parent) {
        camera.parent.worldToLocal(camera.position.copy(calculatedWorldPositionForCamera));
      } else {
        camera.position.copy(calculatedWorldPositionForCamera);
      }
      // Update matrix world for the camera after changing its local position, 
      // so subsequent lookAt uses the correct new world position of the camera.
      camera.updateMatrixWorld(true); 
      
      // Always look at the target body's center
      camera.lookAt(cameraAnimationEndLookAt);

      if (progress === 1.0) {
        isCameraAnimating = false;
        // Final snap: Convert world end position to parent's local space
        if (camera.parent) {
            camera.parent.worldToLocal(camera.position.copy(cameraAnimationEndPos));
        } else {
            camera.position.copy(cameraAnimationEndPos);
        }
        camera.updateMatrixWorld(true);
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

      // const currentScale = parseInt(scaleSliderElement.value) || 1; // OLD WAY
      const currentScale = (followedObject.mesh.userData && typeof followedObject.mesh.userData.currentVisualScaleFactor === 'number') 
                            ? followedObject.mesh.userData.currentVisualScaleFactor 
                            : 1.0;
      const visualActualSize = followedObject.baseSize * currentScale;
      const newOffsetDistance = visualActualSize * RELATIVE_VIEW_DISTANCE_MULTIPLIER;
      
      const currentOffsetVector = followedObject.worldOrientedNormalizedViewDir.clone().multiplyScalar(newOffsetDistance);
      const desiredCameraPosition = tempWorldPos.clone().add(currentOffsetVector);

      // Smoothly interpolate camera position towards the desired tracking position
      // Convert desiredCameraPosition (world) to camera.parent's local space for LERP
      if (camera.parent) {
        const localDesiredCameraPosition = new THREE.Vector3();
        camera.parent.worldToLocal(localDesiredCameraPosition.copy(desiredCameraPosition));
        camera.position.lerp(localDesiredCameraPosition, 0.1); 
      } else {
        camera.position.lerp(desiredCameraPosition, 0.1); 
      }
      camera.updateMatrixWorld(true); // Ensure matrix is updated before lookAt
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

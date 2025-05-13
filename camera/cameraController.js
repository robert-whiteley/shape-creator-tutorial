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

  const RELATIVE_VIEW_DISTANCE_MULTIPLIER = 4.0;

  function startFlyToAnimation({ 
    lookAtTargetPoint,          // THREE.Vector3: world position of the object to look at
    meshToFollowAfterAnimation, // THREE.Mesh: the object to start following after animation
    baseSizeForOffset,          // number: base size of the target for offset calculation
    worldOrientedNormalizedViewDir // THREE.Vector3: pre-calculated view direction for offset
  }) {
    const camera = getCamera();
    if (!camera) return;

    cancelAnimationsAndFollowInternal(); // Clear any existing state first

    cameraAnimationEndLookAt.copy(lookAtTargetPoint);

    const currentScale = parseInt(scaleSliderElement.value) || 1;
    const visualActualSize = baseSizeForOffset * currentScale;
    const offsetDistance = visualActualSize * RELATIVE_VIEW_DISTANCE_MULTIPLIER;

    const finalOffsetVector = worldOrientedNormalizedViewDir.clone().multiplyScalar(offsetDistance);
    cameraAnimationEndPos.copy(lookAtTargetPoint).add(finalOffsetVector);

    cameraAnimationStartPos.copy(camera.position);

    const tempLookAtVec = new THREE.Vector3();
    camera.getWorldDirection(tempLookAtVec).multiplyScalar(10).add(camera.position); 
    cameraAnimationStartLookAt.copy(tempLookAtVec);

    targetObjectForAnimation = {
        mesh: meshToFollowAfterAnimation,
        baseSize: baseSizeForOffset,
        worldOrientedNormalizedViewDir: worldOrientedNormalizedViewDir
    };
    isCameraAnimating = true;
    animationStartTime = Date.now();
  }

  function cancelAnimationsAndFollowInternal() {
    isCameraAnimating = false;
    followedObject = null;
    targetObjectForAnimation = null;
  }

  function updateCamera() {
    const camera = getCamera();
    if (!camera) return;

    const tempWorldPos = new THREE.Vector3(); // For reuse
    const tempLookAt = new THREE.Vector3();   // For reuse

    if (isCameraAnimating) {
      const elapsed = Date.now() - animationStartTime;
      let progress = Math.min(elapsed / ANIMATION_DURATION, 1.0);
      progress = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2; // Ease in-out quad

      camera.position.lerpVectors(cameraAnimationStartPos, cameraAnimationEndPos, progress);
      tempLookAt.lerpVectors(cameraAnimationStartLookAt, cameraAnimationEndLookAt, progress);
      camera.lookAt(tempLookAt);

      if (progress === 1.0) {
        isCameraAnimating = false;
        if (targetObjectForAnimation) {
          followedObject = targetObjectForAnimation;
          targetObjectForAnimation = null;
        }
      }
    } else if (followedObject && followedObject.mesh && followedObject.worldOrientedNormalizedViewDir) {
      followedObject.mesh.getWorldPosition(tempWorldPos);

      const currentScale = parseInt(scaleSliderElement.value) || 1;
      const visualActualSize = followedObject.baseSize * currentScale;
      const newOffsetDistance = visualActualSize * RELATIVE_VIEW_DISTANCE_MULTIPLIER;
      const currentOffsetVector = followedObject.worldOrientedNormalizedViewDir.clone().multiplyScalar(newOffsetDistance);

      camera.position.copy(tempWorldPos).add(currentOffsetVector);
      camera.lookAt(tempWorldPos);
    }
  }

  return {
    startFlyToAnimation,
    cancelAnimationsAndFollow: cancelAnimationsAndFollowInternal,
    updateCamera
  };
} 
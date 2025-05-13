// gestures/gestureController.js
// Handles interpretation of hand gestures for controlling the solar system view.

export function initGestureController({
  getCamera,      // function to get the Three.js camera instance
  solarSystemGroup, // The main THREE.Group for the solar system
  cameraControls, // Object with { cancelAnimationsAndFollow() }
  isPinch,        // function from gestures/hands.js: (landmarks) => boolean
  ctx             // 2D canvas context for drawing landmarks (optional)
}) {

  // Gesture state variables formerly in main.js
  let gestureInitialQuaternion = null;
  let gestureInitialTwoHandAngle = null;
  let gestureInitialTwoHandMidY = null;
  let gestureInitialTwoHandMidX = null;
  let lastTwoHandDistance = null;
  let livePreviousPinchDistance = null;
  let lastPanPosition = null;

  // This function is the equivalent of the old handleHandResults
  function processHandResults(results) {
    if (ctx && ctx.canvas) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        for (const landmarks of results.multiHandLandmarks) {
            const drawCircle = (landmark) => {
            ctx.beginPath();
            ctx.arc(landmark.x * ctx.canvas.width, landmark.y * ctx.canvas.height, 10, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(0, 255, 255, 0.7)';
            ctx.fill();
            };
            drawCircle(landmarks[4]); // Thumb tip
            drawCircle(landmarks[8]); // Index tip
        }
    }

    // Two-hand pinch for rotation (Y, X, Z) and scaling/zooming
    if (results.multiHandLandmarks.length === 2) {
      const [l, r] = results.multiHandLandmarks;
      const leftPinch = isPinch(l);
      const rightPinch = isPinch(r);
      if (leftPinch && rightPinch) {
        cameraControls.cancelAnimationsAndFollow();
        const camera = getCamera();
        const dx = r[8].x - l[8].x;
        const dy = r[8].y - l[8].y;
        const angle = Math.atan2(dy, dx);
        const distance = Math.hypot(dx, dy);
        const midY = (l[8].y + r[8].y) / 2;
        const midX = (l[8].x + r[8].x) / 2;

        if (gestureInitialTwoHandAngle === null) {
          gestureInitialQuaternion = solarSystemGroup.quaternion.clone();
          gestureInitialTwoHandAngle = angle;
          gestureInitialTwoHandMidY = midY;
          gestureInitialTwoHandMidX = midX;
          lastTwoHandDistance = distance;
          livePreviousPinchDistance = distance;
        } else {
          const totalDeltaAngleY = angle - gestureInitialTwoHandAngle;
          const totalDeltaMidY = midY - gestureInitialTwoHandMidY;
          const totalDeltaMidX = midX - gestureInitialTwoHandMidX;

          let newQuaternion = gestureInitialQuaternion.clone();

          const rotY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), totalDeltaAngleY);
          newQuaternion.premultiply(rotY);

          const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
          const rotationAmountX = -totalDeltaMidY * 4.0;
          const rotX = new THREE.Quaternion().setFromAxisAngle(cameraRight, rotationAmountX);
          newQuaternion.premultiply(rotX);

          const rotationAmountZ = -totalDeltaMidX * 4.0;
          const rotZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rotationAmountZ);
          newQuaternion.multiply(rotZ);
          
          solarSystemGroup.quaternion.copy(newQuaternion);

          if (livePreviousPinchDistance !== null) {
            const pinchDiff = distance - livePreviousPinchDistance;
            const DOLLY_SENSITIVITY = 25;
            const currentCameraDistanceToGroup = camera.position.distanceTo(solarSystemGroup.position);
            const adaptiveDollySensitivityFactor = Math.max(0.1, currentCameraDistanceToGroup / 20.0);
            const adaptiveDollySensitivity = DOLLY_SENSITIVITY * adaptiveDollySensitivityFactor;
            const dollyAmount = pinchDiff * adaptiveDollySensitivity;
            const viewDirection = camera.getWorldDirection(new THREE.Vector3());
            camera.position.addScaledVector(viewDirection, dollyAmount);
          }
          livePreviousPinchDistance = distance;
        }
        return; // Processed two-hand gesture
      }
    }

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length < 2 || 
        !(isPinch(results.multiHandLandmarks[0]) && isPinch(results.multiHandLandmarks[1]))) {
      gestureInitialQuaternion = null;
      gestureInitialTwoHandAngle = null;
      gestureInitialTwoHandMidY = null;
      gestureInitialTwoHandMidX = null;
      lastTwoHandDistance = null;
      livePreviousPinchDistance = null;
    }

    // One-hand pinch for panning
    if (results.multiHandLandmarks.length > 0) {
      let pinchDetected = false;
      for (const landmarks of results.multiHandLandmarks) {
        if (isPinch(landmarks)) {
          cameraControls.cancelAnimationsAndFollow();
          pinchDetected = true;
          const indexTip = landmarks[8];
          const PAN_SENSITIVITY = 10;

          if (lastPanPosition === null) {
            lastPanPosition = { x: indexTip.x, y: indexTip.y };
          } else {
            const deltaX = indexTip.x - lastPanPosition.x;
            const deltaY = indexTip.y - lastPanPosition.y;
            const camera = getCamera();
            const camRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
            const camUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
            const currentCameraDistanceToGroup = camera.position.distanceTo(solarSystemGroup.position);
            const panScaleFactor = Math.max(0.1, currentCameraDistanceToGroup / 10.0);
            solarSystemGroup.position.addScaledVector(camRight, deltaX * PAN_SENSITIVITY * panScaleFactor);
            solarSystemGroup.position.addScaledVector(camUp, -deltaY * PAN_SENSITIVITY * panScaleFactor);
            lastPanPosition = { x: indexTip.x, y: indexTip.y };
          }
          break; 
        }
      }
      if (!pinchDetected) {
        lastPanPosition = null;
      }
    } else {
      lastPanPosition = null;
    }
  }

  return processHandResults; // Return the function to be used as callback
} 
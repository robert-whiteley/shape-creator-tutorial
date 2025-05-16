// gestures/gestureController.js
// Handles interpretation of hand gestures for controlling the solar system view.

export function initGestureController({
  getCamera,      // function to get the Three.js camera instance
  yawObject, // FPS yaw group
  pitchObject, // FPS pitch group
  isPinch,        // function from gestures/hands.js: (landmarks) => boolean
  ctx             // 2D canvas context for drawing landmarks (optional)
}) {

  // First-person camera state
  let fpYaw = 0;
  let fpPitch = 0;
  const PITCH_LIMIT = Math.PI / 2 - 0.01;
  let gesturePreviousTwoHandAngle = null;
  let gesturePreviousTwoHandMidY = null;
  let gesturePreviousTwoHandMidX = null;
  let lastTwoHandDistance = null;
  let livePreviousPinchDistance = null;
  let lastPanPosition = null;

  // Debug: visualize the focal point
  let debugFocalSphere = null;
  function updateDebugFocalPoint(camera) {
    if (!window.getScene) return;
    const scene = window.getScene();
    if (!debugFocalSphere) {
      const geometry = new THREE.SphereGeometry(100, 16, 16);
      const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      debugFocalSphere = new THREE.Mesh(geometry, material);
      scene.add(debugFocalSphere);
    }
    // Compute the point 1,000 units in front of the camera
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const pos = camera.getWorldPosition(new THREE.Vector3());
    dir.multiplyScalar(1000);
    debugFocalSphere.position.copy(pos).add(dir);
  }

  function processHandResults(results) {
    // Always update debug focal point
    updateDebugFocalPoint(getCamera());
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

    // Two-hand pinch for rotation (yaw, pitch) and dolly (forward/back)
    if (results.multiHandLandmarks.length === 2) {
      const [l, r] = results.multiHandLandmarks;
      const leftPinch = isPinch(l);
      const rightPinch = isPinch(r);
      if (leftPinch && rightPinch) {
        const camera = getCamera();
        const dx = r[8].x - l[8].x;
        const dy = r[8].y - l[8].y;
        const distance = Math.hypot(dx, dy);
        const midY = (l[8].y + r[8].y) / 2;
        const midX = (l[8].x + r[8].x) / 2;

        if (gesturePreviousTwoHandMidX === null) {
          gesturePreviousTwoHandMidY = midY;
          gesturePreviousTwoHandMidX = midX;
          livePreviousPinchDistance = distance;
        } else {
          // Calculate deltas in screen space
          const deltaX = midX - gesturePreviousTwoHandMidX;
          const deltaY = midY - gesturePreviousTwoHandMidY;
          const deltaDist = distance - livePreviousPinchDistance;

          // Yaw (left/right): rotate around local Y
          if (yawObject) {
            yawObject.rotation.y -= deltaX * 5.0; // Inverted: moving hands right rotates camera left
          }
          // Pitch (up/down): rotate around local X
          if (pitchObject) {
            pitchObject.rotation.x -= deltaY * 5.0;
            // Clamp pitch to avoid flipping
            const PITCH_LIMIT = Math.PI / 2 - 0.01;
            pitchObject.rotation.x = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitchObject.rotation.x));
          }
          // Zoom (dolly): move forward/back along local Z
          if (yawObject) {
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(yawObject.quaternion).normalize();
            yawObject.position.addScaledVector(forward, -deltaDist * 1000); // Negative so pinch out = zoom in
          }

          gesturePreviousTwoHandMidY = midY;
          gesturePreviousTwoHandMidX = midX;
          livePreviousPinchDistance = distance;
        }
        // After applying rotation, update debug focal point
        updateDebugFocalPoint(camera);
        return; // Processed two-hand gesture
      }
    } else {
      gesturePreviousTwoHandMidY = null;
      gesturePreviousTwoHandMidX = null;
      livePreviousPinchDistance = null;
    }

    // One-hand pinch for panning (optional, can be disabled)
    if (results.multiHandLandmarks.length > 0) {
      let pinchDetected = false;
      for (const landmarks of results.multiHandLandmarks) {
        if (isPinch(landmarks)) {
          pinchDetected = true;
          const indexTip = landmarks[8];
          const PAN_SENSITIVITY = 10;

          if (lastPanPosition === null) {
            lastPanPosition = { x: indexTip.x, y: indexTip.y };
          } else {
            const deltaX = indexTip.x - lastPanPosition.x;
            const deltaY = indexTip.y - lastPanPosition.y;
            if (yawObject) {
              const right = new THREE.Vector3(1, 0, 0).applyEuler(yawObject.rotation);
              const up = new THREE.Vector3(0, 1, 0);
              yawObject.position.addScaledVector(right, deltaX * PAN_SENSITIVITY * 100);
              yawObject.position.addScaledVector(up, -deltaY * PAN_SENSITIVITY * 100);
            }
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
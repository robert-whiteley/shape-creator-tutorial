// Camera & Video Setup Module
// Handles webcam initialization and MediaPipe Camera logic

// Expects MediaPipe Camera to be loaded globally (e.g., via <script> or import)
// If using as a module, import Camera from '@mediapipe/camera_utils';

export async function initCamera({ video, canvas, hands, onFrame }) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
  video.srcObject = stream;
  await new Promise(resolve => video.onloadedmetadata = resolve);
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  new Camera(video, {
    onFrame: async () => {
      if (onFrame) {
        await onFrame();
      } else if (hands) {
        await hands.send({ image: video });
      }
    },
    width: video.videoWidth,
    height: video.videoHeight
  }).start();
} 
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

  interface Props {
    exerciseName: string;
    description: string;
    reps?: string;
    duration?: string;
    onProgress: (progress: number) => void;
    onComplete: () => void;
    onClose: () => void;
  }

  let { exerciseName, description, reps, duration, onProgress, onComplete, onClose }: Props = $props();

  let videoElement: HTMLVideoElement | null = $state(null);
  let canvasElement: HTMLCanvasElement | null = $state(null);
  let canvasCtx: CanvasRenderingContext2D | null = $state(null);

  let poseLandmarker: PoseLandmarker | null = null;
  let webcamRunning = $state(false);
  let trackingProgress = $state(0);
  let hasCompleted = $state(false);
  let feedbackMessage = $state("Please step into the frame.");
  let isPostureCorrect = $state(false);

  let stream: MediaStream | null = null;
  let animationFrameId: number;
  let timerInterval: any = null;

  // Time & Session variables
  let totalTime = $state(30);
  let timeLeft = $state(30);
  let speechTimer = 0;

  const goodMotivations = ["Perfect.", "Keep it up.", "Looking good.", "Hold that pose.", "Great form."];
  const correctionPhrases = ["Adjust your posture.", "Please stretch more.", "Move further.", "I am waiting."];

  onMount(async () => {
    let foundTime = 30; // default time fallback
    
    if (duration) {
      const durMatch = duration.match(/(\d+)\s*(sec|min|m|s)/i);
      if (durMatch) {
         foundTime = durMatch[2].toLowerCase().startsWith('m') ? parseInt(durMatch[1]) * 60 : parseInt(durMatch[1]);
      } else {
         const durVal = parseInt(duration);
         if (!isNaN(durVal)) foundTime = durVal;
      }
    } else {
      const descMatch = description.match(/(\d+)\s*(sec|min)/i);
      if (descMatch) {
         foundTime = descMatch[2].toLowerCase().startsWith('m') ? parseInt(descMatch[1]) * 60 : parseInt(descMatch[1]);
      } else if (reps) {
        const repMatch = reps.match(/(\d+)/);
        if (repMatch) foundTime = parseInt(repMatch[1]) * 4; // 4 secs per rep approx
      }
    }
    
    totalTime = foundTime;
    timeLeft = foundTime;

    if (canvasElement) {
      canvasCtx = canvasElement.getContext('2d', { alpha: false }); // Boosts performance and clarity
    }
    speakInstruction(`Starting ${exerciseName}. ${description}`);
    await initTracker();
  });

  onDestroy(() => {
    stopTracker();
    window.speechSynthesis.cancel();
  });

  function speakInstruction(text: string) {
    if (!window.speechSynthesis) return;
    if (window.speechSynthesis.speaking) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  }

  async function initTracker() {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.5/wasm'
      );
      poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
          delegate: 'CPU' 
        },
        runningMode: 'VIDEO',
        numPoses: 1
      });
      startCamera();
    } catch (e) {
      console.error("Failed to init tracking", e);
      speakInstruction("Failed to initialize camera tracker.");
    }
  }

  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } } });
      if (videoElement) {
        videoElement.srcObject = stream;
        videoElement.play();
        webcamRunning = true;
        
        videoElement.addEventListener("loadeddata", () => {
           predictWebcam();
           startTimer();
        });
      }
    } catch (e) {
      console.error("Camera error", e);
      speakInstruction("Could not access your camera.");
    }
  }

  function stopTracker() {
    webcamRunning = false;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (timerInterval) clearInterval(timerInterval);
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    if (poseLandmarker) {
      poseLandmarker.close();
    }
  }

  function startTimer() {
    timerInterval = setInterval(() => {
      if (!webcamRunning || hasCompleted) return;
      speechTimer++;

      if (isPostureCorrect && timeLeft > 0) {
        timeLeft--;
        trackingProgress = ((totalTime - timeLeft) / totalTime) * 100;
        onProgress(trackingProgress);
        
        if (speechTimer % 7 === 0 && timeLeft > 5) {
          speakInstruction(goodMotivations[Math.floor(Math.random() * goodMotivations.length)]);
        }

        if (timeLeft <= 0) {
          isPostureCorrect = false;
          hasCompleted = true;
          trackingProgress = 100;
          onProgress(100);
          onComplete();
          speakInstruction("Great job! You have completed this exercise.");
        }
      } else if (!isPostureCorrect && timeLeft > 0) {
        if (speechTimer % 6 === 0) {
          speakInstruction(correctionPhrases[Math.floor(Math.random() * correctionPhrases.length)]);
        }
      }
    }, 1000);
  }

  function checkPosture(landmarks: any, isMoving: boolean): { correct: boolean; msg: string } {
    let name = exerciseName.toLowerCase();
    let desc = description.toLowerCase();
    let text = name + " " + desc;

    const leftEar = landmarks[7];
    const rightEar = landmarks[8];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];

    let requireMotion = text.includes("rotate") || text.includes("circle") || text.includes("march") || text.includes("roll");

    if (text.includes("neck") && (text.includes("tilt") || text.includes("bend"))) {
        if (Math.abs(leftEar.y - leftShoulder.y) < 0.12 || Math.abs(rightEar.y - rightShoulder.y) < 0.12) {
            return { correct: true, msg: "Good neck tilt." };
        } else return { correct: false, msg: "Tilt head sideways." };
    } 
    else if (text.includes("neck") || text.includes("look")) {
        if (Math.abs(landmarks[0].x - leftShoulder.x) < 0.05 || Math.abs(landmarks[0].x - rightShoulder.x) < 0.05) {
            if (requireMotion && !isMoving) return { correct: false, msg: "Keep rotating your head." };
            return { correct: true, msg: "Good rotation." };
        } else return { correct: false, msg: "Turn head left/right." };
    } 
    else if (text.includes("shrug") || text.includes("shoulder roll")) {
        if (leftShoulder.y < leftEar.y + 0.12) {
            if (requireMotion && !isMoving) return { correct: false, msg: "Keep rolling them!" };
            return { correct: true, msg: "Good lift." };
        } else return { correct: false, msg: "Roll or lift shoulders." };
    } 
    else if (text.includes("arm") && (text.includes("up") || text.includes("overhead") || text.includes("raise"))) {
        if (leftWrist.y < leftShoulder.y && rightWrist.y < rightShoulder.y) {
            return { correct: true, msg: "Perfect reach!" };
        } else return { correct: false, msg: "Raise arms up." };
    } 
    else if (text.includes("chest") || text.includes("open")) {
        if (Math.abs(leftWrist.x - rightWrist.x) > Math.abs(leftShoulder.x - rightShoulder.x) + 0.1) {
            return { correct: true, msg: "Great chest opening." };
        } else return { correct: false, msg: "Pull arms wide." };
    } 
    else if (text.includes("side") && text.includes("bend")) {
        if (Math.abs(leftShoulder.x - leftHip.x) > 0.08 || Math.abs(rightShoulder.x - rightHip.x) > 0.08) {
            return { correct: true, msg: "Good side bend." };
        } else return { correct: false, msg: "Lean sideways." };
    } 
    else if (text.includes("twist") || text.includes("rotate")) {
        if (Math.abs(leftShoulder.x - rightShoulder.x) < 0.13) {
            if (requireMotion && !isMoving) return { correct: false, msg: "Keep twisting actively!" };
            return { correct: true, msg: "Nice twist." };
        } else return { correct: false, msg: "Twist body." };
    } 
    else if (text.includes("arm") && text.includes("circle")) {
        if (Math.abs(leftWrist.x - rightWrist.x) > 0.3) {
            if (!isMoving) return { correct: false, msg: "Draw active circles!" };
            return { correct: true, msg: "Good wide circles." };
        } else return { correct: false, msg: "Draw circles with arms." };
    }
    else if (text.includes("forward bend") || text.includes("touch toes")) {
        if (leftShoulder.y > leftHip.y - 0.25) {
            return { correct: true, msg: "Good forward bend." };
        } else return { correct: false, msg: "Bend forward." };
    } 
    else if (text.includes("back") && text.includes("arch")) {
        if (leftWrist.y > leftHip.y - 0.1) {
            return { correct: true, msg: "Gentle back arch." };
        } else return { correct: false, msg: "Lean back slightly." };
    }
    else if (text.includes("knee") || text.includes("leg raise") || text.includes("march")) {
        if (leftKnee.y < leftHip.y + 0.1 || rightKnee.y < rightHip.y + 0.1) {
            return { correct: true, msg: "Good knee raise." };
        } else return { correct: false, msg: "Lift knee up." };
    } 
    else if (text.includes("calf") || text.includes("heel raise")) {
        // Just assume movement is good for calves since it's hard to track feet precisely without full body
        let ankleShift = Math.abs(landmarks[27].y - landmarks[25].y);
        if (ankleShift > 0.01) return { correct: true, msg: "Rise on toes." };
        return { correct: false, msg: "Rise on toes." };
    }
    else {
        // Generic fallback: check if they are generally moving or holding a slightly active pose
        if (requireMotion && !isMoving) {
            return { correct: false, msg: "Please keep moving actively." };
        }
        if (Math.abs(leftWrist.y - leftShoulder.y) > 0.1 || Math.abs(leftKnee.y - leftHip.y) > 0.1 || isMoving) {
          return { correct: true, msg: "Keep going." };
        }
        return { correct: false, msg: "Perform the exercise movement." };
    }
  }

  let lastVideoTime = -1;
  let previousLandmarks: any = null;

  async function predictWebcam() {
    if (!webcamRunning || !videoElement || !canvasElement || !poseLandmarker || hasCompleted) return;

    if (canvasElement.width !== videoElement.videoWidth) {
      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;
    }

    let startTimeMs = performance.now();
    if (lastVideoTime !== videoElement.currentTime) {
      lastVideoTime = videoElement.currentTime;
      const results = poseLandmarker.detectForVideo(videoElement, startTimeMs);

      if (canvasCtx) {
        canvasCtx.save();
        // Draw the raw HD camera feed
        canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

        if (results.landmarks && results.landmarks.length > 0) {
          const landmarks = results.landmarks[0];
          const nose = landmarks[0];

          let inFrame = nose.visibility > 0.6;
          
          if (!inFrame) {
            feedbackMessage = "Please step into the camera view.";
            isPostureCorrect = false;
          } else {
            // Check active motion
            let isMoving = false;
            if (previousLandmarks) {
               let motion = 0;
               for(let i of [11, 12, 15, 16, 23, 24, 25, 26]) {
                  if (landmarks[i] && previousLandmarks[i]) {
                     motion += Math.abs(landmarks[i].x - previousLandmarks[i].x) + Math.abs(landmarks[i].y - previousLandmarks[i].y);
                  }
               }
               // Normalizing motion threshold
               isMoving = motion > 0.02;
            }
            previousLandmarks = landmarks;

            // Check heuristic
            const check = checkPosture(landmarks, isMoving);
            isPostureCorrect = check.correct;
            feedbackMessage = check.msg;

            // DRAW HIGHLIGHT TARGET PERSON (FACE RING + COUNT)
            const cx = nose.x * canvasElement.width;
            const cy = nose.y * canvasElement.height;
            const ringColor = isPostureCorrect ? "#22c55e" : "#eab308"; // Green if correct, Yellow if paused

            canvasCtx.beginPath();
            canvasCtx.arc(cx, cy, 60, 0, 2 * Math.PI);
            canvasCtx.lineWidth = 6;
            canvasCtx.strokeStyle = ringColor;
            canvasCtx.stroke();

            canvasCtx.fillStyle = "rgba(0, 0, 0, 0.6)";
            canvasCtx.roundRect(cx - 35, cy - 110, 70, 35, 8);
            canvasCtx.fill();

            canvasCtx.fillStyle = ringColor;
            canvasCtx.font = "bold 22px sans-serif";
            canvasCtx.fillText("👤 1", cx - 22, cy - 85);
          }
        } else {
          isPostureCorrect = false;
          feedbackMessage = "No person detected in frame.";
        }
        canvasCtx.restore();
      }
    }

    if (!hasCompleted) {
      animationFrameId = requestAnimationFrame(predictWebcam);
    }
  }
</script>

<div class="relative w-full overflow-hidden rounded-xl bg-black border border-border mt-3 animate-fade-in aspect-video shadow-[0_5px_20px_rgba(0,0,0,0.5)] {isPostureCorrect ? 'border-accent-green' : 'border-accent-amber'} transition-colors duration-300 border-4">
  <!-- svelte-ignore a11y_media_has_caption -->
  <video 
    bind:this={videoElement} 
    class="w-full h-full object-cover hidden" 
    playsinline 
    muted
  ></video>
  
  <canvas 
    bind:this={canvasElement}
    class="absolute top-0 left-0 w-full h-full object-cover pointer-events-none transform -scale-x-100"
  ></canvas>

  {#if !webcamRunning}
    <div class="absolute inset-0 flex items-center justify-center text-white flex-col bg-[#0b1120]">
      <svg class="animate-spin h-8 w-8 mb-3 text-teal-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span class="text-sm font-medium tracking-wide">Starting High-Res Tracker...</span>
    </div>
  {/if}

  <!-- Timer Badge -->
  {#if webcamRunning && !hasCompleted}
    <div class="absolute top-4 right-4 bg-black/80 backdrop-blur px-6 py-3 rounded-xl border-2 {isPostureCorrect ? 'border-accent-green text-accent-green' : 'border-accent-amber text-accent-amber'} text-center shadow-lg transition-colors">
      <div class="text-[10px] uppercase tracking-wider font-bold mb-0.5">{isPostureCorrect ? 'COUNTING' : 'PAUSED'}</div>
      <div class="text-3xl font-black">{timeLeft < 10 ? '0'+timeLeft : timeLeft}</div>
    </div>
  {/if}

  {#if webcamRunning && !hasCompleted}
    <div class="absolute bottom-16 left-0 right-0 flex justify-center pointer-events-none">
      <div class="bg-gray-900/90 backdrop-blur border-b-4 {isPostureCorrect ? 'border-accent-green text-accent-green' : 'border-accent-amber text-white'} px-6 py-3 rounded-xl text-lg font-bold shadow-2xl transition-colors">
        {feedbackMessage}
      </div>
    </div>
  {/if}

  <!-- Overlay UI Progress bar area -->
  <div class="absolute bottom-4 left-4 right-4 flex items-center gap-3">
    <div class="w-full bg-black/70 backdrop-blur rounded-full h-3 overflow-hidden flex-1 border border-white/20">
      <div class="{isPostureCorrect ? 'bg-accent-green' : 'bg-accent-amber'} h-full transition-all duration-300" style="width: {trackingProgress}%"></div>
    </div>
    <span class="text-white text-xs font-bold drop-shadow-md">{Math.floor(trackingProgress)}%</span>
    <button class="bg-red-500 hover:bg-red-600 text-white rounded-full p-2.5 shadow-lg transition-colors" onclick={onClose} aria-label="Stop Tracking">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  </div>
  
  {#if hasCompleted}
    <div class="absolute inset-0 bg-accent-green/30 backdrop-blur-sm flex items-center justify-center flex-col animate-fade-in z-50">
      <div class="w-20 h-20 bg-accent-green rounded-full flex items-center justify-center text-white mb-4 shadow-[0_0_30px_rgba(34,197,94,0.6)]">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
      </div>
      <h3 class="text-white font-extrabold text-3xl drop-shadow-lg tracking-wide shadow-black">EXERCISE COMPLETE!</h3>
    </div>
  {/if}
</div>

<svelte:window onbeforeunload={stopTracker} />

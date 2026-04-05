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

  // Rep counting
  let targetReps = $state(0);
  let completedReps = $state(0);
  let useRepMode = $state(false); // true = count reps; false = count time (hold exercises)
  let repPhase = $state<'neutral' | 'peak'>('neutral'); // two-phase rep detection state machine
  let phaseHoldFrames = 0;      // frames spent in the current phase
  const PHASE_HOLD_REQUIRED = 8; // must stay in the new phase for N frames before it counts

  const goodMotivations = ["Perfect rep!", "Keep it up!", "Looking good.", "Hold that pose.", "Great form!", "One more!"];
  const correctionPhrases = ["Perform the exercise.", "I don't see any movement.", "Please do the exercise.", "Move actively."];

  // ─── Exercise type classifier ─────────────────────────────────────────────
  type ExerciseKind =
    | 'neck_tilt'
    | 'neck_rotation'
    | 'shoulder_shrug'
    | 'arm_raise'
    | 'arm_circle'
    | 'chest_open'
    | 'side_bend'
    | 'trunk_twist'
    | 'forward_bend'
    | 'knee_raise'
    | 'heel_raise'
    | 'hold'; // generic hold / breathing

  function classifyExercise(): ExerciseKind {
    const t = (exerciseName + ' ' + description).toLowerCase();
    if ((t.includes('neck') || t.includes('head')) && (t.includes('tilt') || t.includes('bend') || t.includes('side'))) return 'neck_tilt';
    if ((t.includes('neck') || t.includes('head')) && (t.includes('rotat') || t.includes('turn') || t.includes('look'))) return 'neck_rotation';
    if (t.includes('shrug') || (t.includes('shoulder') && t.includes('roll'))) return 'shoulder_shrug';
    if (t.includes('arm circle')) return 'arm_circle';
    if (t.includes('arm') && (t.includes('raise') || t.includes('up') || t.includes('overhead') || t.includes('lift'))) return 'arm_raise';
    if (t.includes('chest') && (t.includes('open') || t.includes('stretch') || t.includes('expand'))) return 'chest_open';
    if (t.includes('side') && (t.includes('bend') || t.includes('stretch'))) return 'side_bend';
    if (t.includes('twist') || (t.includes('trunk') && t.includes('rotat')) || t.includes('torso rotat')) return 'trunk_twist';
    if (t.includes('forward bend') || t.includes('touch toe') || t.includes('toe touch')) return 'forward_bend';
    if (t.includes('knee') || t.includes('leg raise') || t.includes('march')) return 'knee_raise';
    if (t.includes('calf') || t.includes('heel raise') || t.includes('toe raise')) return 'heel_raise';
    return 'hold';
  }

  // ─── Per-exercise movement detection ─────────────────────────────────────
  // Returns:
  //   phase: 'neutral' | 'peak'  — which phase of movement the person is in
  //   correct: boolean            — are they doing the right shape for this phase?
  //   msg: string
  function detectMovementPhase(
    lm: any,
    currentPhase: 'neutral' | 'peak',
    kind: ExerciseKind
  ): { phase: 'neutral' | 'peak'; correct: boolean; msg: string } {

    const nose        = lm[0];
    const leftEar     = lm[7];
    const rightEar    = lm[8];
    const leftShoulder  = lm[11];
    const rightShoulder = lm[12];
    const leftElbow   = lm[13];
    const rightElbow  = lm[14];
    const leftWrist   = lm[15];
    const rightWrist  = lm[16];
    const leftHip     = lm[23];
    const rightHip    = lm[24];
    const leftKnee    = lm[25];
    const rightKnee   = lm[26];
    const leftAnkle   = lm[27];
    const rightAnkle  = lm[28];

    const midShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const midShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
    const midHipY = (leftHip.y + rightHip.y) / 2;

    switch (kind) {
      // ── Neck Tilt (head side-to-side) ─────────────────────────────────
      case 'neck_tilt': {
        // Neutral: head roughly centred (nose X close to shoulder mid)
        // Peak: clear head tilt — nose drops/rises relative to ears asymmetrically
        const noseToMidX = Math.abs(nose.x - midShoulderX);
        const earAsymmetry = Math.abs(leftEar.y - rightEar.y); // big when tilted

        if (currentPhase === 'neutral') {
          // Looking for a tilt START: ear asymmetry must be large
          if (earAsymmetry > 0.07) {
            return { phase: 'peak', correct: true, msg: 'Good tilt — hold it!' };
          }
          return { phase: 'neutral', correct: false, msg: 'Tilt head to one side.' };
        } else {
          // At peak — must return to centre
          if (earAsymmetry < 0.03 && noseToMidX < 0.06) {
            return { phase: 'neutral', correct: true, msg: 'Back to centre — rep counted!' };
          }
          return { phase: 'peak', correct: true, msg: 'Good — now return to centre.' };
        }
      }

      // ── Neck Rotation (chin turns left/right) ──────────────────────────
      case 'neck_rotation': {
        const noseToMidX = nose.x - midShoulderX; // positive = right, negative = left
        const absOffset = Math.abs(noseToMidX);

        if (currentPhase === 'neutral') {
          if (absOffset > 0.08) {
            return { phase: 'peak', correct: true, msg: 'Good turn — hold briefly!' };
          }
          return { phase: 'neutral', correct: false, msg: 'Turn head left or right.' };
        } else {
          if (absOffset < 0.03) {
            return { phase: 'neutral', correct: true, msg: 'Back to centre — rep!' };
          }
          return { phase: 'peak', correct: true, msg: 'Now return to centre.' };
        }
      }

      // ── Shoulder Shrug ─────────────────────────────────────────────────
      case 'shoulder_shrug': {
        // Peak: shoulders raised — shoulder Y is significantly above resting Y
        // Measure distance from shoulder to ear: smaller = shoulders raised
        const leftGap  = Math.abs(leftEar.y  - leftShoulder.y);
        const rightGap = Math.abs(rightEar.y - rightShoulder.y);
        const avgGap = (leftGap + rightGap) / 2;

        if (currentPhase === 'neutral') {
          if (avgGap < 0.10) {  // shoulders raised close to ears
            return { phase: 'peak', correct: true, msg: 'Shrug held — good!' };
          }
          return { phase: 'neutral', correct: false, msg: 'Shrug both shoulders up toward ears.' };
        } else {
          if (avgGap > 0.15) {  // clearly dropped back down
            return { phase: 'neutral', correct: true, msg: 'Low — rep counted!' };
          }
          return { phase: 'peak', correct: true, msg: 'Now lower your shoulders.' };
        }
      }

      // ── Arm Raise (both arms overhead) ────────────────────────────────
      case 'arm_raise': {
        const bothUp = leftWrist.y < leftShoulder.y - 0.05 && rightWrist.y < rightShoulder.y - 0.05;
        const bothDown = leftWrist.y > leftShoulder.y + 0.10 && rightWrist.y > rightShoulder.y + 0.10;

        if (currentPhase === 'neutral') {
          if (bothUp) {
            return { phase: 'peak', correct: true, msg: 'Arms high — great!' };
          }
          return { phase: 'neutral', correct: false, msg: 'Raise both arms above shoulders.' };
        } else {
          if (bothDown) {
            return { phase: 'neutral', correct: true, msg: 'Lowered — rep counted!' };
          }
          return { phase: 'peak', correct: true, msg: 'Lower arms back down.' };
        }
      }

      // ── Arm Circles (arms wide and MOVING) ────────────────────────────
      case 'arm_circle': {
        const armsWide = Math.abs(leftWrist.x - rightWrist.x) > 0.45;
        if (currentPhase === 'neutral') {
          if (armsWide) return { phase: 'peak', correct: true, msg: 'Wide — keep circling!' };
          return { phase: 'neutral', correct: false, msg: 'Spread arms wide to start circles.' };
        } else {
          if (!armsWide) return { phase: 'neutral', correct: true, msg: 'Good circle — rep!' };
          return { phase: 'peak', correct: true, msg: 'Continue circling.' };
        }
      }

      // ── Chest Open / Chest Stretch ─────────────────────────────────────
      case 'chest_open': {
        const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
        const wristWidth = Math.abs(leftWrist.x - rightWrist.x);
        const openEnough = wristWidth > shoulderWidth + 0.20; // wrists clearly wider than shoulders

        if (currentPhase === 'neutral') {
          if (openEnough) return { phase: 'peak', correct: true, msg: 'Chest open — hold!' };
          return { phase: 'neutral', correct: false, msg: 'Pull arms back wide to open chest.' };
        } else {
          if (!openEnough) return { phase: 'neutral', correct: true, msg: 'Good — rep counted!' };
          return { phase: 'peak', correct: true, msg: 'Slowly bring arms in.' };
        }
      }

      // ── Side Bend ─────────────────────────────────────────────────────
      case 'side_bend': {
        // Detect lateral lean: large difference in shoulder-to-hip horizontal distance on one side
        const leftLean  = Math.abs(leftShoulder.x  - leftHip.x);
        const rightLean = Math.abs(rightShoulder.x - rightHip.x);
        const maxLean = Math.max(leftLean, rightLean);

        if (currentPhase === 'neutral') {
          if (maxLean > 0.15) {
            return { phase: 'peak', correct: true, msg: 'Good side bend!' };
          }
          return { phase: 'neutral', correct: false, msg: 'Bend sideways — lean further.' };
        } else {
          if (maxLean < 0.06) {
            return { phase: 'neutral', correct: true, msg: 'Back upright — rep counted!' };
          }
          return { phase: 'peak', correct: true, msg: 'Return to upright.' };
        }
      }

      // ── Trunk Twist ───────────────────────────────────────────────────
      case 'trunk_twist': {
        // When twisting, one shoulder comes forward (toward camera) reducing apparent shoulder width
        // or shoulder x-midpoint shifts vs hip midpoint
        const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
        const hipMidX = (leftHip.x + rightHip.x) / 2;
        const twist = Math.abs(shoulderMidX - hipMidX);
        const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);

        if (currentPhase === 'neutral') {
          // Clear twist: shoulder width narrows OR centroid shifts relative to hips
          if (shoulderWidth < 0.10 || twist > 0.08) {
            return { phase: 'peak', correct: true, msg: 'Good twist — hold!' };
          }
          return { phase: 'neutral', correct: false, msg: 'Rotate your torso left or right.' };
        } else {
          if (shoulderWidth > 0.16 && twist < 0.04) {
            return { phase: 'neutral', correct: true, msg: 'Centre — rep counted!' };
          }
          return { phase: 'peak', correct: true, msg: 'Unwind back to centre.' };
        }
      }

      // ── Forward Bend ──────────────────────────────────────────────────
      case 'forward_bend': {
        // Shoulders descend toward hips — shoulder Y approaches or exceeds hip Y
        const shoulderToHipDist = midHipY - midShoulderY; // small/negative = bent forward

        if (currentPhase === 'neutral') {
          if (shoulderToHipDist < 0.10) { // shoulders very close to hips = good bend
            return { phase: 'peak', correct: true, msg: 'Good bend — hold!' };
          }
          return { phase: 'neutral', correct: false, msg: 'Bend forward from the waist.' };
        } else {
          if (shoulderToHipDist > 0.20) {
            return { phase: 'neutral', correct: true, msg: 'Back up — rep counted!' };
          }
          return { phase: 'peak', correct: true, msg: 'Slowly stand back upright.' };
        }
      }

      // ── Knee Raise / Marching ─────────────────────────────────────────
      case 'knee_raise': {
        const leftKneeUp  = (leftHip.y  - leftKnee.y)  > 0.08;
        const rightKneeUp = (rightHip.y - rightKnee.y) > 0.08;
        const eitherUp = leftKneeUp || rightKneeUp;
        const bothDown = (leftHip.y - leftKnee.y) < -0.05 && (rightHip.y - rightKnee.y) < -0.05;

        if (currentPhase === 'neutral') {
          if (eitherUp) return { phase: 'peak', correct: true, msg: 'Knee up — great!' };
          return { phase: 'neutral', correct: false, msg: 'Lift one knee up high.' };
        } else {
          if (bothDown) return { phase: 'neutral', correct: true, msg: 'Leg down — rep counted!' };
          return { phase: 'peak', correct: true, msg: 'Lower leg back down.' };
        }
      }

      // ── Heel Raise / Calf Raise ───────────────────────────────────────
      case 'heel_raise': {
        // Hard to detect precisely — look for ankle Y movement relative to knee
        const leftCalfLen  = Math.abs(leftAnkle.y  - leftKnee.y);
        const rightCalfLen = Math.abs(rightAnkle.y - rightKnee.y);
        // When rising on toes, ankles appear higher (smaller y diff vs knee)
        const avgCalfLen = (leftCalfLen + rightCalfLen) / 2;

        if (currentPhase === 'neutral') {
          if (avgCalfLen < 0.22) return { phase: 'peak', correct: true, msg: 'On toes — hold!' };
          return { phase: 'neutral', correct: false, msg: 'Rise up onto your toes.' };
        } else {
          if (avgCalfLen > 0.28) return { phase: 'neutral', correct: true, msg: 'Lowered — rep!' };
          return { phase: 'peak', correct: true, msg: 'Lower your heels slowly.' };
        }
      }

      // ── Hold exercises (breathing, planks, etc.) ──────────────────────
      case 'hold':
      default: {
        // For hold exercises, require the user to be visibly MOVING at SOME point.
        // We just return correct so the timer ticks (handled by motion guard outside).
        return { phase: currentPhase, correct: true, msg: 'Hold the position actively.' };
      }
    }
  }

  let exerciseKind: ExerciseKind = 'hold';

  onMount(async () => {
    exerciseKind = classifyExercise();

    let parsedReps = 0;
    if (reps) {
      const repMatch = reps.match(/(\d+)/);
      if (repMatch) parsedReps = Math.max(1, parseInt(repMatch[1]));
    }

    // Determine if this exercise is rep-based or time-based
    const isHoldExercise = exerciseKind === 'hold';
    useRepMode = parsedReps > 0 && !isHoldExercise;

    if (useRepMode) {
      targetReps = parsedReps;
      // totalTime used only as a progress reference for the bar; doesn't count down
      totalTime = parsedReps; // 1 unit per rep
    } else {
      // Time-based: parse seconds from duration or description
      let foundTime = 30;
      if (duration) {
        const durMatch = duration.match(/(\d+)\s*(sec|min|m|s)/i);
        if (durMatch) {
          foundTime = durMatch[2].toLowerCase().startsWith('m')
            ? parseInt(durMatch[1]) * 60
            : parseInt(durMatch[1]);
        } else {
          const durVal = parseInt(duration);
          if (!isNaN(durVal)) foundTime = durVal;
        }
        if (parsedReps > 0) foundTime *= parsedReps;
      } else {
        const descMatch = description.match(/(\d+)\s*(sec|min)/i);
        if (descMatch) {
          foundTime = descMatch[2].toLowerCase().startsWith('m')
            ? parseInt(descMatch[1]) * 60
            : parseInt(descMatch[1]);
          if (parsedReps > 0) foundTime *= parsedReps;
        } else if (parsedReps > 0) {
          foundTime = parsedReps * 4;
        }
      }
      totalTime = foundTime;
      timeLeft = foundTime;
    }

    if (canvasElement) {
      canvasCtx = canvasElement.getContext('2d', { alpha: false });
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
          if (!useRepMode) startTimer();
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

  // ── Timer mode (hold exercises) ─────────────────────────────────────────
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
          finishExercise();
        }
      } else if (!isPostureCorrect && timeLeft > 0) {
        if (speechTimer % 6 === 0) {
          speakInstruction(correctionPhrases[Math.floor(Math.random() * correctionPhrases.length)]);
        }
      }
    }, 1000);
  }

  function finishExercise() {
    isPostureCorrect = false;
    hasCompleted = true;
    trackingProgress = 100;
    onProgress(100);
    onComplete();
    speakInstruction("Great job! You have completed this exercise.");
    stopTracker();
  }

  // ── Motion guard: reject tiny noise as "movement" ───────────────────────
  // We store a rolling window of recent landmark positions to measure real motion
  let landmarkHistory: any[] = [];
  const HISTORY_LEN = 6;

  function computeMotionScore(lm: any): number {
    if (landmarkHistory.length < 2) return 0;
    const prev = landmarkHistory[landmarkHistory.length - 1];
    let motion = 0;
    // Only use upper body joints relevant to most exercises
    for (const i of [0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24]) {
      if (lm[i] && prev[i]) {
        motion += Math.abs(lm[i].x - prev[i].x) + Math.abs(lm[i].y - prev[i].y);
      }
    }
    return motion;
  }

  // ── Hold exercise requires *some* real motion at regular intervals ────────
  let holdMotionAccumulator = 0; // accumulated motion during hold period
  const HOLD_MOTION_CHECK_FRAMES = 30; // check every ~1s at 30fps
  let holdFrameCount = 0;
  const HOLD_MOTION_REQUIRED = 0.25; // must accumulate this much motion per 30 frames for hold exercises

  let lastVideoTime = -1;

  async function predictWebcam() {
    if (!webcamRunning || !videoElement || !canvasElement || !poseLandmarker || hasCompleted) return;

    if (canvasElement.width !== videoElement.videoWidth) {
      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;
    }

    const startTimeMs = performance.now();
    if (lastVideoTime !== videoElement.currentTime) {
      lastVideoTime = videoElement.currentTime;
      const results = poseLandmarker.detectForVideo(videoElement, startTimeMs);

      if (canvasCtx) {
        canvasCtx.save();
        canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

        if (results.landmarks && results.landmarks.length > 0) {
          const lm = results.landmarks[0];
          const nose = lm[0];
          const inFrame = nose.visibility !== undefined ? nose.visibility > 0.55 : true;

          if (!inFrame) {
            feedbackMessage = "Please step into the camera view.";
            isPostureCorrect = false;
          } else {
            // Update landmark history
            landmarkHistory.push(lm);
            if (landmarkHistory.length > HISTORY_LEN) landmarkHistory.shift();

            const motionScore = computeMotionScore(lm);

            if (useRepMode) {
              // ── REP-COUNTING MODE ──────────────────────────────────────
              const detection = detectMovementPhase(lm, repPhase, exerciseKind);

              if (detection.phase !== repPhase) {
                // Phase changed — check if person held it long enough
                phaseHoldFrames++;
                if (phaseHoldFrames >= PHASE_HOLD_REQUIRED) {
                  // Confirmed phase transition
                  const prevPhase = repPhase;
                  repPhase = detection.phase;
                  phaseHoldFrames = 0;

                  // A full rep = peak → neutral transition
                  if (prevPhase === 'peak' && repPhase === 'neutral') {
                    completedReps++;
                    trackingProgress = (completedReps / targetReps) * 100;
                    onProgress(trackingProgress);
                    speakInstruction(`Rep ${completedReps}.`);

                    if (completedReps >= targetReps) {
                      feedbackMessage = "All reps done! 🎉";
                      isPostureCorrect = true;
                      finishExercise();
                      return;
                    }
                  }
                }
              } else {
                phaseHoldFrames = 0;
              }

              isPostureCorrect = detection.correct;
              feedbackMessage = detection.msg;

            } else if (exerciseKind === 'hold') {
              // ── HOLD MODE with motion requirement ─────────────────────
              holdMotionAccumulator += motionScore;
              holdFrameCount++;

              if (holdFrameCount >= HOLD_MOTION_CHECK_FRAMES) {
                // Did person move enough in the last second?
                const hasMotion = holdMotionAccumulator >= HOLD_MOTION_REQUIRED;
                isPostureCorrect = hasMotion;
                if (!hasMotion) {
                  feedbackMessage = "Perform the exercise — stay active.";
                } else {
                  feedbackMessage = "Good — keep going.";
                }
                holdMotionAccumulator = 0;
                holdFrameCount = 0;
              }
            } else {
              // ── TIME MODE with movement check (for hold-duration exercises) ────
              const detection = detectMovementPhase(lm, repPhase, exerciseKind);
              if (detection.phase !== repPhase) {
                phaseHoldFrames++;
                if (phaseHoldFrames >= PHASE_HOLD_REQUIRED) {
                  repPhase = detection.phase;
                  phaseHoldFrames = 0;
                }
              } else {
                phaseHoldFrames = 0;
              }
              isPostureCorrect = detection.correct;
              feedbackMessage = detection.msg;
            }

            // ── Draw person indicator ────────────────────────────────────
            const cx = nose.x * canvasElement.width;
            const cy = nose.y * canvasElement.height;
            const ringColor = isPostureCorrect ? "#22c55e" : "#eab308";

            canvasCtx.beginPath();
            canvasCtx.arc(cx, cy, 60, 0, 2 * Math.PI);
            canvasCtx.lineWidth = 6;
            canvasCtx.strokeStyle = ringColor;
            canvasCtx.stroke();

            canvasCtx.fillStyle = "rgba(0,0,0,0.6)";
            canvasCtx.roundRect(cx - 35, cy - 110, 70, 35, 8);
            canvasCtx.fill();

            canvasCtx.fillStyle = ringColor;
            canvasCtx.font = "bold 22px sans-serif";
            canvasCtx.fillText("👤 1", cx - 22, cy - 85);

            // ── Draw rep counter HUD (rep mode) ──────────────────────────
            if (useRepMode) {
              const repText = `${completedReps}/${targetReps} reps`;
              canvasCtx.fillStyle = "rgba(0,0,0,0.7)";
              canvasCtx.roundRect(12, 12, 160, 44, 8);
              canvasCtx.fill();
              canvasCtx.fillStyle = "#fff";
              canvasCtx.font = "bold 20px sans-serif";
              canvasCtx.fillText(repText, 22, 42);
            }
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

  <!-- Timer Badge (time mode) -->
  {#if webcamRunning && !hasCompleted && !useRepMode}
    <div class="absolute top-4 right-4 bg-black/80 backdrop-blur px-6 py-3 rounded-xl border-2 {isPostureCorrect ? 'border-accent-green text-accent-green' : 'border-accent-amber text-accent-amber'} text-center shadow-lg transition-colors">
      <div class="text-[10px] uppercase tracking-wider font-bold mb-0.5">{isPostureCorrect ? 'COUNTING' : 'PAUSED'}</div>
      <div class="text-3xl font-black">{timeLeft < 10 ? '0'+timeLeft : timeLeft}</div>
    </div>
  {/if}

  <!-- Rep Badge (rep mode) -->
  {#if webcamRunning && !hasCompleted && useRepMode}
    <div class="absolute top-4 right-4 bg-black/80 backdrop-blur px-6 py-3 rounded-xl border-2 {isPostureCorrect ? 'border-accent-green text-accent-green' : 'border-accent-amber text-accent-amber'} text-center shadow-lg transition-colors">
      <div class="text-[10px] uppercase tracking-wider font-bold mb-0.5">REPS</div>
      <div class="text-3xl font-black">{completedReps}<span class="text-lg opacity-60">/{targetReps}</span></div>
      <div class="text-[10px] uppercase tracking-wider mt-0.5 opacity-70">{repPhase === 'peak' ? 'HOLD ▲' : 'RETURN ▼'}</div>
    </div>
  {/if}

  {#if webcamRunning && !hasCompleted}
    <div class="absolute bottom-16 left-0 right-0 flex justify-center pointer-events-none">
      <div class="bg-gray-900/90 backdrop-blur border-b-4 {isPostureCorrect ? 'border-accent-green text-accent-green' : 'border-accent-amber text-white'} px-6 py-3 rounded-xl text-lg font-bold shadow-2xl transition-colors">
        {feedbackMessage}
      </div>
    </div>
  {/if}

  <!-- Progress bar -->
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

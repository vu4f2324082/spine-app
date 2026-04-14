<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { FilesetResolver, PoseLandmarker, DrawingUtils } from '@mediapipe/tasks-vision';

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
  let drawingUtils: DrawingUtils | null = $state(null);

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

  // ── Speech throttle — only speak once per unique message ────────────────
  let lastSpokenMsg = '';
  let lastSpeechTime = 0;
  const SPEECH_COOLDOWN_MS = 3500; // minimum ms between repeated speech

  // Rep counting
  let targetReps = $state(0);
  let completedReps = $state(0);
  let useRepMode = $state(false);
  let repPhase = $state<'neutral' | 'peak'>('neutral');
  let phaseHoldFrames = 0;
  // Must stay in new phase for N frames before it counts (~0.4s at ~30fps)
  const PHASE_HOLD_REQUIRED = 12;

  // ─── Exercise type classifier ─────────────────────────────────────────────
  type ExerciseKind =
    | 'neck_tilt'
    | 'neck_rotation'
    | 'shoulder_shrug'
    | 'shoulder_roll'
    | 'chin_tuck'
    | 'scapular_squeeze'
    | 'spine_extension'
    | 'arm_raise'
    | 'arm_circle'
    | 'chest_open'
    | 'side_bend'
    | 'trunk_twist'
    | 'forward_bend'
    | 'knee_raise'
    | 'heel_raise'
    | 'wall_pushup'
    | 'hold';

  function classifyExercise(): ExerciseKind {
    const t = (exerciseName + ' ' + description).toLowerCase();
    if (t.includes('wall push') || t.includes('wall-push') || (t.includes('push') && t.includes('wall'))) return 'wall_pushup';
    if (t.includes('chin tuck') || t.includes('chin-tuck') || (t.includes('chin') && (t.includes('tuck') || t.includes('retract')))) return 'chin_tuck';
    if (t.includes('scapular') || t.includes('shoulder blade') || t.includes('rhomboid') || (t.includes('shoulder') && t.includes('squeeze'))) return 'scapular_squeeze';
    if (t.includes('extension') && (t.includes('spine') || t.includes('spinal') || t.includes('back') || t.includes('seated'))) return 'spine_extension';
    if ((t.includes('neck') || t.includes('head') || t.includes('trapezius') || t.includes('upper trap')) &&
        (t.includes('tilt') || t.includes('bend') || t.includes('side') || t.includes('stretch') || t.includes('lateral'))) return 'neck_tilt';
    if ((t.includes('neck') || t.includes('head')) && (t.includes('rotat') || t.includes('turn') || t.includes('look'))) return 'neck_rotation';
    if ((t.includes('shoulder') && t.includes('roll')) || t.includes('shoulder-roll')) return 'shoulder_roll';
    if (t.includes('shrug')) return 'shoulder_shrug';
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

  function computeAngleDeg(A: any, B: any, C: any): number {
    const BAx = A.x - B.x, BAy = A.y - B.y;
    const BCx = C.x - B.x, BCy = C.y - B.y;
    const dot = BAx * BCx + BAy * BCy;
    const mag = Math.sqrt(BAx*BAx + BAy*BAy) * Math.sqrt(BCx*BCx + BCy*BCy);
    if (mag === 0) return 180;
    return Math.acos(Math.max(-1, Math.min(1, dot / mag))) * (180 / Math.PI);
  }

  // ─── Per-exercise movement detection ─────────────────────────────────────
  // Returns:
  //   phase:   'neutral' | 'peak'  — which phase they are headed toward
  //   correct: boolean             — should timer count? (true in BOTH phases for active exercises)
  //   msg:     string              — display message
  //
  // KEY FIX: for exercises where the person continuously moves (neck_tilt,
  // neck_rotation, shoulder_shrug, etc.) the neutral phase BETWEEN reps is
  // also "correct: true" so the timer never pauses and the instruction does
  // NOT endlessly fire the correction feedback. The "Tilt head to one side"
  // message only shows briefly while returning to centre between reps.
  function detectMovementPhase(
    lm: any,
    currentPhase: 'neutral' | 'peak',
    kind: ExerciseKind
  ): { phase: 'neutral' | 'peak'; correct: boolean; msg: string } {

    const nose          = lm[0];
    const leftEar       = lm[7];
    const rightEar      = lm[8];
    const leftShoulder  = lm[11];
    const rightShoulder = lm[12];
    const leftElbow     = lm[13];
    const rightElbow    = lm[14];
    const leftWrist     = lm[15];
    const rightWrist    = lm[16];
    const leftHip       = lm[23];
    const rightHip      = lm[24];
    const leftKnee      = lm[25];
    const rightKnee     = lm[26];
    const leftAnkle     = lm[27];
    const rightAnkle    = lm[28];

    const midShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const midShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
    const midHipY = (leftHip.y + rightHip.y) / 2;

    switch (kind) {

      // ── Neck Tilt (head side-to-side) ─────────────────────────────────
      // FIX: neutral is also "correct:true" so timer runs; thresholds loosened
      // so they work across a range of distances / camera positions.
      case 'neck_tilt': {
        const earAsymmetry = Math.abs(leftEar.y - rightEar.y);

        if (currentPhase === 'neutral') {
          if (earAsymmetry > 0.055) {
            return { phase: 'peak', correct: true, msg: 'Good tilt — hold it!' };
          }
          // Timer still runs while returning to centre
          return { phase: 'neutral', correct: true, msg: 'Tilt your head slowly to one side.' };
        } else {
          if (earAsymmetry < 0.025) {
            return { phase: 'neutral', correct: true, msg: 'Back to centre — rep counted!' };
          }
          return { phase: 'peak', correct: true, msg: 'Good — now return to centre.' };
        }
      }

      // ── Neck Rotation (chin turns left/right) ──────────────────────────
      // FIX: same neutral-correct fix; thresholds calibrated for webcam distance
      case 'neck_rotation': {
        // nose vs shoulder midpoint X offset
        const noseOffsetX = Math.abs(nose.x - midShoulderX);

        if (currentPhase === 'neutral') {
          if (noseOffsetX > 0.06) {
            return { phase: 'peak', correct: true, msg: 'Good — hold the turn briefly!' };
          }
          return { phase: 'neutral', correct: true, msg: 'Turn your head slowly left or right.' };
        } else {
          if (noseOffsetX < 0.025) {
            return { phase: 'neutral', correct: true, msg: 'Back to centre — rep!' };
          }
          return { phase: 'peak', correct: true, msg: 'Now slowly return to centre.' };
        }
      }

      // ── Shoulder Shrug ─────────────────────────────────────────────────
      // FIX: use DELTA-based from shrugBaseline so people with big necks
      // are not penalised. Neutral is correct too so timer doesn't stall.
      case 'shoulder_shrug': {
        const leftGap  = Math.abs(leftEar.y  - leftShoulder.y);
        const rightGap = Math.abs(rightEar.y - rightShoulder.y);
        const avgGap = (leftGap + rightGap) / 2;

        if (!shrugCalibDone) {
          return { phase: 'neutral', correct: false, msg: `Calibrating — drop shoulders naturally… (${shrugCalibFrames}/${SHRUG_CALIB_FRAMES})` };
        }
        // Shrug detected when gap shrinks by SHRUG_DELTA from resting
        const shrinkDelta = shrugBaseline - avgGap;

        if (currentPhase === 'neutral') {
          if (shrinkDelta > SHRUG_RAISE_DELTA) {
            return { phase: 'peak', correct: true, msg: 'Shrug held — nice!' };
          }
          return { phase: 'neutral', correct: true, msg: 'Shrug both shoulders up toward your ears.' };
        } else {
          if (shrinkDelta < SHRUG_RELEASE_DELTA) {
            return { phase: 'neutral', correct: true, msg: 'Lowered — rep counted!' };
          }
          return { phase: 'peak', correct: true, msg: 'Now lower your shoulders slowly.' };
        }
      }

      // ── Arm Raise (both arms overhead) ────────────────────────────────
      case 'arm_raise': {
        // Above shoulder = smaller Y (inverted screen coords)
        const leftUp   = leftWrist.y  < leftShoulder.y  - 0.04;
        const rightUp  = rightWrist.y < rightShoulder.y - 0.04;
        // Either arm up is valid (single-arm raise exercises)
        const anyUp   = leftUp || rightUp;
        const bothDown = leftWrist.y > leftShoulder.y + 0.08 && rightWrist.y > rightShoulder.y + 0.08;

        if (currentPhase === 'neutral') {
          if (anyUp) return { phase: 'peak', correct: true, msg: 'Arms raised — great!' };
          return { phase: 'neutral', correct: true, msg: 'Raise your arms above shoulder height.' };
        } else {
          if (bothDown) return { phase: 'neutral', correct: true, msg: 'Lowered — rep counted!' };
          return { phase: 'peak', correct: true, msg: 'Lower arms back to your sides.' };
        }
      }

      // ── Arm Circles ────────────────────────────────────────────────────
      case 'arm_circle': {
        const armsWide = Math.abs(leftWrist.x - rightWrist.x) > 0.40;
        if (currentPhase === 'neutral') {
          if (armsWide) return { phase: 'peak', correct: true, msg: 'Wide — keep circling!' };
          return { phase: 'neutral', correct: true, msg: 'Spread both arms wide to circle.' };
        } else {
          if (!armsWide) return { phase: 'neutral', correct: true, msg: 'Good circle — rep!' };
          return { phase: 'peak', correct: true, msg: 'Continue the full circle.' };
        }
      }

      // ── Chest Open / Chest Stretch ─────────────────────────────────────
      case 'chest_open': {
        const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
        const wristWidth    = Math.abs(leftWrist.x    - rightWrist.x);
        const openEnough    = wristWidth > shoulderWidth + 0.18;

        if (currentPhase === 'neutral') {
          if (openEnough) return { phase: 'peak', correct: true, msg: 'Chest open — hold!' };
          return { phase: 'neutral', correct: true, msg: 'Pull both arms wide to open your chest.' };
        } else {
          if (!openEnough) return { phase: 'neutral', correct: true, msg: 'Good — rep counted!' };
          return { phase: 'peak', correct: true, msg: 'Bring arms slowly back in.' };
        }
      }

      // ── Side Bend ─────────────────────────────────────────────────────
      case 'side_bend': {
        // When bending sideways, one shoulder moves laterally over the hip on that side
        const leftLean  = Math.abs(leftShoulder.x  - leftHip.x);
        const rightLean = Math.abs(rightShoulder.x - rightHip.x);
        const maxLean   = Math.max(leftLean, rightLean);

        if (currentPhase === 'neutral') {
          if (maxLean > 0.13) return { phase: 'peak', correct: true, msg: 'Good side bend — hold!' };
          return { phase: 'neutral', correct: true, msg: 'Bend sideways from your waist.' };
        } else {
          if (maxLean < 0.05) return { phase: 'neutral', correct: true, msg: 'Back upright — rep counted!' };
          return { phase: 'peak', correct: true, msg: 'Return to upright slowly.' };
        }
      }

      // ── Trunk Twist ───────────────────────────────────────────────────
      // FIX: removed shoulder-width check which fired for any off-centre person.
      case 'trunk_twist': {
        const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
        const hipMidX      = (leftHip.x      + rightHip.x)      / 2;
        const twist        = Math.abs(shoulderMidX - hipMidX);

        if (currentPhase === 'neutral') {
          if (twist > 0.07) return { phase: 'peak', correct: true, msg: 'Good twist — hold!' };
          return { phase: 'neutral', correct: true, msg: 'Rotate your torso left or right.' };
        } else {
          if (twist < 0.03) return { phase: 'neutral', correct: true, msg: 'Centre — rep counted!' };
          return { phase: 'peak', correct: true, msg: 'Unwind back to centre.' };
        }
      }

      // ── Forward Bend ──────────────────────────────────────────────────
      case 'forward_bend': {
        const shoulderToHipDist = midHipY - midShoulderY;

        if (currentPhase === 'neutral') {
          if (shoulderToHipDist < 0.12) return { phase: 'peak', correct: true, msg: 'Good bend — hold!' };
          return { phase: 'neutral', correct: true, msg: 'Bend forward from the waist.' };
        } else {
          if (shoulderToHipDist > 0.22) return { phase: 'neutral', correct: true, msg: 'Back up — rep counted!' };
          return { phase: 'peak', correct: true, msg: 'Slowly stand back upright.' };
        }
      }

      // ── Knee Raise / Marching ─────────────────────────────────────────
      case 'knee_raise': {
        const leftKneeUp  = (leftHip.y  - leftKnee.y)  > 0.07;
        const rightKneeUp = (rightHip.y - rightKnee.y) > 0.07;
        const eitherUp    = leftKneeUp || rightKneeUp;
        const bothDown    = (leftKnee.y - leftHip.y) > 0.03 && (rightKnee.y - rightHip.y) > 0.03;

        if (currentPhase === 'neutral') {
          if (eitherUp) return { phase: 'peak', correct: true, msg: 'Knee up — great!' };
          return { phase: 'neutral', correct: true, msg: 'Lift one knee up toward your chest.' };
        } else {
          if (bothDown) return { phase: 'neutral', correct: true, msg: 'Leg down — rep counted!' };
          return { phase: 'peak', correct: true, msg: 'Lower your leg back down.' };
        }
      }

      // ── Heel Raise / Calf Raise ───────────────────────────────────────
      case 'heel_raise': {
        const leftCalfLen  = Math.abs(leftAnkle.y  - leftKnee.y);
        const rightCalfLen = Math.abs(rightAnkle.y - rightKnee.y);
        const avgCalfLen   = (leftCalfLen + rightCalfLen) / 2;

        if (currentPhase === 'neutral') {
          if (avgCalfLen < 0.22) return { phase: 'peak', correct: true, msg: 'On toes — hold!' };
          return { phase: 'neutral', correct: true, msg: 'Rise up onto your toes.' };
        } else {
          if (avgCalfLen > 0.28) return { phase: 'neutral', correct: true, msg: 'Lowered — rep!' };
          return { phase: 'peak', correct: true, msg: 'Lower your heels slowly.' };
        }
      }

      // ── Wall Pushup ───────────────────────────────────────────────────
      case 'wall_pushup': {
        const leftAngle  = computeAngleDeg(leftShoulder,  leftElbow,  leftWrist);
        const rightAngle = computeAngleDeg(rightShoulder, rightElbow, rightWrist);

        const leftVis  = (leftElbow.visibility  ?? 1) > 0.4;
        const rightVis = (rightElbow.visibility ?? 1) > 0.4;

        const elbowAngle = leftVis && rightVis
          ? (leftAngle + rightAngle) / 2
          : leftVis ? leftAngle : rightAngle;

        const leftWristDropped  = leftVis  && (leftWrist.y  - leftElbow.y)  > 0.03;
        const rightWristDropped = rightVis && (rightWrist.y - rightElbow.y) > 0.03;
        const wristsDrooping    = leftWristDropped || rightWristDropped;

        const leftWristLevel  = leftVis  && (leftWrist.y  - leftElbow.y) < -0.01;
        const rightWristLevel = rightVis && (rightWrist.y - rightElbow.y) < -0.01;
        const wristsLevel     = leftWristLevel || rightWristLevel;

        const isBent     = elbowAngle < 115 || wristsDrooping;
        const isExtended = elbowAngle > 150 || wristsLevel;

        if (currentPhase === 'neutral') {
          if (isBent) return { phase: 'peak', correct: true, msg: 'Good — elbows bent!' };
          return { phase: 'neutral', correct: true, msg: 'Lean into the wall — bend your elbows.' };
        } else {
          if (isExtended) return { phase: 'neutral', correct: true, msg: 'Arms straight — rep counted!' };
          return { phase: 'peak', correct: true, msg: 'Push back — straighten arms fully.' };
        }
      }

      // ── Chin Tuck ─────────────────────────────────────────────────────
      case 'chin_tuck': {
        const earMidY      = (leftEar.y + rightEar.y) / 2;
        const noseBelowEar = nose.y - earMidY;

        if (!chinCalibDone) {
          return { phase: 'neutral', correct: false, msg: `Calibrating — sit naturally… (${chinCalibFrames}/${CHIN_CALIB_FRAMES})` };
        }

        const tuckDelta = noseBelowEar - chinBaseline;

        if (currentPhase === 'neutral') {
          if (tuckDelta > CHIN_TUCK_DELTA) {
            return { phase: 'peak', correct: true, msg: 'Good chin tuck — hold briefly!' };
          }
          return { phase: 'neutral', correct: true, msg: 'Draw chin straight back — "double chin" motion.' };
        } else {
          if (tuckDelta < CHIN_RELEASE_DELTA) {
            return { phase: 'neutral', correct: true, msg: 'Released — rep counted!' };
          }
          return { phase: 'peak', correct: true, msg: 'Hold the tuck, then slowly release.' };
        }
      }

      // ── Scapular Squeeze ──────────────────────────────────────────────
      case 'scapular_squeeze': {
        const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
        const elbowWidth    = Math.abs(leftElbow.x    - rightElbow.x);
        const wristWidth    = Math.abs(leftWrist.x    - rightWrist.x);

        const isSqueezed = elbowWidth > shoulderWidth + 0.04 && wristWidth > shoulderWidth + 0.02;
        const isRelaxed  = elbowWidth < shoulderWidth + 0.02 && wristWidth < shoulderWidth + 0.04;

        if (currentPhase === 'neutral') {
          if (isSqueezed) return { phase: 'peak', correct: true, msg: 'Great squeeze — blades together!' };
          return { phase: 'neutral', correct: true, msg: 'Pull elbows back — squeeze your shoulder blades.' };
        } else {
          if (isRelaxed) return { phase: 'neutral', correct: true, msg: 'Relaxed — rep counted!' };
          return { phase: 'peak', correct: true, msg: 'Hold the squeeze, then slowly release.' };
        }
      }

      // ── Seated Spine Extension ────────────────────────────────────────
      case 'spine_extension': {
        const trunkHeight       = midHipY - midShoulderY;
        const noseAboveShoulder = midShoulderY - nose.y;

        if (!spineCalibDone) {
          return { phase: 'neutral', correct: false, msg: `Calibrating posture — sit naturally… (${spineCalibFrames}/${SPINE_CALIB_FRAMES})` };
        }

        const trunkDelta = trunkHeight - spineBaseline;

        if (currentPhase === 'neutral') {
          if (trunkDelta > SPINE_PEAK_DELTA && noseAboveShoulder > 0.12) {
            return { phase: 'peak', correct: true, msg: 'Spine extended — hold tall!' };
          }
          return { phase: 'neutral', correct: true, msg: 'Sit tall — extend your spine upward.' };
        } else {
          if (trunkDelta < SPINE_NEUTRAL_DELTA) {
            return { phase: 'neutral', correct: true, msg: 'Relaxed — rep counted!' };
          }
          return { phase: 'peak', correct: true, msg: 'Hold the extension, then relax.' };
        }
      }

      // ── Shoulder Roll ─────────────────────────────────────────────────
      case 'shoulder_roll': {
        const midShY = (leftShoulder.y + rightShoulder.y) / 2;

        if (!rollCalibDone) {
          return { phase: 'neutral', correct: false, msg: `Calibrating — relax your shoulders… (${rollCalibFrames}/${ROLL_CALIB_FRAMES})` };
        }

        const raiseDelta = rollBaseline - midShY;

        if (currentPhase === 'neutral') {
          if (raiseDelta > ROLL_RAISE_DELTA) {
            return { phase: 'peak', correct: true, msg: 'Shoulders up — keep rolling back and down!' };
          }
          return { phase: 'neutral', correct: true, msg: 'Roll shoulders: up → back → down → forward.' };
        } else {
          if (raiseDelta < ROLL_RELEASE_DELTA) {
            return { phase: 'neutral', correct: true, msg: 'Full circle — rep counted!' };
          }
          return { phase: 'peak', correct: true, msg: 'Continue rolling downward and forward.' };
        }
      }

      // ── Hold exercises ────────────────────────────────────────────────
      case 'hold':
      default: {
        return { phase: currentPhase, correct: true, msg: 'Hold the position actively.' };
      }
    }
  }

  let exerciseKind: ExerciseKind = 'hold';

  // ── Calibration baselines ──────────────────────────────────────────────────
  // Spine extension
  let spineCalibDone   = false;
  let spineCalibFrames = 0;
  let spineCalibAccum  = 0;
  let spineBaseline    = 0;
  const SPINE_CALIB_FRAMES  = 20;
  const SPINE_PEAK_DELTA    = 0.06;
  const SPINE_NEUTRAL_DELTA = 0.02;

  // Chin tuck
  let chinCalibDone   = false;
  let chinCalibFrames = 0;
  let chinCalibAccum  = 0;
  let chinBaseline    = 0;
  const CHIN_CALIB_FRAMES  = 20;
  const CHIN_TUCK_DELTA    = 0.030;
  const CHIN_RELEASE_DELTA = 0.008;

  // Shoulder roll
  let rollCalibDone   = false;
  let rollCalibFrames = 0;
  let rollCalibAccum  = 0;
  let rollBaseline    = 0;
  const ROLL_CALIB_FRAMES  = 20;
  const ROLL_RAISE_DELTA   = 0.040;
  const ROLL_RELEASE_DELTA = 0.010;

  // Shoulder shrug – new delta-based calibration
  let shrugCalibDone   = false;
  let shrugCalibFrames = 0;
  let shrugCalibAccum  = 0;
  let shrugBaseline    = 0;
  const SHRUG_CALIB_FRAMES  = 20;
  const SHRUG_RAISE_DELTA   = 0.045; // gap must shrink by this much from resting
  const SHRUG_RELEASE_DELTA = 0.010;

  onMount(async () => {
    exerciseKind = classifyExercise();

    let parsedReps = 0;
    if (reps) {
      const repMatch = reps.match(/(\d+)/);
      if (repMatch) parsedReps = Math.max(1, parseInt(repMatch[1]));
    }

    const isHoldExercise = exerciseKind === 'hold';
    useRepMode = parsedReps > 0 && !isHoldExercise;

    if (useRepMode) {
      targetReps = parsedReps;
      totalTime  = parsedReps;
    } else {
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
      timeLeft  = foundTime;
    }

    if (canvasElement) {
      canvasCtx = canvasElement.getContext('2d', { alpha: false });
      if (canvasCtx) drawingUtils = new DrawingUtils(canvasCtx);
    }
    speakInstruction(`Starting ${exerciseName}. ${description}`);
    await initTracker();
  });

  onDestroy(() => {
    stopTracker();
    window.speechSynthesis.cancel();
  });

  // ── Smart speech: never repeat the same message within cooldown window ──
  function speakInstruction(text: string) {
    if (!window.speechSynthesis) return;
    const now = Date.now();
    const isSame = text === lastSpokenMsg;
    const tooSoon = now - lastSpeechTime < SPEECH_COOLDOWN_MS;
    // Allow immediate speech only if message is different OR cooldown passed
    if (isSame && tooSoon) return;
    if (window.speechSynthesis.speaking && tooSoon) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
    lastSpokenMsg  = text;
    lastSpeechTime = now;
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
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
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
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (poseLandmarker) poseLandmarker.close();
  }

  // ── Timer mode ──────────────────────────────────────────────────────────
  let speechTimerTick = 0;
  const goodMotivations = ["Perfect form!", "Keep it up!", "Looking great.", "Hold that pose.", "Excellent!", "One more!"];

  function startTimer() {
    timerInterval = setInterval(() => {
      if (!webcamRunning || hasCompleted) return;
      speechTimerTick++;

      if (isPostureCorrect && timeLeft > 0) {
        timeLeft--;
        trackingProgress = ((totalTime - timeLeft) / totalTime) * 100;
        onProgress(trackingProgress);

        // Motivational speech every ~8s
        if (speechTimerTick % 8 === 0 && timeLeft > 5) {
          speakInstruction(goodMotivations[Math.floor(Math.random() * goodMotivations.length)]);
        }

        if (timeLeft <= 0) finishExercise();
      }
      // If not correct (calibrating), timer simply waits — no nagging voice loop
    }, 1000);
  }

  function finishExercise() {
    isPostureCorrect = false;
    hasCompleted     = true;
    trackingProgress = 100;
    onProgress(100);
    onComplete();
    speakInstruction("Great job! You have completed this exercise.");
    stopTracker();
  }

  // ── Motion history ───────────────────────────────────────────────────────
  let landmarkHistory: any[] = [];
  const HISTORY_LEN = 6;

  function computeMotionScore(lm: any): number {
    if (landmarkHistory.length < 2) return 0;
    const prev = landmarkHistory[landmarkHistory.length - 1];
    let motion = 0;
    for (const i of [0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24]) {
      if (lm[i] && prev[i]) {
        motion += Math.abs(lm[i].x - prev[i].x) + Math.abs(lm[i].y - prev[i].y);
      }
    }
    return motion;
  }

  let holdMotionAccumulator = 0;
  const HOLD_MOTION_CHECK_FRAMES = 30;
  let holdFrameCount = 0;
  const HOLD_MOTION_REQUIRED = 0.15;

  let lastVideoTime = -1;

  async function predictWebcam() {
    if (!webcamRunning || !videoElement || !canvasElement || !poseLandmarker || hasCompleted) return;

    if (canvasElement.width !== videoElement.videoWidth) {
      canvasElement.width  = videoElement.videoWidth;
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
          const lm   = results.landmarks[0];
          const nose = lm[0];
          const inFrame = nose.visibility !== undefined ? nose.visibility > 0.50 : true;

          if (!inFrame) {
            feedbackMessage  = "Please step into the camera view.";
            isPostureCorrect = false;
          } else {
            landmarkHistory.push(lm);
            if (landmarkHistory.length > HISTORY_LEN) landmarkHistory.shift();

            // ── Per-exercise baseline calibration ──────────────────────
            {
              let needsCalib = false;
              let calibMsg   = '';

              if (exerciseKind === 'spine_extension' && !spineCalibDone) {
                spineCalibAccum += (lm[23].y + lm[24].y) / 2 - (lm[11].y + lm[12].y) / 2;
                spineCalibFrames++;
                if (spineCalibFrames >= SPINE_CALIB_FRAMES) {
                  spineBaseline  = spineCalibAccum / SPINE_CALIB_FRAMES;
                  spineCalibDone = true;
                }
                needsCalib = !spineCalibDone;
                calibMsg   = `Calibrating posture — sit naturally… (${spineCalibFrames}/${SPINE_CALIB_FRAMES})`;
              }

              if (exerciseKind === 'chin_tuck' && !chinCalibDone) {
                const earMidY = (lm[7].y + lm[8].y) / 2;
                chinCalibAccum += lm[0].y - earMidY;
                chinCalibFrames++;
                if (chinCalibFrames >= CHIN_CALIB_FRAMES) {
                  chinBaseline  = chinCalibAccum / CHIN_CALIB_FRAMES;
                  chinCalibDone = true;
                }
                needsCalib = !chinCalibDone;
                calibMsg   = `Calibrating — sit naturally… (${chinCalibFrames}/${CHIN_CALIB_FRAMES})`;
              }

              if (exerciseKind === 'shoulder_roll' && !rollCalibDone) {
                rollCalibAccum += (lm[11].y + lm[12].y) / 2;
                rollCalibFrames++;
                if (rollCalibFrames >= ROLL_CALIB_FRAMES) {
                  rollBaseline  = rollCalibAccum / ROLL_CALIB_FRAMES;
                  rollCalibDone = true;
                }
                needsCalib = !rollCalibDone;
                calibMsg   = `Calibrating — relax your shoulders… (${rollCalibFrames}/${ROLL_CALIB_FRAMES})`;
              }

              if (exerciseKind === 'shoulder_shrug' && !shrugCalibDone) {
                const leftGap  = Math.abs(lm[7].y  - lm[11].y);
                const rightGap = Math.abs(lm[8].y  - lm[12].y);
                shrugCalibAccum += (leftGap + rightGap) / 2;
                shrugCalibFrames++;
                if (shrugCalibFrames >= SHRUG_CALIB_FRAMES) {
                  shrugBaseline  = shrugCalibAccum / SHRUG_CALIB_FRAMES;
                  shrugCalibDone = true;
                }
                needsCalib = !shrugCalibDone;
                calibMsg   = `Calibrating — relax your shoulders… (${shrugCalibFrames}/${SHRUG_CALIB_FRAMES})`;
              }

              if (needsCalib) {
                feedbackMessage  = calibMsg;
                isPostureCorrect = false;
                canvasCtx.restore();
                if (!hasCompleted) animationFrameId = requestAnimationFrame(predictWebcam);
                return;
              }
            }

            computeMotionScore(lm); // for potential future use

            if (useRepMode) {
              // ── REP-COUNTING MODE ─────────────────────────────────────
              const detection = detectMovementPhase(lm, repPhase, exerciseKind);

              if (detection.phase !== repPhase) {
                phaseHoldFrames++;
                if (phaseHoldFrames >= PHASE_HOLD_REQUIRED) {
                  const prevPhase = repPhase;
                  repPhase        = detection.phase;
                  phaseHoldFrames = 0;

                  if (prevPhase === 'peak' && repPhase === 'neutral') {
                    completedReps++;
                    trackingProgress = (completedReps / targetReps) * 100;
                    onProgress(trackingProgress);
                    speakInstruction(`Rep ${completedReps}.`);

                    if (completedReps >= targetReps) {
                      feedbackMessage  = "All reps done! 🎉";
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
              feedbackMessage  = detection.msg;

            } else if (exerciseKind === 'hold') {
              // ── HOLD MODE with motion requirement ─────────────────────
              holdMotionAccumulator += computeMotionScore(lm);
              holdFrameCount++;

              if (holdFrameCount >= HOLD_MOTION_CHECK_FRAMES) {
                const hasMotion  = holdMotionAccumulator >= HOLD_MOTION_REQUIRED;
                isPostureCorrect = hasMotion;
                feedbackMessage  = hasMotion ? "Good — keep going." : "Perform the exercise — stay active.";
                holdMotionAccumulator = 0;
                holdFrameCount        = 0;
              }

            } else {
              // ── TIME MODE with phase tracking ─────────────────────────
              // For time-based exercises (no reps count), BOTH neutral and
              // peak count as "correct" so the timer never stalls between reps.
              // The feedback message still tells the user what to do next.
              const detection = detectMovementPhase(lm, repPhase, exerciseKind);

              if (detection.phase !== repPhase) {
                phaseHoldFrames++;
                if (phaseHoldFrames >= PHASE_HOLD_REQUIRED) {
                  repPhase        = detection.phase;
                  phaseHoldFrames = 0;
                }
              } else {
                phaseHoldFrames = 0;
              }

              // In time-mode all active-exercise phases are correct
              // UNLESS we are still in initial calibration (handled above).
              isPostureCorrect = detection.correct;
              feedbackMessage  = detection.msg;

              // Speak the feedback only when it meaningfully changes
              if (detection.msg !== lastSpokenMsg) {
                speakInstruction(detection.msg);
              }
            }

            // ── Draw HUD overlay ─────────────────────────────────────────
            const cx = nose.x * canvasElement.width;
            const cy = nose.y * canvasElement.height;
            const ringColor = isPostureCorrect ? "#22c55e" : "#eab308";

            // Draw full skeleton
            if (drawingUtils && results.landmarks) {
              for (const landmark of results.landmarks) {
                drawingUtils.drawConnectors(landmark, PoseLandmarker.POSE_CONNECTIONS, { color: 'rgba(255, 255, 255, 0.4)', lineWidth: 3 });
                drawingUtils.drawLandmarks(landmark, { color: isPostureCorrect ? '#22c55e' : '#eab308', lineWidth: 1, radius: 4 });
              }
            }

            canvasCtx.beginPath();
            canvasCtx.arc(cx, cy, 55, 0, 2 * Math.PI);
            canvasCtx.lineWidth   = 5;
            canvasCtx.strokeStyle = ringColor;
            canvasCtx.stroke();

            canvasCtx.fillStyle = "rgba(0,0,0,0.55)";
            canvasCtx.roundRect(cx - 32, cy - 105, 64, 32, 8);
            canvasCtx.fill();

            canvasCtx.fillStyle = ringColor;
            canvasCtx.font      = "bold 20px sans-serif";
            canvasCtx.fillText("👤 1", cx - 20, cy - 82);

            if (useRepMode) {
              const repText = `${completedReps}/${targetReps} reps`;
              canvasCtx.fillStyle = "rgba(0,0,0,0.70)";
              canvasCtx.roundRect(12, 12, 170, 44, 8);
              canvasCtx.fill();
              canvasCtx.fillStyle = "#fff";
              canvasCtx.font      = "bold 20px sans-serif";
              canvasCtx.fillText(repText, 22, 42);
            }
          }
        } else {
          isPostureCorrect = false;
          feedbackMessage  = "No person detected — please step into frame.";
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
      <span class="text-sm font-medium tracking-wide">Starting Tracker…</span>
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

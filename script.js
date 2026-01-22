// script.js - Core logic for Reaction Time Game with Hand Gesture Detection

const GESTURE_ICONS = {
    'rock': '✊',
    'paper': '✋',
    'scissor': '✌️',
    'raise_both_hands': '🙌',
    't_pose': '🧍',
    'raise_hand': '🙋'
};

/* ====================
   Global State & Constants
   ==================== */
const STATE = {
    current: "username", // username | setup | reaction | gesture | leaderboard
    round: 0,
    totalReactionRounds: 5,

    // Continuous Flow State
    startTime: null,
    endTime: null,
    timerRunning: false,
    isLoopRunning: false,

    // Gesture State
    gestureSequence: [],
    gestureIndex: 0,
    reactionHand: null, // 'Left' or 'Right'

    playerName: "Anonymous",
};

const COLORS = ["red", "blue", "white", "black", "purple"];
const GREEN_COLOR = "green";

/* ====================
   Utility Functions
   ==================== */
function $(id) { return document.getElementById(id); }

function show(sectionId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const section = $(sectionId);
    if (section) section.classList.remove('hidden');

    // Manage timer visibility
    const timer = $('side-timer');
    if (timer) {
        if (sectionId === 'reaction-test' || (sectionId === 'gesture-detect' && STATE.current === 'gesture')) {
            timer.classList.remove('hidden');
        } else {
            timer.classList.add('hidden');
        }
    }
}

function setStatus(msg) {
    const el = $('status-message');
    if (el) el.textContent = msg;
}

function randomPos(container) {
    const rect = container.getBoundingClientRect();
    const x = Math.random() * (rect.width - 60);
    const y = Math.random() * (rect.height - 60);
    return { x, y };
}

function createDot(color) {
    const dot = document.createElement('div');
    dot.className = `dot ${color}`;
    const container = $('dot-container');
    const pos = randomPos(container);
    dot.style.left = `${pos.x}px`;
    dot.style.top = `${pos.y}px`;
    return dot;
}

// Timer Logic
function updateTimerDisplay() {
    if (STATE.timerRunning) {
        const t = (performance.now() - STATE.startTime) / 1000;
        const el = $('timer-val');
        if (el) el.textContent = t.toFixed(3);
        requestAnimationFrame(updateTimerDisplay);
    }
}

function startTimer() {
    if (STATE.timerRunning) return;
    STATE.startTime = performance.now();
    STATE.timerRunning = true;
    requestAnimationFrame(updateTimerDisplay);
}

function stopTimer() {
    STATE.timerRunning = false;
    STATE.endTime = performance.now();
    const t = (STATE.endTime - STATE.startTime) / 1000;
    const el = $('timer-val');
    if (el) el.textContent = t.toFixed(3);
}

function updateLeaderboardTable() {
    const tbody = $('leaderboard-table').querySelector('tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const entries = JSON.parse(localStorage.getItem('rtg_leaderboard_v2') || '[]');
    entries.sort((a, b) => a.totalTime - b.totalTime);
    entries.slice(0, 10).forEach((e, i) => {
        const tr = document.createElement('tr');
        if (e.isBest) tr.classList.add('highlight');
        tr.innerHTML = `<td>${i + 1}</td><td>${e.name}</td><td>${e.totalTime.toFixed(3)}s</td><td>${e.date}</td>`;
        tbody.appendChild(tr);
    });
}

function saveScore(name, totalTime) {
    const entries = JSON.parse(localStorage.getItem('rtg_leaderboard_v2') || '[]');
    const now = new Date().toLocaleDateString();
    const newEntry = { name, totalTime: parseFloat(totalTime), date: now, isBest: false };
    entries.push(newEntry);

    const best = Math.min(...entries.map(e => e.totalTime));
    entries.forEach(e => e.isBest = e.totalTime === best);

    localStorage.setItem('rtg_leaderboard_v2', JSON.stringify(entries));
    updateLeaderboardTable();
}

/* ====================
   Flow Logic
   ==================== */

function initApp() {
    show('username-prompt');
    const input = $('player-name-input');
    if (input) input.focus();
    updateLeaderboardTable();
    loadMediapipe();
}

function onNameConfirmed() {
    const input = $('player-name-input');
    const name = input.value.trim();
    STATE.playerName = name || "Anonymous";
    show('setup');
    requestCamera();
}

function requestCamera() {
    const startBtn = $('start-reaction');
    startBtn.style.display = 'none';

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
        .then(stream => {
            videoStream = stream;
            $('video').srcObject = stream;
            const rxnVideo = $('reaction-video');
            if (rxnVideo) {
                rxnVideo.srcObject = stream;
                rxnVideo.classList.add('mirror-x'); // Invert camera
            }
            startBtn.style.display = 'inline-block';

            if (hands) {
                const video = $('video');
                // Ensure canvas is also mirrored for reaction game
                const rxnCanvas = $('reaction-canvas');
                if (rxnCanvas) rxnCanvas.classList.add('mirror-x');
                video.onloadedmetadata = () => {
                    const canvas = $('canvas');
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    startHands();
                };
            }
        })
        .catch(err => {
            console.error("Camera denied/error:", err);
            setStatus(`Camera not found (${err.message}). Gestures will be skipped.`);
            startBtn.style.display = 'inline-block';
        });
}

/* ====================
   Reaction Test Logic
   ==================== */
function startReactionGame() {
    STATE.current = 'reaction';
    STATE.round = 0;
    $('round-info').textContent = '';
    show('reaction-test');
    show('reaction-test');
    startTimer();
    // Ensure hands loop is running
    startHands();
    nextRound();
}

function nextRound() {
    if (STATE.round >= STATE.totalReactionRounds) {
        startGesturePhase();
        return;
    }
    STATE.round++;
    $('round-info').textContent = `Round ${STATE.round} of ${STATE.totalReactionRounds}`;
    const container = $('dot-container');
    container.innerHTML = '';

    COLORS.forEach(col => {
        const dot = createDot(col);
        container.appendChild(dot);
    });

    // Randomize Hand Prompt
    const hand = Math.random() > 0.5 ? 'Right' : 'Left';
    STATE.reactionHand = hand;
    const promptEl = $('hand-prompt');
    if (promptEl) {
        promptEl.textContent = `${hand.toUpperCase()} INDEX`;
        promptEl.style.color = hand === 'Right' ? 'cyan' : 'orange';
    }

    const greenDot = createDot(GREEN_COLOR);
    container.appendChild(greenDot);

    greenDot.addEventListener('click', onGreenClick);
    container.addEventListener('click', onWrongClick);
}

function onGreenClick(e) {
    e.stopPropagation();
    const container = $('dot-container');
    container.removeEventListener('click', onWrongClick);
    nextRound();
}

function onWrongClick(e) {
    if (!e.target.classList.contains('green')) {
        $('round-info').textContent = 'Missed! +1s Penalty';
        STATE.startTime -= 1000;
        STATE.round--;
        setTimeout(nextRound, 200);
    }
}

/* ====================
   Gesture Detection Logic
   ==================== */
let hands = null;
let pose = null;
let videoStream = null;
let gestureLock = false;

// Using latest CDN for stability
const MP_HANDS_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js';
const MP_POSE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js';
const MP_DRAWING_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js';

function loadMediapipe() {
    if (hands && pose) return;

    // Load Hands
    const scriptHands = document.createElement('script');
    scriptHands.src = MP_HANDS_URL;
    scriptHands.onload = () => {
        // Load Pose
        const scriptPose = document.createElement('script');
        scriptPose.src = MP_POSE_URL;
        scriptPose.onload = () => {
            // Load Drawing Utils
            const drawing = document.createElement('script');
            drawing.src = MP_DRAWING_URL;
            drawing.onload = () => {
                console.log("MediaPipe scripts loaded");
                initHandsInstance();
                initPoseInstance();
            };
            document.body.appendChild(drawing);
        };
        document.body.appendChild(scriptPose);
    };
    document.body.appendChild(scriptHands);
}

function initHandsInstance() {
    if (hands) return;
    if (typeof Hands === 'undefined') {
        console.error("Hands class not found even after load script");
        return;
    }

    hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    hands.onResults(onResults);
    console.log("Hands instance initialized");
}

function initPoseInstance() {
    if (pose) return;
    if (typeof Pose === 'undefined') {
        console.error("Pose class not found");
        return;
    }

    pose = new Pose({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}` });
    pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    pose.onResults(onPoseResults);
    console.log("Pose instance initialized");
}

function startGesturePhase() {
    STATE.current = 'gesture';
    show('gesture-detect');

    STATE.gestureSequence = shuffle(['rock', 'paper', 'scissor', 'raise_both_hands', 't_pose', 'raise_hand']);
    STATE.gestureIndex = 0;

    startHands();
    updateGesturePrompt();
}

function startHands() {
    if (STATE.isLoopRunning) return;
    STATE.isLoopRunning = true;

    const process = async () => {
        if (STATE.current !== 'gesture' && STATE.current !== 'reaction' && STATE.current !== 'setup') {
            STATE.isLoopRunning = false;
            return;
        }

        const activeVideo = STATE.current === 'reaction' ? $('reaction-video') : $('video');
        const activeCanvas = STATE.current === 'reaction' ? $('reaction-canvas') : $('canvas');

        // Clear canvas to prevent "stuck" landmarks when switching models
        if (activeCanvas) {
            const ctx = activeCanvas.getContext('2d');
            ctx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
        }

        if ((STATE.current === 'gesture' || STATE.current === 'reaction') && activeVideo && activeVideo.readyState >= 2) {
            if (STATE.current === 'reaction') {
                // Always use hands for reaction game
                if (hands) await hands.send({ image: activeVideo });
            } else {
                // Gesture Logic
                const currentGesture = STATE.gestureSequence[STATE.gestureIndex];
                const isBodyGesture = ['raise_both_hands', 't_pose', 'raise_hand'].includes(currentGesture);
                try {
                    if (isBodyGesture) {
                        if (pose) {
                            await pose.send({ image: activeVideo });
                        } else {
                            console.warn("Pose model not ready yet.");
                        }
                    } else if (!isBodyGesture && hands) {
                        await hands.send({ image: activeVideo });
                    }
                } catch (e) {
                    console.error("Mediapipe send error:", e);
                }
            }
        }

        requestAnimationFrame(process);
    };
    process();
}

function updateGesturePrompt() {
    const gesture = STATE.gestureSequence[STATE.gestureIndex];
    if (gesture) {
        // Overlay prompt
        const promptEl = $('gesture-overlay-prompt');
        const statusEl = $('gesture-overlay-status');

        if (promptEl) {
            // Text only, no icon
            promptEl.textContent = `${gesture.toUpperCase().replace('_', ' ')}`;
            promptEl.style.color = "var(--primary-color)";
        }

        if (statusEl) statusEl.textContent = "Detecting...";

        const infoEl = document.querySelector('.gesture-info');
        if (infoEl) infoEl.classList.remove('gesture-success');
    }
}

function onResults(results) {
    const isReaction = STATE.current === 'reaction';
    const canvas = isReaction ? $('reaction-canvas') : $('canvas');
    const video = isReaction ? $('reaction-video') : $('video');

    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    }

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Mirror for drawing if needed, but MediaPipe coords are normalized.
    // Usually we want to mirror the draw context so it feels natural?
    // But let's stick to standard first.

    // In reaction mode, we might want to mirror visual feedback to match user movement naturally?
    // CSS transform: scaleX(-1) on video/canvas usually handles this. 
    // Let's assume CSS handles visual mirroring if set.
    // If CSS mirrors, then drawing coords need to be 1-x ?
    // Check style.css: #video has no transform. 
    // Usually 'user' facingMode is mirrored by browser? No.
    // Let's draw standard for now.

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        // Handle multiple hands?
        // For reaction game, we need to check Handedness.
        // results.multiHandedness gives label 'Left' or 'Right'.

        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            const handedness = results.multiHandedness[i].label; // "Left" or "Right"

            // MediaPipe "Left" is usually the person's right hand in camera view (if mirrored).
            // But if we trust the label matching the prompt:
            // Prompt "Left Hand" -> User raises their Left Hand. 
            // In unmirrored video, that appears on the right side of screen.
            // MediaPipe says "Left" for the left hand.

            drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
            drawLandmarks(ctx, landmarks, { color: '#FF0000', lineWidth: 2, radius: 2 });

            if (isReaction && !gestureLock) {
                // Check Handedness
                // MediaPipe "Left" = User's physical Left Hand (if unmirrored camera).
                // However, usually for front camera, MP labels are inverted relative to physical reality if we treat it as a mirror.
                // Physical Right Hand -> MP Label "Left".
                // Physical Left Hand -> MP Label "Right".
                // Prompt "RIGHT INDEX" -> STATE.reactionHand = "Right". We need Physical Right (MP "Left").
                // So we want: handedness !== STATE.reactionHand.

                const expectedLabel = STATE.reactionHand === 'Right' ? 'Left' : 'Right';

                const errorEl = $('error-message');
                if (handedness === expectedLabel) {
                    if (errorEl) errorEl.classList.remove('visible');

                    // Index Finger Tip is index 8
                    const indexTip = landmarks[8];
                    if (indexTip) {
                        // Canvas is properly mirrored via CSS .mirror-x and object-fit: fill.
                        // But indexTip.x is normalized [0,1] relative to the image source.
                        // Because the canvas has scaleX(-1), drawing at X=10 means Visual Right.
                        // But indexTip.x from MediaPipe corresponds to the UNSCALED image.
                        // If user is on Right of camera view (x=0.9), it draws at internal x=0.9*width.
                        // Visual location = Flipped(0.9) = Left side of screen.
                        // Mirror logic holds.

                        const x = indexTip.x * canvas.width;
                        const y = indexTip.y * canvas.height;

                        // Draw Cursor
                        ctx.beginPath();
                        ctx.arc(x, y, 10, 0, 2 * Math.PI);
                        ctx.fillStyle = "yellow";
                        ctx.fill();

                        // Collision Detection with object-fit: cover and mirror-x
                        const rect = canvas.getBoundingClientRect();
                        const vidW = video.videoWidth;
                        const vidH = video.videoHeight;

                        // Calculate Scale & Offset (Note: rect dimensions are the limit)
                        const scale = Math.max(rect.width / vidW, rect.height / vidH);
                        const xOffset = (rect.width - vidW * scale) / 2;
                        const yOffset = (rect.height - vidH * scale) / 2;

                        // Mirrored X calculation: rect.right - (projected_x)
                        const clientX = rect.right - (indexTip.x * vidW * scale + xOffset);
                        const clientY = rect.top + (indexTip.y * vidH * scale + yOffset);

                        // Check Collision
                        const el = document.elementFromPoint(clientX, clientY);
                        if (el && el.classList.contains('dot') && el.classList.contains('green')) {
                            el.click();
                            ctx.beginPath();
                            ctx.arc(x, y, 20, 0, 2 * Math.PI);
                            ctx.fillStyle = "rgba(0, 255, 0, 0.7)";
                            ctx.fill();
                        }
                    }
                } else {
                    // Wrong Hand
                    if (errorEl) {
                        errorEl.textContent = "WRONG FINGER";
                        errorEl.classList.add('visible');
                    }
                }
            } else if (STATE.current === 'gesture' && !gestureLock) {
                // Gesture Mode Logic (Single hand assumption usually, but loop handles all)
                // We only process the first hand for simplicity in gesture mode usually?
                // Existing logic used `results.multiHandLandmarks[0]`.
                // Let's stick to that for gesture mode to avoid breaking logic.
                if (i === 0) {
                    const detected = classifyGesture(landmarks);
                    if (detected) {
                        if (detected === STATE.gestureSequence[STATE.gestureIndex]) {
                            handleGestureSuccess(detected);
                        } else {
                            const statusEl = $('gesture-overlay-status');
                            if (statusEl) statusEl.textContent = `Detected: ${detected.toUpperCase()}`;
                        }
                    }
                }
            }
        }
    } else {
        // No hands
        if (STATE.current === 'gesture') {
            const statusEl = $('gesture-overlay-status');
            if (statusEl) statusEl.textContent = "Bring hand into view...";
        }
    }
    ctx.restore();
}

function onPoseResults(results) {
    const canvas = $('canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const video = $('video');
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    }

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.poseLandmarks) {
        const landmarks = results.poseLandmarks;

        // Attempt to find connections definitions with fallbacks
        let connections = window.POSE_CONNECTIONS;
        if (!connections && typeof Pose !== 'undefined') {
            connections = Pose.POSE_CONNECTIONS;
        }
        if (!connections && window.mp_pose) {
            connections = window.mp_pose.POSE_CONNECTIONS;
        }

        if (window.drawConnectors && connections) {
            drawConnectors(ctx, landmarks, connections, { color: '#00FF00', lineWidth: 5 });
        } else if (!connections) {
            console.warn("POSE_CONNECTIONS not found, skipping connectors");
        }

        if (window.drawLandmarks) {
            drawLandmarks(ctx, landmarks, { color: '#FF0000', lineWidth: 2, radius: 2 });
        }

        if (STATE.current === 'gesture' && !gestureLock) {
            const detected = classifyBodyGesture(landmarks);
            if (detected) {
                if (detected === STATE.gestureSequence[STATE.gestureIndex]) {
                    handleGestureSuccess(detected);
                } else {
                    const statusEl = $('gesture-overlay-status');
                    if (statusEl) statusEl.textContent = `Detected: ${detected.toUpperCase().replace('_', ' ')}`;
                }
            } else {
                const statusEl = $('gesture-overlay-status');
                if (statusEl) statusEl.textContent = `Tracking Body...`;
            }
        }
    } else {
        if (STATE.current === 'gesture') {
            const statusEl = $('gesture-overlay-status');
            if (statusEl) statusEl.textContent = "Step back to show upper body...";
        }
    }
    ctx.restore();
}

function handleGestureSuccess(detected) {
    gestureLock = true;

    const statusEl = $('gesture-overlay-status');
    if (statusEl) statusEl.textContent = `✅ CLEARED: ${detected.toUpperCase().replace('_', ' ')}`;

    // Trigger Green Blink
    const flashEl = $('flash-overlay');
    if (flashEl) {
        flashEl.classList.remove('flash-active');
        void flashEl.offsetWidth; // trigger reflow
        flashEl.classList.add('flash-active');
    }

    const infoEl = document.querySelector('.gesture-info');
    if (infoEl) infoEl.classList.add('gesture-success');

    setTimeout(() => {
        STATE.gestureIndex++;
        if (STATE.gestureIndex >= STATE.gestureSequence.length) {
            finishGame();
        } else {
            updateGesturePrompt();
        }
        gestureLock = false;
    }, 500);
}

function classifyGesture(landmarks) {
    // landmarks: 21 points. 0=wrist. Tips: 4,8,12,16,20. MCP: 2,5,9,13,17.

    const tips = [4, 8, 12, 16, 20];
    const mcps = [2, 5, 9, 13, 17]; // PIP or MCP. Use PIP/dip for better detection usually, but MCP is base.
    // Basic heuristic: Is tip below MCP (y-coordinate)? Note Y increases downwards.
    // Extended finger: tip.y < mcp.y (higher on screen)
    // Folded finger: tip.y > mcp.y (lower on screen)

    const extended = [];

    // Check 4 fingers (Index to Pinky)
    for (let i = 1; i < 5; i++) {
        extended.push(landmarks[tips[i]].y < landmarks[mcps[i]].y); // True if extended
    }

    // Thumb (id 0) - check x distance?
    // Thumb tip (4) vs IP (3) or MCP (2).
    // Simple heuristic: Thumb extended if distance(4, 17) is large? 
    // Or just ignore thumb for simple R/P/S which usually depends on fingers being clearly up/down.
    // Let's rely on 4 fingers + thumb for 'paper' maybe?

    const index = extended[0];
    const middle = extended[1];
    const ring = extended[2];
    const pinky = extended[3];

    // Rock: 0 fingers extended (all folded)
    if (!index && !middle && !ring && !pinky) return 'rock';

    // Paper: 4 fingers extended
    if (index && middle && ring && pinky) return 'paper';

    // Scissor: 2 fingers extended (Index, Middle)
    if (index && middle && !ring && !pinky) return 'scissor';

    return null;
}

function classifyBodyGesture(landmarks) {
    // MediaPipe Pose Landmarks: 
    // 11=left_shoulder, 12=right_shoulder
    // 13=left_elbow, 14=right_elbow
    // 15=left_wrist, 16=right_wrist
    // 0=nose

    const nose = landmarks[0];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftElbow = landmarks[13];
    const rightElbow = landmarks[14];
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];

    // Visibility check (optional but good practice)
    if (leftWrist.visibility < 0.5 || rightWrist.visibility < 0.5) return null;

    // Helper: Angle between three points (A, B, C)
    function calculateAngle(a, b, c) {
        const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
        let angle = Math.abs(radians * 180.0 / Math.PI);
        if (angle > 180.0) angle = 360 - angle;
        return angle;
    }

    // 1. Hands Up / Surrender
    // Both wrists above nose/eyes (y is smaller when higher)
    // Arms nearly straight (high elbow angle)
    const leftArmAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
    const rightArmAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);

    if (leftWrist.y < nose.y && rightWrist.y < nose.y && leftArmAngle > 140 && rightArmAngle > 140) {
        return 'raise_both_hands';
    }

    // 2. T-Pose
    // Wrists approx same height as shoulders
    // Elbows approx 180 degrees
    const tPoseYThreshold = 0.15; // increased tolerance
    const tPoseAngleThreshold = 140;

    const leftWristLevel = Math.abs(leftWrist.y - leftShoulder.y) < tPoseYThreshold;
    const rightWristLevel = Math.abs(rightWrist.y - rightShoulder.y) < tPoseYThreshold;

    if (leftWristLevel && rightWristLevel && leftArmAngle > tPoseAngleThreshold && rightArmAngle > tPoseAngleThreshold) {
        return 't_pose';
    }

    // 3. Raise Your Hand (One hand up)
    // One wrist above shoulder (significantly), other below shoulder
    const leftUp = leftWrist.y < leftShoulder.y && leftArmAngle > 120;
    const rightUp = rightWrist.y < rightShoulder.y && rightArmAngle > 120;

    const leftDown = leftWrist.y > leftShoulder.y;
    const rightDown = rightWrist.y > rightShoulder.y;

    if ((leftUp && rightDown) || (rightUp && leftDown)) {
        return 'raise_hand';
    }

    return null;
}

function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function finishGame() {
    stopTimer();
    const totalTime = (STATE.endTime - STATE.startTime) / 1000;
    saveScore(STATE.playerName, totalTime);
    show('leaderboard');
}

/* ====================
   Event Listeners
   ==================== */
window.addEventListener('load', () => {
    initApp();

    const confirmBtn = $('confirm-name');
    if (confirmBtn) confirmBtn.addEventListener('click', onNameConfirmed);

    const nameInput = $('player-name-input');
    if (nameInput) {
        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') onNameConfirmed();
        });
    }

    const startReactionBtn = $('start-reaction');
    if (startReactionBtn) startReactionBtn.addEventListener('click', startReactionGame);

    const skipBtn = $('skip-gesture');
    if (skipBtn) skipBtn.addEventListener('click', finishGame);

    const restartBtn = $('restart-game');
    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            location.reload();
        });
    }

    const clearBtn = $('clear-leaderboard');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm('Clear all leaderboard entries?')) {
                localStorage.removeItem('rtg_leaderboard_v2');
                updateLeaderboardTable();
            }
        });
    }

    // New Leaderboard logic
    const homeLeaderboardBtn = $('view-leaderboard-home');
    if (homeLeaderboardBtn) {
        homeLeaderboardBtn.addEventListener('click', () => {
            show('leaderboard');
            // Hide controls that are irrelevant? 
            // Leaderboard usually has "Play Again" (restart).
            // That works for going back to logic start.
        });
    }
});

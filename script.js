// script.js - Core logic for Reaction Time Game with Hand Gesture Detection

const GESTURE_ICONS = {
    'rock': '✊',
    'paper': '✋',
    'scissor': '✌️',
    'hands_up': '🙌',
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

    // Gesture State
    gestureSequence: [],
    gestureIndex: 0,

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
            startBtn.style.display = 'inline-block';

            if (hands) {
                const video = $('video');
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
    startTimer();
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

    STATE.gestureSequence = shuffle(['rock', 'paper', 'scissor', 'hands_up', 't_pose', 'raise_hand']);
    STATE.gestureIndex = 0;

    startHands();
    updateGesturePrompt();
}

function startHands() {
    const video = $('video');
    const canvas = $('canvas');
    if (canvas && video.readyState >= 1) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    }

    const process = async () => {
        if (STATE.current === 'gesture' && video.readyState >= 2) {
            const currentGesture = STATE.gestureSequence[STATE.gestureIndex];
            const isBodyGesture = ['hands_up', 't_pose', 'raise_hand'].includes(currentGesture);

            try {
                if (isBodyGesture && pose) {
                    await pose.send({ image: video });
                } else if (!isBodyGesture && hands) {
                    await hands.send({ image: video });
                }
            } catch (e) {
                console.error("Mediapipe send error:", e);
            }
        }
        if (STATE.current === 'gesture' || STATE.current === 'setup') {
            requestAnimationFrame(process);
        }
    };
    process();
}

function updateGesturePrompt() {
    const gesture = STATE.gestureSequence[STATE.gestureIndex];
    if (gesture) {
        const iconEl = $('gesture-target-icon');
        if (iconEl) iconEl.textContent = GESTURE_ICONS[gesture];

        $('gesture-prompt').textContent = `Perform: ${gesture.toUpperCase()}`;
        $('gesture-status').textContent = "Detecting...";

        const infoEl = document.querySelector('.gesture-info');
        if (infoEl) infoEl.classList.remove('gesture-success');
    }
}

function onResults(results) {
    // Always draw if available, to debug. Even if lock/current state issues.
    // If we're not in gesture mode, we might not want to draw, but for setup we might?
    // User wants to see feature points.

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

    // Draw landmarks if found
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];

        // Ensure globals from drawing_utils are available
        if (window.drawConnectors && window.HAND_CONNECTIONS) {
            drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
        }
        if (window.drawLandmarks) {
            drawLandmarks(ctx, landmarks, { color: '#FF0000', lineWidth: 2, radius: 2 });
        }

        // Only classify if proper state
        if (STATE.current === 'gesture' && !gestureLock) {
            const detected = classifyGesture(landmarks);
            if (detected) {
                if (detected === STATE.gestureSequence[STATE.gestureIndex]) {
                    handleGestureSuccess(detected);
                } else {
                    $('gesture-status').textContent = `Detected: ${detected.toUpperCase()}`;
                }
            } else {
                $('gesture-status').textContent = `Tracking Hand...`;
            }
        }
    } else {
        // No hands found
        if (STATE.current === 'gesture') {
            $('gesture-status').textContent = "Bring hand into view...";
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

        if (window.drawConnectors && window.POSE_CONNECTIONS) {
            drawConnectors(ctx, landmarks, POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
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
                    $('gesture-status').textContent = `Detected: ${detected.toUpperCase().replace('_', ' ')}`;
                }
            } else {
                $('gesture-status').textContent = `Tracking Body...`;
            }
        }
    } else {
        if (STATE.current === 'gesture') {
            $('gesture-status').textContent = "Step back to show upper body...";
        }
    }
    ctx.restore();
}

function handleGestureSuccess(detected) {
    gestureLock = true;

    $('gesture-status').textContent = `✅ CLEARED: ${detected.toUpperCase()}`;
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
        return 'hands_up';
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

    $('confirm-name').addEventListener('click', onNameConfirmed);

    $('player-name-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') onNameConfirmed();
    });

    $('start-reaction').addEventListener('click', startReactionGame);

    $('skip-gesture').addEventListener('click', finishGame);

    $('restart-game').addEventListener('click', () => {
        location.reload();
    });

    $('clear-leaderboard').addEventListener('click', () => {
        if (confirm('Clear all leaderboard entries?')) {
            localStorage.removeItem('rtg_leaderboard_v2');
            updateLeaderboardTable();
        }
    });
});

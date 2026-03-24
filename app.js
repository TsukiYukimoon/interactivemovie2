// Orb logic for tutorial and final decision
function showOrb({duration = 6, goal = 1200, tutorial = false, onComplete, fallbackAvg = 16}) {
  const orbOverlay = document.getElementById('orbOverlay');
  const orbContainer = document.getElementById('orbContainer');
  const orb = document.getElementById('orb');
  const orbScore = document.getElementById('orbScore');
  const orbMsg = document.getElementById('orbMsg');
  const orbLevel = document.getElementById('orbLevel');
  const orbCombo = document.getElementById('orbCombo');
  const orbProgressFill = document.getElementById('orbProgressFill');

  if (!orbOverlay || !orb || !orbScore || !orbMsg) {
    if (onComplete) onComplete(0);
    return;
  }

  orbOverlay.classList.add('visible');
  // Use mode-specific styling so final round cannot inherit tutorial visuals.
  if (tutorial) {
    orbOverlay.classList.add('tutorial-mode');
    orbOverlay.classList.remove('final-mode');
  } else {
    orbOverlay.classList.add('final-mode');
    orbOverlay.classList.remove('tutorial-mode');
  }
  orbOverlay.setAttribute('aria-hidden', 'false');
  orbScore.textContent = '0';
  if (orbProgressFill) orbProgressFill.style.width = '0%';
  if (orbContainer) orbContainer.style.setProperty('--orb-intensity', '0.2');
  let score = 0;
  let max = 0;
  let streak = 0;
  let t = 0;
  let loudnessSum = 0;
  let loudnessSamples = 0;
  let analyserMissing = false;

  orbMsg.textContent = tutorial
    ? 'Tutorial: charge the orb with your voice'
    : 'Final round: silent = bad, voice = neutral, scream = good';

  function levelName(power) {
    if (power >= 80) return 'MYTHIC';
    if (power >= 60) return 'EPIC';
    if (power >= 45) return 'HERO';
    if (power >= 30) return 'RISING';
    return 'NOVICE';
  }

  function finish() {
    orbOverlay.classList.remove('visible');
    orbOverlay.classList.remove('tutorial-mode', 'final-mode');
    orbOverlay.setAttribute('aria-hidden', 'true');
    const avgValue = analyserMissing
      ? fallbackAvg
      : loudnessSum / Math.max(1, loudnessSamples);
    if (onComplete) onComplete(score, { max, streak, avg: avgValue });
  }

  function tick() {
    let avg = 0;
    if (!state.analyser) {
      analyserMissing = true;
      orbMsg.textContent = tutorial
        ? 'Mic not ready; finishing tutorial...'
        : 'Listening... (mic offline, will pick neutral if silent)';
      // Try to rebuild analyser without aborting the round; keep timer running.
      void ensureAudioAnalyser().catch(() => {});
    } else {
      if (state.audioContext && state.audioContext.state === "suspended") {
        void state.audioContext.resume().catch(() => {});
      }

      const data = new Uint8Array(state.analyser.frequencyBinCount);
      state.analyser.getByteFrequencyData(data);
      avg = data.reduce((a, b) => a + b, 0) / data.length;
      if (orbContainer) {
        const intensity = Math.min(1, Math.max(0.12, avg / 80));
        orbContainer.style.setProperty('--orb-intensity', intensity.toFixed(3));
      }

      streak = avg > 34 ? streak + 1 : Math.max(0, streak - 1);
      const comboMult = 1 + Math.min(6, Math.floor(streak / 8)) * 0.2;
      const gain = Math.max(1, Math.round(avg * comboMult));

      score += gain;
      max = Math.max(max, avg);
      loudnessSum += avg;
      loudnessSamples += 1;

      const scale = 1 + Math.min(0.9, avg / 120);
      orb.style.transform = `scale(${scale})`;
      orb.style.boxShadow = `0 0 ${24 + avg / 2}px ${6 + avg / 12}px rgba(90, 230, 255, 0.88)`;
      orbScore.textContent = Math.round(score).toString();

      const level = levelName(avg);
      if (orbLevel) orbLevel.textContent = `LEVEL: ${level}`;
      if (orbCombo) orbCombo.textContent = `COMBO x${Math.max(0, Math.floor(streak / 5))}`;
    }

    if (tutorial) {
      if (orbProgressFill) {
        const progressPct = Math.min(100, (score / Math.max(goal, 1)) * 100);
        orbProgressFill.style.width = `${progressPct.toFixed(1)}%`;
      }
      if (score >= goal) {
        orbMsg.textContent = 'Perfect. Audience is ready!';
        setTimeout(finish, 700);
        return;
      }
      const remaining = Math.max(0, goal - score);
      orbMsg.textContent = `Charge: ${Math.round((goal - remaining) / goal * 100)}%`;
    } else if (orbProgressFill) {
      const timePct = Math.min(100, (t / Math.max(duration, 0.1)) * 100);
      orbProgressFill.style.width = `${timePct.toFixed(1)}%`;
    }

    t += 0.1;
    if (t >= duration) {
      orbMsg.textContent = tutorial ? 'Tutorial complete!' : 'Decision locked!';
      setTimeout(finish, 500);
      return;
    }
    setTimeout(tick, 100);
  }

  tick();
}

function pickEndingFromScore(score, durationSec, metrics = {}) {
  // Final orb mapping: quiet/silent -> bad, medium voice -> neutral, scream/loud -> good.
  const avgLoudness = metrics.avg ?? (score / Math.max(1, durationSec)) / 10;
  if (avgLoudness >= 32) return 'good';
  if (avgLoudness >= 16) return 'neutral';
  return 'bad';
}
const ROLES = ["prologue", "main", "bad", "neutral", "good"];

const STATES = {
  PERMISSION: 0,
  PROLOGUE: 1,
  TUTORIAL_ORB: 2,
  MAIN: 3,
  FINAL_ORB: 4,
  ENDING: 5
};

const state = {
  appState: STATES.PERMISSION,
  objectUrls: { prologue: null, main: null, bad: null, neutral: null, good: null },
  files: { prologue: null, main: null, bad: null, neutral: null, good: null },
  preloadReady: { prologue: false, main: false, bad: false, neutral: null, good: false },
  started: false,
  prologueRunning: false,
  prologueCompleted: false,
  prologueCancelToken: 0,
  endedSelected: false,
  decisionTriggered: false,
  decisionRunning: false,
  mainEnded: false,
  pendingEndingRole: null,
  manualOverride: null,
  activeRole: "main",
  decisionCancelToken: 0,
  reverseRafId: 0,
  reversePlaybackActive: false,
  reverseSessionId: 0,
  finalDecisionTriggered: false,
  finalDecisionTimeoutId: 0,
  finalDecisionPollId: 0,
  finalDecisionHardTimerId: 0,
  finalDecisionArmToken: 0,
  isFinalDecision: false,
  micStream: null,
  audioContext: null,
  analyser: null,
  orbActive: false,
  orbScore: 0,
  orbInterval: null,
  config: {
    lowThreshold: 0.01,
    highThreshold: 0.03,
    decisionTimestamp: "end-10s",
    decisionWindowSec: 15,
    baselineSec: 1,
    pauseOnDecision: false,
    audioFadeMs: 320,
    transitionFadeMs: 420,
    prologueDurationSec: 10, // Total prologue duration
    introCountdownSec: 15,
    enableLegacyAutoDecision: false,
  },
};
// Request microphone permission and setup audio analyser
async function requestMicrophone() {
  try {
    return await ensureAudioAnalyser();
  } catch (e) {
    alert('Microphone access is required for the interactive experience.');
    return false;
  }
}

async function ensureAudioAnalyser() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return false;
  }

  if (!state.micStream || !state.micStream.active) {
    state.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  }

  if (!state.audioContext || state.audioContext.state === "closed") {
    state.audioContext = new AudioCtx();
  }

  if (!state.analyser) {
    const source = state.audioContext.createMediaStreamSource(state.micStream);
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 256;
    source.connect(state.analyser);
  }

  if (state.audioContext.state === "suspended") {
    try {
      await state.audioContext.resume();
    } catch (_) {
      // Ignore; caller will still handle missing live analyser data.
    }
  }

  return !!state.analyser;
}

// Show orb and start measuring audio
function showOrbWithAudio(durationSec, onComplete) {
  state.orbActive = true;
  state.orbScore = 0;
  let maxVolume = 0;
  const orb = document.getElementById('soundRing');
  const orbText = document.getElementById('energyScore');
  orb && (orb.style.display = 'block');
  let t = 0;
  function updateOrb() {
    if (!state.orbActive || !state.analyser) return;
    const data = new Uint8Array(state.analyser.frequencyBinCount);
    state.analyser.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    maxVolume = Math.max(maxVolume, avg);
    // Visualize orb size and glow
    if (orb) {
      orb.style.transform = `scale(${1 + avg / 128})`;
      orb.style.boxShadow = `0 0 ${10 + avg / 2}px 4px rgba(0,255,255,${0.2 + avg / 255})`;
    }
    if (orbText) {
      orbText.textContent = Math.round(avg * 10).toString();
    }
    t += 0.1;
    if (t < durationSec) {
      state.orbInterval = setTimeout(updateOrb, 100);
    } else {
      state.orbActive = false;
      if (orb) {
        orb.style.display = 'none';
        orb.style.transform = '';
        orb.style.boxShadow = '';
      }
      if (onComplete) onComplete(maxVolume);
    }
  }
  updateOrb();
}

const els = {
  appRoot: document.getElementById("appRoot"),
  setupPanel: document.getElementById("setupPanel"),
  stage: document.getElementById("stage"),
  screenVideo: document.getElementById("screenVideo"),
  startBtn: document.getElementById("startBtn"),
  preloadStatus: document.getElementById("preloadStatus"),
  decisionOverlay: document.getElementById("decisionOverlay"),
  prologueOverlay: document.getElementById("prologueOverlay"),
  prologueRing: document.getElementById("prologueRing"),
  prologueCountdown: document.getElementById("prologueCountdown"),
  prologueTitle: document.getElementById("prologueTitle"),
  prologueInstruction: document.getElementById("prologueInstruction"),
  prologueFeedback: document.getElementById("prologueFeedback"),
  invitationOverlay: document.getElementById("invitationOverlay"),
  invitationRing: document.getElementById("invitationRing"),
  invitationCountdown: document.getElementById("invitationCountdown"),
  invitationTitle: document.getElementById("invitationTitle"),
  invitationInstruction: document.getElementById("invitationInstruction"),
  invitationFeedback: document.getElementById("invitationFeedback"),
  energyScore: document.getElementById("energyScore"),
  introOverlay: document.getElementById("introOverlay"),
  introRing: document.getElementById("introRing"),
  introCountdown: document.getElementById("introCountdown"),
  soundRing: document.getElementById("soundRing"),
  soundOrb: document.getElementById("soundOrb"),
  overlayText: document.getElementById("overlayText"),
  fadeCurtain: document.getElementById("fadeCurtain"),
  adminPanel: document.getElementById("adminPanel"),
  runtimeInfo: document.getElementById("runtimeInfo"),
  lowThreshold: document.getElementById("lowThreshold"),
  highThreshold: document.getElementById("highThreshold"),
  lowThresholdValue: document.getElementById("lowThresholdValue"),
  highThresholdValue: document.getElementById("highThresholdValue"),
  decisionTimestamp: document.getElementById("decisionTimestamp"),
  decisionWindow: document.getElementById("decisionWindow"),
  pauseOnDecision: document.getElementById("pauseOnDecision"),
    // loop controls removed
  preloadVideos: {
    prologue: document.getElementById("preload-prologue"),
    main: document.getElementById("preload-main"),
    bad: document.getElementById("preload-bad"),
    neutral: document.getElementById("preload-neutral"),
    good: document.getElementById("preload-good"),
  },
  fileInputs: {
    prologue: document.getElementById("input-prologue"),
    main: document.getElementById("input-main"),
    bad: document.getElementById("input-bad"),
    neutral: document.getElementById("input-neutral"),
    good: document.getElementById("input-good"),
  },
  fileNames: {
    prologue: document.getElementById("name-prologue"),
    main: document.getElementById("name-main"),
    bad: document.getElementById("name-bad"),
    neutral: document.getElementById("name-neutral"),
    good: document.getElementById("name-good"),
  },
};


window.addEventListener('DOMContentLoaded', () => {
  // Show start panel, hide setup panel
  document.getElementById('startPanel').style.display = '';
  document.getElementById('setupPanel').style.display = 'none';
  if (els.stage) els.stage.style.display = 'none';
  const micBtn = document.getElementById('micStartBtn');
  micBtn.addEventListener('click', async () => {
    const status = document.getElementById('micStatus');
    status.textContent = 'Requesting microphone permission...';
    try {
      await ensureAudioAnalyser();
      status.textContent = 'Microphone ready!';
      // Transition to setup panel (State 1)
      document.getElementById('startPanel').style.display = 'none';
      document.getElementById('setupPanel').style.display = '';
      state.appState = STATES.PROLOGUE;
      // You can now call your setup/init logic here
      init();
    } catch (e) {
      status.textContent = 'Microphone access denied. Please allow microphone to continue.';
    }
  });
});

function init() {
  bindFileSlots();
  bindAdminInputs();
  bindGlobalKeys();
  bindVideoFlow();

  els.startBtn.addEventListener("click", startExperience);
  els.fadeCurtain.style.transitionDuration = `${state.config.transitionFadeMs}ms`;
  if (els.decisionWindow) {
    els.decisionWindow.value = String(state.config.decisionWindowSec);
  }
  setRuntime("Waiting for files");
}

function bindFileSlots() {
  for (const role of ROLES) {
    const input = els.fileInputs[role];
    const card = input.closest(".file-card");

    input.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) setRoleFile(role, file);
    });

    if (!card) continue;

    card.addEventListener("dragover", (event) => {
      event.preventDefault();
      card.classList.add("dragover");
    });
    card.addEventListener("dragleave", () => card.classList.remove("dragover"));
    card.addEventListener("drop", (event) => {
      event.preventDefault();
      card.classList.remove("dragover");
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (!file) return;
      setRoleFile(role, file);
      syncInputFiles(input, file);
    });
  }
}

function bindAdminInputs() {
  els.lowThreshold.addEventListener("input", () => {
    state.config.lowThreshold = parseFloat(els.lowThreshold.value) || 0;
    if (state.config.highThreshold < state.config.lowThreshold) {
      state.config.highThreshold = state.config.lowThreshold;
      els.highThreshold.value = String(state.config.highThreshold);
    }
    renderThresholdLabels();
  });

  els.highThreshold.addEventListener("input", () => {
    state.config.highThreshold = parseFloat(els.highThreshold.value) || 0;
    if (state.config.highThreshold < state.config.lowThreshold) {
      state.config.lowThreshold = state.config.highThreshold;
      els.lowThreshold.value = String(state.config.lowThreshold);
    }
    renderThresholdLabels();
  });

  els.decisionTimestamp.addEventListener("change", () => {
    state.config.decisionTimestamp = els.decisionTimestamp.value.trim() || "end-10s";
  });

  els.decisionWindow.addEventListener("change", () => {
    const value = parseFloat(els.decisionWindow.value);
    state.config.decisionWindowSec = clamp(Number.isFinite(value) ? value : 6, 2, 15);
    els.decisionWindow.value = String(state.config.decisionWindowSec);
  });

  els.pauseOnDecision.addEventListener("change", () => {
    state.config.pauseOnDecision = els.pauseOnDecision.checked;
  });
  // Loop controls and listeners removed
  renderThresholdLabels();
}

function bindGlobalKeys() {
  window.addEventListener("keydown", (event) => {
    if (isTextInput(event.target)) return;

    const key = event.key.toLowerCase();
    if (key === "a") {
        if (els.adminPanel.classList.contains("hidden")) {
          els.adminPanel.classList.remove("hidden");
        } else {
          els.adminPanel.classList.add("hidden");
        }
        return;
    }

    if (key === "m") {
      void returnToMenu();
      return;
    }

    if (key === "l") {
      // loop mode key removed
      return;
    }

    if (key === "1") forceEnding("bad");
    if (key === "2") forceEnding("neutral");
    if (key === "3") forceEnding("good");
  });
}

function bindVideoFlow() {
  els.screenVideo.addEventListener("timeupdate", () => {
    if (state.started && state.activeRole === "main" && !state.endedSelected && !state.finalDecisionTriggered) {
      if (isWithinMainFinalDecisionWindow()) {
        void launchFinalOrbDecision(getMainFinalDecisionWindowSec());
      } else if (!state.finalDecisionTimeoutId) {
        armMainFinalDecision();
      }
    }

    if (!state.config.enableLegacyAutoDecision) return;
    if (!state.started || state.activeRole !== "main" || state.decisionTriggered || state.endedSelected) {
      return;
    }
    const triggerAt = resolveDecisionTriggerTime();
    if (triggerAt == null) return;
    if (els.screenVideo.currentTime >= triggerAt) {
      void beginDecisionSequence();
    }
  });

  els.screenVideo.addEventListener("ended", () => {
    if (state.activeRole === "main" && !state.endedSelected) {
      state.mainEnded = true;
      if (!state.finalDecisionTriggered && !state.decisionRunning) {
        const decisionWindowSec = getMainFinalDecisionWindowSec() || state.config.decisionWindowSec || 15;
        setRuntime("Main ended before orb fired; forcing final orb now");
        void launchFinalOrbDecision(decisionWindowSec);
        return;
      }
      if (state.decisionRunning) {
        setRuntime("Main finished, finalizing vote...");
        return;
      }

      const queued = resolveAvailableEnding(state.pendingEndingRole || state.manualOverride || "neutral");
      if (!queued) {
        setRuntime("No ending video available");
        return;
      }
      if (!state.pendingEndingRole) {
        console.warn("No queued ending decision by main end. Defaulting to neutral.");
      }
      void chooseAndPlayEnding(queued, "main-ended");
      return;
    }

    if (shouldLoopCurrentVideo()) {
      // loop handling removed
      return;
    }

    // Experience ends after credits - no final decision orb
    setRuntime(`Finished: ${state.activeRole.toUpperCase()}`);
  });

  els.screenVideo.addEventListener("loadedmetadata", () => {
    if (state.started && state.activeRole === "main" && !state.endedSelected && !state.finalDecisionTriggered) {
      armMainFinalDecision();
    }
  });

  els.screenVideo.addEventListener("durationchange", () => {
    if (state.started && state.activeRole === "main" && !state.endedSelected && !state.finalDecisionTriggered) {
      armMainFinalDecision();
    }
  });
}

function clearFinalDecisionTimer() {
  if (state.finalDecisionTimeoutId) {
    clearTimeout(state.finalDecisionTimeoutId);
    state.finalDecisionTimeoutId = 0;
  }
  state.finalDecisionArmToken += 1;
}

function clearFinalDecisionHardTimer() {
  if (state.finalDecisionHardTimerId) {
    clearTimeout(state.finalDecisionHardTimerId);
    state.finalDecisionHardTimerId = 0;
  }
}

function clearFinalDecisionWatchdog() {
  if (state.finalDecisionPollId) {
    clearInterval(state.finalDecisionPollId);
    state.finalDecisionPollId = 0;
  }
}

function startFinalDecisionWatchdog() {
  clearFinalDecisionWatchdog();
  if (!state.started || state.activeRole !== "main" || state.endedSelected || state.finalDecisionTriggered) return;
  state.finalDecisionPollId = setInterval(() => {
    if (!state.started || state.activeRole !== "main" || state.endedSelected || state.finalDecisionTriggered) {
      clearFinalDecisionWatchdog();
      return;
    }
    if (isWithinMainFinalDecisionWindow()) {
      clearFinalDecisionWatchdog();
      clearFinalDecisionHardTimer();
      void launchFinalOrbDecision(getMainFinalDecisionWindowSec());
    }
  }, 500);
}

function armFinalDecisionHardTimer() {
  clearFinalDecisionHardTimer();
  if (!state.started || state.activeRole !== "main" || state.endedSelected || state.finalDecisionTriggered) return;
  const duration = Number.isFinite(els.screenVideo.duration) ? els.screenVideo.duration : NaN;
  if (!Number.isFinite(duration) || duration <= 0) {
    // Retry once metadata arrives.
    state.finalDecisionHardTimerId = setTimeout(armFinalDecisionHardTimer, 1000);
    return;
  }
  const decisionWindowSec = getMainFinalDecisionWindowSec();
  const triggerAt = Math.max(0, duration - decisionWindowSec);
  const fireMs = Math.max(0, (triggerAt - els.screenVideo.currentTime) * 1000);
  state.finalDecisionHardTimerId = setTimeout(() => {
    state.finalDecisionHardTimerId = 0;
    if (!state.started || state.activeRole !== "main" || state.endedSelected || state.finalDecisionTriggered) return;
    void launchFinalOrbDecision(decisionWindowSec);
  }, fireMs);
}

async function launchFinalOrbDecision(durationSec) {
  if (!state.started || state.activeRole !== "main" || state.endedSelected || state.finalDecisionTriggered) return;

  await ensureAudioAnalyser().catch(() => false);
  state.finalDecisionTriggered = true;
  state.decisionRunning = true;
  state.pendingEndingRole = null;
  try {
    els.screenVideo.pause();
  } catch (_) {}
  showEncouragementOverlay(true);
  setRuntime("Final orb active on main video");

  showOrb({
    duration: durationSec,
    tutorial: false,
    onComplete: (score, metrics) => {
      const ending = resolveAvailableEnding(pickEndingFromScore(score, durationSec, metrics));
      state.pendingEndingRole = ending;
      state.decisionRunning = false;
      setRuntime(`Final orb locked: ${ending ? ending.toUpperCase() : "NONE"}`);
      showEncouragementOverlay(false);
      if (ending && state.activeRole === "main" && !state.endedSelected) {
        void chooseAndPlayEnding(ending, "main-final-orb");
      }
    }
  });
}

function getMainFinalDecisionWindowSec() {
  const duration = Number.isFinite(els.screenVideo.duration) ? els.screenVideo.duration : 0;
  if (duration <= 0) return 0;
  return Math.min(state.config.decisionWindowSec, Math.max(4, duration - 0.25));
}

function isWithinMainFinalDecisionWindow() {
  const duration = Number.isFinite(els.screenVideo.duration) ? els.screenVideo.duration : 0;
  if (duration <= 0) return false;
  const decisionWindowSec = getMainFinalDecisionWindowSec();
  const triggerAt = Math.max(0, duration - decisionWindowSec);
  return els.screenVideo.currentTime >= triggerAt;
}

function armMainFinalDecision() {
  const duration = Number.isFinite(els.screenVideo.duration) ? els.screenVideo.duration : 0;
  if (duration <= 0 || !state.started || state.activeRole !== "main") return;

  const decisionWindowSec = getMainFinalDecisionWindowSec();
  const triggerAt = Math.max(0, duration - decisionWindowSec);
  const remainingMs = Math.max(0, (triggerAt - els.screenVideo.currentTime) * 1000);

  clearFinalDecisionTimer();
  armFinalDecisionHardTimer();
  startFinalDecisionWatchdog();

  if (els.screenVideo.currentTime >= triggerAt) {
    void launchFinalOrbDecision(decisionWindowSec);
    return;
  }

  const armToken = state.finalDecisionArmToken;
  state.finalDecisionTimeoutId = setTimeout(() => {
    if (armToken !== state.finalDecisionArmToken) return;
    state.finalDecisionTimeoutId = 0;
    void launchFinalOrbDecision(decisionWindowSec);
  }, remainingMs);

  setRuntime(`Final orb armed for last ${Math.round(decisionWindowSec)}s`);
}

function setRoleFile(role, file) {
  cleanupRoleUrl(role);
  state.files[role] = file;
  state.objectUrls[role] = URL.createObjectURL(file);
  state.preloadReady[role] = false;
  els.fileNames[role].textContent = file.name;
  void preloadRole(role);
  refreshSetupStatus();
}

function cleanupRoleUrl(role) {
  const url = state.objectUrls[role];
  if (url) URL.revokeObjectURL(url);
  state.objectUrls[role] = null;
  state.preloadReady[role] = false;
}

async function preloadRole(role) {
  const url = state.objectUrls[role];
  const video = els.preloadVideos[role];
  if (!url || !video) return;

  video.src = url;
  video.preload = "auto";
  video.load();
  setRuntime(`Preloading ${role.toUpperCase()}...`);

  try {
    await waitForVideoReady(video, 8000);
    state.preloadReady[role] = true;
    refreshSetupStatus();
  } catch (error) {
    console.warn(`Preload warning for ${role}:`, error);
    // Metadata may still be enough for local playback.
    state.preloadReady[role] = true;
    refreshSetupStatus();
  }
}

function refreshSetupStatus() {
  const selectedCount = ROLES.filter((role) => !!state.objectUrls[role]).length;
  const hasPrologue = !!state.objectUrls.prologue;
  const hasMain = !!state.objectUrls.main;
  const readyCount = ROLES.filter((role) => state.preloadReady[role]).length;

  // Enable start button if prologue and main are uploaded (required) and at least one ending is available
  const hasAnyEnding = !!state.objectUrls.bad || !!state.objectUrls.neutral || !!state.objectUrls.good;
  els.startBtn.disabled = !hasPrologue || !hasMain || !hasAnyEnding;

  if (!hasPrologue) {
    els.preloadStatus.textContent = `Upload PROLOGUE video to start`;
    return;
  }

  if (!hasMain) {
    els.preloadStatus.textContent = `Upload MAIN video to start`;
    return;
  }

  if (!hasAnyEnding) {
    els.preloadStatus.textContent = `Upload at least one ENDING video (BAD/NEUTRAL/GOOD)`;
    return;
  }

  if (selectedCount < ROLES.length) {
    els.preloadStatus.textContent = `Ready to start (${selectedCount}/5 videos uploaded)`;
    return;
  }

  els.preloadStatus.textContent = readyCount === selectedCount
    ? "All videos loaded - ready to start!"
    : `Preloading videos (${readyCount}/${selectedCount} ready)`;
}

async function startExperience() {
  if (state.started) return;
  const hasPrologue = !!state.objectUrls.prologue;
  const hasMain = !!state.objectUrls.main;
  const hasAnyEnding = !!state.objectUrls.bad || !!state.objectUrls.neutral || !!state.objectUrls.good;
  if (!hasPrologue || !hasMain || !hasAnyEnding) return;

  // Request microphone before starting
  const micOk = await requestMicrophone();
  if (!micOk) return;
  state.started = true;
  state.prologueRunning = false;
  state.prologueCompleted = false;
  state.decisionTriggered = false;
  state.decisionRunning = false;
  state.endedSelected = false;
  state.mainEnded = false;
  state.finalDecisionTriggered = false;
  state.pendingEndingRole = null;
  state.manualOverride = null;
  state.activeRole = "prologue";
  state.decisionCancelToken += 1;
  stopReverseLoop();
  clearFinalDecisionTimer();
  clearFinalDecisionHardTimer();
  clearFinalDecisionWatchdog();

  els.startBtn.disabled = true;
  if (els.stage) els.stage.style.display = 'grid';
  setRuntime("Starting prologue video");

  // Fullscreen should be requested immediately from the Start click user gesture.
  hideAudienceUI();
  await requestStageFullscreen();



  await fadeCurtain(false);

  // Play prologue video directly
  els.screenVideo.controls = false;
  els.screenVideo.src = state.objectUrls.prologue;
  els.screenVideo.currentTime = 0;
  els.screenVideo.volume = 1;
  els.screenVideo.load();
  await waitForVideoReady(els.screenVideo, 10000).catch(() => {});
  await safePlay(els.screenVideo);
  setRuntime("Prologue video playing");

    // First score system: tutorial orb during the final 10 seconds of prologue.
    const videoDuration = els.screenVideo.duration;
    if (videoDuration > 1) {
      const tutorialWindowSec = Math.min(10, Math.max(4, videoDuration - 0.5));
      const orbTime = Math.max(0, videoDuration - tutorialWindowSec);
      setTimeout(() => {
        if (state.started && !state.prologueRunning) {
          setRuntime("Tutorial score round (practice only)");
          showOrb({duration: tutorialWindowSec, goal: 1400, tutorial: true});
        }
      }, orbTime * 1000);
    }

  // Wait for prologue video to end
  await new Promise((resolve) => {
    const onEnded = () => {
      els.screenVideo.removeEventListener("ended", onEnded);
      resolve();
    };
    els.screenVideo.addEventListener("ended", onEnded);
  });

  const orbOverlay = document.getElementById('orbOverlay');
  if (orbOverlay) {
    orbOverlay.classList.remove('visible', 'tutorial-mode', 'final-mode');
    orbOverlay.setAttribute('aria-hidden', 'true');
  }

  // Play intro (main) video after prologue
  if (state.objectUrls.main) {
    state.activeRole = "main";
    els.screenVideo.src = state.objectUrls.main;
    els.screenVideo.currentTime = 0;
    els.screenVideo.load();
    await waitForVideoReady(els.screenVideo, 10000).catch(() => {});
    await safePlay(els.screenVideo);
    setRuntime("Intro video playing");
    armMainFinalDecision();
    startFinalDecisionWatchdog();
    armFinalDecisionHardTimer();

    // Wait for main video to end or for the orb to transition directly into an ending.
    await new Promise((resolve) => {
      let pollId = 0;
      const onMainEnded = () => {
        if (pollId) {
          clearInterval(pollId);
          pollId = 0;
        }
        els.screenVideo.removeEventListener("ended", onMainEnded);
        resolve();
      };
      els.screenVideo.addEventListener("ended", onMainEnded);

      pollId = setInterval(() => {
        if (state.activeRole !== "main" || state.endedSelected) {
          clearInterval(pollId);
          pollId = 0;
          els.screenVideo.removeEventListener("ended", onMainEnded);
          resolve();
        }
      }, 100);
    });
  } else {
    setRuntime("No main video uploaded - ending experience");
  }
}

function showEncouragementOverlay(visible) {
  const overlay = document.getElementById("encouragementOverlay");
  if (!overlay) return;
  overlay.classList.toggle("visible", visible);
  const txt = document.getElementById("encouragementText");
  if (!txt) return;
  txt.textContent = visible
    ? "15s FINAL ORB: silent = BAD, normal voice = NEUTRAL, scream = GOOD"
    : "";
}

async function triggerFinalDecision() {
  setRuntime("Final decision: Quiet for menu, medium for replay movie, loud for replay ending");

  // Create prominent instruction banner at the top
  const instructionBanner = document.createElement('div');
  instructionBanner.id = 'finalInstructionBanner';
  instructionBanner.textContent = 'USE YOUR VOICES TO DECIDE:';
  instructionBanner.style.cssText = `
    position: absolute;
    top: 10vh;
    left: 50%;
    transform: translateX(-50%);
    color: #fff;
    font-size: 2.5rem;
    font-weight: bold;
    text-align: center;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
    background: rgba(0,0,0,0.7);
    padding: 1rem 2rem;
    border-radius: 10px;
    border: 2px solid #fff;
    z-index: 1000;
    pointer-events: none;
  `;
  els.stage.appendChild(instructionBanner);

  const subInstruction = document.createElement('div');
  subInstruction.id = 'finalSubInstruction';
  subInstruction.textContent = 'QUIET = Menu  •  MEDIUM = Replay Movie  •  LOUD = Replay Ending';
  subInstruction.style.cssText = `
    position: absolute;
    top: 20vh;
    left: 50%;
    transform: translateX(-50%);
    color: #fff;
    font-size: 1.8rem;
    text-align: center;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
    background: rgba(0,0,0,0.6);
    padding: 0.5rem 1rem;
    border-radius: 5px;
    z-index: 1000;
    pointer-events: none;
  `;
  els.stage.appendChild(subInstruction);

  await fadeCurtain(true);
  showDecisionOverlay(true);
  await fadeCurtain(false);

  state.isFinalDecision = true;

  const result = await captureDecisionLoudness(state.decisionCancelToken);

  state.isFinalDecision = false;
  showDecisionOverlay(false);

  // Remove the instruction banners
  if (instructionBanner.parentNode) instructionBanner.parentNode.removeChild(instructionBanner);
  if (subInstruction.parentNode) subInstruction.parentNode.removeChild(subInstruction);

  if (!result.ok) {
    setRuntime(`Final decision failed: ${result.error.message}`);
    // Remove the instruction banners
    if (instructionBanner.parentNode) instructionBanner.parentNode.removeChild(instructionBanner);
    if (subInstruction.parentNode) subInstruction.parentNode.removeChild(subInstruction);
    return;
  }

  const selected = classifyLoudness(result.adjustedAverage);
  setRuntime(`Final decision: ${selected.toUpperCase()} | adjusted=${result.adjustedAverage.toFixed(4)}`);

  if (selected === "bad") {
    // Quiet: return to menu
    void returnToMenu();
  } else if (selected === "neutral") {
    // Medium: replay movie
    void restartExperience();
  } else {
    // Loud: replay ending
    void replayEnding();
  }
}

function classifyLoudness(adjustedAverage) {
  if (state.manualOverride) return state.manualOverride;
  if (adjustedAverage < state.config.lowThreshold) return "bad";
  if (adjustedAverage < state.config.highThreshold) return "neutral";
  return "good";
}

async function chooseAndPlayEnding(role, reason) {
  if (state.endedSelected) return;
  state.endedSelected = true;
  state.decisionRunning = false;
  clearFinalDecisionTimer();
  clearFinalDecisionHardTimer();
  clearFinalDecisionWatchdog();
  showEncouragementOverlay(false);
  state.activeRole = role;
  setRuntime(`Transitioning to ${role.toUpperCase()} (${reason})`);

  stopReverseLoop();
  await fadeCurtain(true);

  els.screenVideo.pause();
  els.screenVideo.src = state.objectUrls[role];
  els.screenVideo.currentTime = 0;
  els.screenVideo.volume = 1;
  els.screenVideo.load();

  await waitForVideoReady(els.screenVideo, 10000).catch(() => {});
  await safePlay(els.screenVideo);

  await fadeCurtain(false);
  setRuntime(`Playing ${role.toUpperCase()} ending`);
}

async function forceEnding(role) {
  if (!state.started) {
    state.manualOverride = role;
    setRuntime(`Manual override armed: ${role.toUpperCase()}`);
    return;
  }

  state.manualOverride = role;
  if (state.activeRole === "main" && !state.endedSelected) {
    state.pendingEndingRole = role;
    setRuntime(`Manual override queued: ${role.toUpperCase()} (plays after main ends)`);
    return;
  }

  if (state.endedSelected && state.activeRole === role) return;
  state.decisionCancelToken += 1;
  await chooseAndPlayEnding(role, "manual-override");
}

function resolveAvailableEnding(role) {
  if (role && state.objectUrls[role]) return role;
  return ["bad", "neutral", "good"].find((candidate) => state.objectUrls[candidate]) || null;
}

async function returnToMenu() {
  state.decisionCancelToken += 1;
  stopReverseLoop();
  clearFinalDecisionTimer();
  clearFinalDecisionHardTimer();
  clearFinalDecisionWatchdog();
  state.started = false;
  state.decisionTriggered = false;
  state.decisionRunning = false;
  state.endedSelected = false;
  state.mainEnded = false;
  state.pendingEndingRole = null;
  state.manualOverride = null;
  state.activeRole = "main";
  state.finalDecisionTriggered = false;

  showDecisionOverlay(false);
  showIntroOverlay(false);
  showEncouragementOverlay(false);
  renderOrb(0);

  try {
    els.screenVideo.pause();
  } catch (_) {}
  els.screenVideo.volume = 1;
  els.screenVideo.removeAttribute("src");
  els.screenVideo.load();

  els.fadeCurtain.classList.remove("active");
  els.appRoot.classList.remove("hidden-ui");
  if (els.stage) els.stage.style.display = 'none';

  refreshSetupStatus();
  setRuntime("Returned to menu (press Start to play again)");

  if (document.fullscreenElement && document.exitFullscreen) {
    try {
      await document.exitFullscreen();
    } catch (_) {
      // Ignore exit fullscreen failures.
    }
  }
}

async function restartExperience() {
  state.decisionCancelToken += 1;
  stopReverseLoop();
  clearFinalDecisionTimer();
  clearFinalDecisionHardTimer();
  clearFinalDecisionWatchdog();
  state.started = false;
  state.decisionTriggered = false;
  state.decisionRunning = false;
  state.endedSelected = false;
  state.mainEnded = false;
  state.pendingEndingRole = null;
  state.manualOverride = null;
  state.activeRole = "main";
  state.finalDecisionTriggered = false;

  showDecisionOverlay(false);
  showIntroOverlay(false);
  renderOrb(0);

  try {
    els.screenVideo.pause();
  } catch (_) {}
  els.screenVideo.volume = 1;
  els.screenVideo.src = state.objectUrls.main;
  els.screenVideo.currentTime = 0;
  els.screenVideo.load();

  await waitForVideoReady(els.screenVideo, 10000).catch(() => {});
  await safePlay(els.screenVideo);

  state.started = true;
  state.finalDecisionTriggered = false;
  armMainFinalDecision();
  setRuntime("Restarting experience...");
}

async function replayEnding() {
  const currentEnding = state.activeRole;
  if (!["bad", "neutral", "good"].includes(currentEnding)) {
    setRuntime("No ending to replay");
    return;
  }

  state.finalDecisionTriggered = false;
  clearFinalDecisionTimer();
  setRuntime(`Replaying ${currentEnding.toUpperCase()} ending`);

  stopReverseLoop();
  await fadeCurtain(true);

  els.screenVideo.pause();
  els.screenVideo.src = state.objectUrls[currentEnding];
  els.screenVideo.currentTime = 0;
  els.screenVideo.volume = 1;
  els.screenVideo.load();

  await waitForVideoReady(els.screenVideo, 10000).catch(() => {});
  await safePlay(els.screenVideo);

  await fadeCurtain(false);
  setRuntime(`Replaying ${currentEnding.toUpperCase()} ending`);
}

function shouldLoopCurrentVideo() {
  if (state.config.loopMode === "off") return false;
  if (!state.started) return false;
  if (state.config.loopEndingsOnly && state.activeRole === "main") return false;
  return true;
}

async function handleVideoLoopEnd() {
  const mode = state.config.loopMode;
  if (mode === "loop") {
    els.screenVideo.currentTime = 0;
    await safePlay(els.screenVideo);
    setRuntime(`Looping ${state.activeRole.toUpperCase()} ending`);
    return;
  }

  if (mode === "pingpong") {
    const reachedStart = await playReversePass(els.screenVideo);
    if (!reachedStart) return;
    if (!shouldLoopCurrentVideo() || state.config.loopMode !== "pingpong") return;
    els.screenVideo.currentTime = 0;
    els.screenVideo.muted = false;
    await safePlay(els.screenVideo);
    setRuntime(`Back & forth loop: forward ${state.activeRole.toUpperCase()}`);
  }
}

async function playReversePass(video) {
  stopReverseLoop();

  state.reversePlaybackActive = true;
  state.reverseSessionId += 1;
  const session = state.reverseSessionId;

  video.pause();
  video.muted = true;
  setRuntime(`Back & forth loop: reverse ${state.activeRole.toUpperCase()}`);

  return new Promise((resolve) => {
    let lastTime = performance.now();

    const finish = (reachedStart) => {
      if (state.reverseRafId) {
        cancelAnimationFrame(state.reverseRafId);
        state.reverseRafId = 0;
      }
      if (session === state.reverseSessionId) {
        state.reversePlaybackActive = false;
      }
      video.muted = false;
      resolve(reachedStart);
    };

    const step = (now) => {
      if (
        !state.reversePlaybackActive ||
        session !== state.reverseSessionId ||
        !state.started ||
        state.config.loopMode !== "pingpong"
      ) {
        finish(false);
        return;
      }

      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const nextTime = Math.max(0, video.currentTime - dt);
      video.currentTime = nextTime;

      if (nextTime <= 0.001) {
        finish(true);
        return;
      }

      state.reverseRafId = requestAnimationFrame(step);
    };

    state.reverseRafId = requestAnimationFrame(step);
  });
}

async function runIntroCountdown(seconds, token) {
  const safeSeconds = clamp(Number(seconds) || 0, 0, 20);
  if (safeSeconds <= 0) return true;

  showIntroOverlay(true);
  els.introCountdown.textContent = String(Math.ceil(safeSeconds));
  els.introRing.style.setProperty("--intro-progress", "0");
  setRuntime(`Intro countdown: ${safeSeconds}s`);

  const totalMs = safeSeconds * 1000;
  const startedAt = performance.now();

  const completed = await new Promise((resolve) => {
    const frame = (now) => {
      if (token !== state.decisionCancelToken || !state.started) {
        resolve(false);
        return;
      }

      const elapsedMs = now - startedAt;
      const remainingMs = Math.max(0, totalMs - elapsedMs);
      const progress = clamp(elapsedMs / totalMs, 0, 1);
      els.introRing.style.setProperty("--intro-progress", progress.toFixed(4));
      els.introCountdown.textContent = String(Math.ceil(remainingMs / 1000));

      if (elapsedMs < totalMs) {
        requestAnimationFrame(frame);
      } else {
        resolve(true);
      }
    };
    requestAnimationFrame(frame);
  });

  showIntroOverlay(false);
  return completed;
}

async function runInvitationCountdown(seconds, token) {
  const safeSeconds = clamp(Number(seconds) || 0, 0, 10);
  if (safeSeconds <= 0) return true;

  showInvitationOverlay(true);
  els.invitationCountdown.textContent = String(Math.ceil(safeSeconds));
  els.invitationRing.style.setProperty("--invitation-progress", "0");
  els.energyScore.textContent = "0";
  setRuntime(`Invitation countdown: ${safeSeconds}s`);

  const totalMs = safeSeconds * 1000;
  const startedAt = performance.now();
  let totalScore = 0;
  let sampleCount = 0;

  const completed = await new Promise((resolve) => {
    const frame = (now) => {
      if (token !== state.decisionCancelToken || !state.started) {
        resolve(false);
        return;
      }

      const elapsedMs = now - startedAt;
      const remainingMs = Math.max(0, totalMs - elapsedMs);
      const progress = clamp(elapsedMs / totalMs, 0, 1);
      els.invitationRing.style.setProperty("--invitation-progress", progress.toFixed(4));
      els.invitationCountdown.textContent = String(Math.ceil(remainingMs / 1000));

      // Track energy score
      if (state.micStream) {
        const level = getCurrentAudioLevel();
        totalScore += level;
        sampleCount++;
        
        const averageScore = sampleCount > 0 ? Math.round((totalScore / sampleCount) * 100) : 0;
        els.energyScore.textContent = String(averageScore);
        
        // Update feedback based on current energy
        if (level > state.config.highThreshold) {
          els.invitationFeedback.textContent = "INCREDIBLE ENERGY! 🔥";
          els.invitationFeedback.style.color = "#FFD700";
        } else if (level > state.config.lowThreshold) {
          els.invitationFeedback.textContent = "Great energy! Keep it up!";
          els.invitationFeedback.style.color = "#90EE90";
        } else {
          els.invitationFeedback.textContent = "Build that energy for the journey!";
          els.invitationFeedback.style.color = "#FFA500";
        }
      }

      if (elapsedMs < totalMs) {
        requestAnimationFrame(frame);
      } else {
        resolve(true);
      }
    };
    requestAnimationFrame(frame);
  });

  showInvitationOverlay(false);
  return completed;
}

async function runEnergyScoreOverlay(seconds, token) {
  const safeSeconds = clamp(Number(seconds) || 0, 0, 10);
  if (safeSeconds <= 0) return true;

  showInvitationOverlay(true);
  els.invitationCountdown.textContent = String(Math.ceil(safeSeconds));
  els.invitationRing.style.setProperty("--invitation-progress", "0");
  els.energyScore.textContent = "0";
  setRuntime(`Energy score overlay: ${safeSeconds}s`);

  const totalMs = safeSeconds * 1000;
  const startedAt = performance.now();
  let totalScore = 0;
  let sampleCount = 0;

  const completed = await new Promise((resolve) => {
    const frame = (now) => {
      if (token !== state.decisionCancelToken || !state.started) {
        resolve(false);
        return;
      }

      const elapsedMs = now - startedAt;
      const remainingMs = Math.max(0, totalMs - elapsedMs);
      const progress = clamp(elapsedMs / totalMs, 0, 1);
      els.invitationRing.style.setProperty("--invitation-progress", progress.toFixed(4));
      els.invitationCountdown.textContent = String(Math.ceil(remainingMs / 1000));

      // Track energy score
      if (state.micStream) {
        const level = getCurrentAudioLevel();
        totalScore += level;
        sampleCount++;
        
        const averageScore = sampleCount > 0 ? Math.round((totalScore / sampleCount) * 100) : 0;
        els.energyScore.textContent = String(averageScore);
        
        // Update feedback based on current energy
        if (level > state.config.highThreshold) {
          els.invitationFeedback.textContent = "INCREDIBLE ENERGY! 🔥";
          els.invitationFeedback.style.color = "#FFD700";
        } else if (level > state.config.lowThreshold) {
          els.invitationFeedback.textContent = "Great energy! Keep it up!";
          els.invitationFeedback.style.color = "#90EE90";
        } else {
          els.invitationFeedback.textContent = "Build that energy for the journey!";
          els.invitationFeedback.style.color = "#FFA500";
        }
      }

      if (elapsedMs < totalMs) {
        requestAnimationFrame(frame);
      } else {
        resolve(true);
      }
    };
    requestAnimationFrame(frame);
  });

  showInvitationOverlay(false);
  return completed;
}

async function runIntroInfo(seconds, token) {
  const safeSeconds = clamp(Number(seconds) || 0, 5); // Mini intro - fixed at 5 seconds
  if (safeSeconds <= 0) return true;

  showIntroOverlay(true);
  // Remove countdown, just show informational text
  els.introCountdown.style.display = "none";
  els.introRing.style.display = "none";
  setRuntime(`Mini intro: ${safeSeconds}s`);

  const totalMs = safeSeconds * 1000;
  const startedAt = performance.now();

  const completed = await new Promise((resolve) => {
    const frame = (now) => {
      if (token !== state.decisionCancelToken || !state.started) {
        resolve(false);
        return;
      }

      const elapsedMs = now - startedAt;

      if (elapsedMs < totalMs) {
        requestAnimationFrame(frame);
      } else {
        resolve(true);
      }
    };
    requestAnimationFrame(frame);
  });

  showIntroOverlay(false);
  return completed;
}

async function runVoiceOrbDecision(token) {
  if (state.decisionTriggered || state.decisionRunning) return;

  state.decisionTriggered = true;
  state.decisionRunning = true;
  state.pendingEndingRole = null;
  const decisionToken = ++state.decisionCancelToken;
  setRuntime("Voice orb decision active");

  showDecisionOverlay(true);
  const result = await captureDecisionLoudness(decisionToken);
  showDecisionOverlay(false);

  if (decisionToken !== state.decisionCancelToken || state.endedSelected) {
    state.decisionRunning = false;
    return;
  }

  // Determine ending based on decision
  let selectedEnding;
  if (result.ok) {
    selectedEnding = classifyLoudness(result.adjustedAverage);
    setRuntime(`Voice orb decision: ${selectedEnding.toUpperCase()}`);
  } else {
    console.error("Voice orb decision failed, defaulting to NEUTRAL:", result.error);
    selectedEnding = "neutral";
  }

  // Check if selected ending is available, otherwise find a fallback
  if (selectedEnding && !state.objectUrls[selectedEnding]) {
    const availableEndings = ["bad", "neutral", "good"].filter(role => state.objectUrls[role]);
    if (availableEndings.length > 0) {
      selectedEnding = availableEndings[0]; // Use first available ending
      setRuntime(`Selected ending not available, using ${selectedEnding.toUpperCase()} instead`);
    } else {
      setRuntime("No ending videos available!");
      return;
    }
  }

  if (selectedEnding) {
    state.pendingEndingRole = selectedEnding;
    await chooseAndPlayEnding(selectedEnding, "voice-orb-decision");
  }

  state.decisionRunning = false;
}

async function runPrologue(seconds, token) {
  const safeSeconds = clamp(Number(seconds) || 0, 0, 60);
  if (safeSeconds <= 0) return true;

  state.prologueRunning = true;
  state.prologueCompleted = false;
  state.prologueCancelToken = token;

  showPrologueOverlay(true);

  const totalMs = safeSeconds * 1000;
  const startedAt = performance.now();

  const completed = await new Promise((resolve) => {
    const frame = (now) => {
      if (token !== state.prologueCancelToken || !state.started || !state.prologueRunning) {
        resolve(false);
        return;
      }

      const elapsedMs = now - startedAt;
      const remainingMs = Math.max(0, totalMs - elapsedMs);
      const progress = clamp(elapsedMs / totalMs, 0, 1);
      
      els.prologueRing.style.setProperty("--prologue-progress", progress.toFixed(4));
      els.prologueCountdown.textContent = String(Math.ceil(remainingMs / 1000));

      // Monitor audio levels and provide feedback
      if (state.micStream) {
        updatePrologueFeedback();
      }

      if (elapsedMs < totalMs) {
        requestAnimationFrame(frame);
      } else {
        resolve(true);
      }
    };
    requestAnimationFrame(frame);
  });

  showPrologueOverlay(false);
  state.prologueRunning = false;
  state.prologueCompleted = completed;
  return completed;
}

function updatePrologueStage() {
  const stages = [
    { title: "QUIET Training", instruction: "Stay as quiet as possible for 8 seconds", target: "quiet" },
    { title: "MEDIUM Training", instruction: "Make medium volume sounds for 8 seconds", target: "medium" },
    { title: "LOUD Training", instruction: "Make loud sounds for 9 seconds", target: "loud" }
  ];

  const stage = stages[state.prologueStage];
  if (!stage) return;

  els.prologueTitle.textContent = stage.title;
  els.prologueInstruction.textContent = stage.instruction;

  // Update stage indicators
  document.querySelectorAll('.stage-indicator').forEach((el, index) => {
    el.classList.toggle('active', index === state.prologueStage);
  });
}

function updatePrologueFeedback() {
  if (!state.micStream) return;

  // Get current audio level
  const level = getCurrentAudioLevel();
  
  // Encourage loud sounds for the gamified prologue
  let feedback = "";
  let color = "#FFA500";
  
  if (level > state.config.highThreshold) {
    feedback = "AMAZING! Keep screaming!";
    color = "#90EE90";
  } else if (level > state.config.lowThreshold) {
    feedback = "Good! Scream louder!";
    color = "#FFD700";
  } else {
    feedback = "Scream to charge the orb!";
    color = "#FFA500";
  }
  
  els.prologueFeedback.textContent = feedback;
  els.prologueFeedback.style.color = color;
}

function getCurrentAudioLevel() {
  if (!state.micStream || !state.micStream.active) return 0;
  
  // Use the same audio analysis as the decision sequence
  if (!window.audioContextForPrologue) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      window.audioContextForPrologue = new AudioCtx();
      window.analyserForPrologue = window.audioContextForPrologue.createAnalyser();
      window.analyserForPrologue.fftSize = 2048;
      window.analyserForPrologue.smoothingTimeConstant = 0.2;
      window.dataArrayForPrologue = new Uint8Array(window.analyserForPrologue.fftSize);
      
      const source = window.audioContextForPrologue.createMediaStreamSource(state.micStream);
      source.connect(window.analyserForPrologue);
    } catch (error) {
      console.error("Failed to setup prologue audio analysis:", error);
      return 0;
    }
  }
  
  if (window.analyserForPrologue && window.dataArrayForPrologue) {
    return computeRms(window.analyserForPrologue, window.dataArrayForPrologue);
  }
  
  return 0;
}

function showPrologueOverlay(visible) {
  els.prologueOverlay.classList.toggle("visible", visible);
}

function resolveDecisionTriggerTime() {
  const duration = els.screenVideo.duration;
  const spec = state.config.decisionTimestamp;
  if (!Number.isFinite(duration) && String(spec).toLowerCase().startsWith("end")) {
    return null;
  }
  return parseDecisionTimestamp(spec, duration);
}

function parseDecisionTimestamp(rawSpec, duration) {
  const spec = String(rawSpec || "").trim().toLowerCase();
  if (!spec) return Math.max(0, (duration || 0) - 10);

  if (spec.startsWith("end-")) {
    const seconds = parseSecondsLiteral(spec.slice(4));
    if (!Number.isFinite(seconds)) return Math.max(0, (duration || 0) - 10);
    return Math.max(0, (duration || 0) - seconds);
  }

  if (spec.startsWith("-")) {
    const seconds = parseSecondsLiteral(spec.slice(1));
    if (!Number.isFinite(seconds)) return Math.max(0, (duration || 0) - 10);
    return Math.max(0, (duration || 0) - seconds);
  }

  const clock = parseClockTime(spec);
  if (clock != null) return clock;

  const numeric = Number(spec);
  if (Number.isFinite(numeric)) return Math.max(0, numeric);

  return Math.max(0, (duration || 0) - 10);
}

function parseSecondsLiteral(input) {
  const cleaned = String(input || "").trim();
  if (!cleaned) return NaN;
  if (cleaned.endsWith("ms")) return Number(cleaned.slice(0, -2)) / 1000;
  if (cleaned.endsWith("s")) return Number(cleaned.slice(0, -1));
  return Number(cleaned);
}

function parseClockTime(value) {
  const parts = String(value).split(":").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 1 || parts.length > 3) return null;
  if (!parts.every((p) => /^\d+(\.\d+)?$/.test(p))) return null;
  const nums = parts.map(Number);
  if (parts.length === 1) return nums[0];
  if (parts.length === 2) return nums[0] * 60 + nums[1];
  return nums[0] * 3600 + nums[1] * 60 + nums[2];
}

function renderOrb(intensity) {
  const normalized = clamp(intensity / Math.max(state.config.highThreshold, 0.001), 0, 1.7);
  const scale = 0.78 + normalized * 0.62;

  let hue = 208; // cool/quiet
  if (normalized >= 1) hue = 142; // loud/good
  else if (normalized >= 0.45) hue = 34; // mid/neutral

  const alpha = 0.16 + Math.min(normalized, 1.3) * 0.18;
  els.decisionOverlay.style.setProperty("--orb-scale", scale.toFixed(3));
  els.decisionOverlay.style.setProperty("--orb-hue", String(hue));
  els.decisionOverlay.style.setProperty("--orb-alpha", alpha.toFixed(3));
}

function showDecisionOverlay(show) {
  els.decisionOverlay.classList.toggle("visible", show);
  els.overlayText.textContent = "Build Your Power!";
  renderOrb(0);
}

function showIntroOverlay(show) {
  if (!els.introOverlay) return;
  els.introOverlay.classList.toggle("visible", show);
  if (show) {
    els.introRing.style.setProperty("--intro-progress", "0");
    els.introCountdown.textContent = String(Math.ceil(state.config.introCountdownSec));
    // Reset display properties
    els.introCountdown.style.display = "";
    els.introRing.style.display = "";
  }
}

function showInvitationOverlay(show) {
  if (!els.invitationOverlay) return;
  els.invitationOverlay.classList.toggle("visible", show);
  if (show) {
    els.invitationRing.style.setProperty("--invitation-progress", "0");
    els.invitationCountdown.textContent = "5";
    els.energyScore.textContent = "0";
  }
}

function stopReverseLoop() {
  state.reversePlaybackActive = false;
  state.reverseSessionId += 1;
  if (state.reverseRafId) {
    cancelAnimationFrame(state.reverseRafId);
    state.reverseRafId = 0;
  }
  els.screenVideo.muted = false;
}

function cycleLoopMode() {
  const modes = ["off", "loop", "pingpong"];
  const currentIndex = modes.indexOf(state.config.loopMode);
  const nextMode = modes[(currentIndex + 1 + modes.length) % modes.length];
  setLoopMode(nextMode);
}

function setLoopMode(mode) {
  const allowed = ["off", "loop", "pingpong"];
  const nextMode = allowed.includes(mode) ? mode : "off";
  state.config.loopMode = nextMode;
  stopReverseLoop();
  updateLoopControlsUI();
  setRuntime(`Loop mode: ${nextMode}`);
  console.log(`Loop mode changed to: ${nextMode}`);
}

function updateLoopControlsUI() {
  if (els.loopMode) {
    els.loopMode.value = state.config.loopMode;
  }
  if (els.loopOffBtn) {
    els.loopOffBtn.classList.toggle("is-active", state.config.loopMode === "off");
  }
  if (els.loopLoopBtn) {
    els.loopLoopBtn.classList.toggle("is-active", state.config.loopMode === "loop");
  }
  if (els.loopPingBtn) {
    els.loopPingBtn.classList.toggle("is-active", state.config.loopMode === "pingpong");
  }
  if (els.loopEnabledToggle) {
    els.loopEnabledToggle.checked = state.config.loopMode !== "off";
  }
  if (els.reverseLoopToggle) {
    els.reverseLoopToggle.checked = state.config.loopMode === "pingpong";
  }
}

async function primeMicrophonePermission() {
  if (state.micPermissionPrimed && state.micStream && state.micStream.active) return;
  if (state.micPermissionDenied) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });
    state.micStream = stream;
    state.micPermissionPrimed = true;
    state.micPermissionDenied = false;
    setRuntime("Microphone ready");
  } catch (error) {
    state.micPermissionDenied = true;
    console.error("Microphone permission not granted during start; will fall back to neutral if needed.", error);
    setRuntime("Mic unavailable (neutral fallback if decision fails)");
  }
}

function computeRms(analyser, data) {
  analyser.getByteTimeDomainData(data);
  let sumSq = 0;
  for (let i = 0; i < data.length; i += 1) {
    const centered = (data[i] - 128) / 128;
    sumSq += centered * centered;
  }
  return Math.sqrt(sumSq / data.length);
}

async function rampVideoVolume(video, targetVolume, durationMs) {
  const startVolume = Number.isFinite(video.volume) ? video.volume : 1;
  const endVolume = clamp(targetVolume, 0, 1);
  const startedAt = performance.now();

  return new Promise((resolve) => {
    const step = () => {
      const t = clamp((performance.now() - startedAt) / Math.max(durationMs, 1), 0, 1);
      video.volume = startVolume + (endVolume - startVolume) * easeOutCubic(t);
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        video.volume = endVolume;
        resolve();
      }
    };
    step();
  });
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

async function fadeCurtain(show) {
  const isActive = els.fadeCurtain.classList.contains("active");
  if (isActive === show) return;
  await new Promise((resolve) => {
    const timeout = window.setTimeout(resolve, state.config.transitionFadeMs + 40);
    const done = () => {
      window.clearTimeout(timeout);
      els.fadeCurtain.removeEventListener("transitionend", done);
      resolve();
    };
    els.fadeCurtain.addEventListener("transitionend", done, { once: true });
    els.fadeCurtain.classList.toggle("active", show);
  });
}

function hideAudienceUI() {
  els.appRoot.classList.add("hidden-ui");
}

async function requestStageFullscreen() {
  const target = document.documentElement;
  if (!target.requestFullscreen || document.fullscreenElement) return;
  try {
    await target.requestFullscreen();
  } catch (_) {
    // Fullscreen is optional; browsers may block it.
  }
}

async function safePlay(video) {
  try {
    await video.play();
  } catch (error) {
    console.error("Video playback failed:", error);
    setRuntime("Playback blocked. Click page to resume.");
  }
}

function waitForVideoReady(video, timeoutMs) {
  if (video.readyState >= 2) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => cleanup(() => reject(new Error("Video preload timeout"))), timeoutMs);

    const onReady = () => cleanup(resolve);
    const onError = () => cleanup(() => reject(video.error || new Error("Video load error")));

    function cleanup(cb) {
      clearTimeout(timeout);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onError);
      cb();
    }

    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplay", onReady);
    video.addEventListener("error", onError);
  });
}

function stopMediaStream(stream) {
  if (!stream) return;
  for (const track of stream.getTracks()) track.stop();
}

function renderThresholdLabels() {
  els.lowThresholdValue.textContent = state.config.lowThreshold.toFixed(3);
  els.highThresholdValue.textContent = state.config.highThreshold.toFixed(3);
}

function setRuntime(text) {
  els.runtimeInfo.textContent = text;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isTextInput(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA";
}

function syncInputFiles(input, file) {
  if (!window.DataTransfer) return;
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
  } catch (_) {
    // Not supported in some browsers; file is already stored in state.
  }
}

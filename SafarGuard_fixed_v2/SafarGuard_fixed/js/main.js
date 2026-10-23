/* ═══════════════════════════════════════════════════════
   SafarGuard — Main Application
   AI Driver Drowsiness Analyzer
   Camera · Face Mesh · EAR · Alerts · Dashboard
   ═══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* 1. DOM References */
  const $ = (s, p) => (p || document).querySelector(s);
  const $$ = (s, p) => [...(p || document).querySelectorAll(s)];

  const DOM = {
    loader: $('.loader'),
    loadCount: $('#load-count'),
    stars: $('#stars'),
    threeScene: $('#three-scene'),
    nav: $('.nav'),
    menuBtn: $('.menu-button'),
    navLinks: $('nav', $('.nav')),
    startBtn: $('#start-monitor'),
    cameraPanel: $('#camera-panel'),
    video: $('#driver-video'),
    overlay: $('#face-overlay'),
    placeholder: $('#camera-placeholder'),
    sleepAlert: $('#sleep-alert'),
    cameraState: $('#camera-state'),
    recordState: $('#record-state'),
    faceState: $('#face-state'),
    fps: $('#fps'),
    driverStatus: $('#driver-status'),
    statusDetail: $('#status-detail'),
    statusCard: $('#status-card'),
    gauge: $('#gauge'),
    gaugeValue: $('#gauge-value'),
    fatigueIndex: $('#radar-fatigue'),
    earValue: $('#ear-value'),
    earBar: $('#ear-bar'),
    closedTime: $('#closed-time'),
    closedBar: $('#closed-bar'),
    mouthRatio: $('#mouth-ratio'),
    mouthBar: $('#mouth-bar'),
    yawnState: $('#yawn-state'),
    yawnBar: $('#yawn-bar'),
    attLine: $('#attention-line'),
    attArea: $('#attention-area'),
    contactForm: $('#contact-form'),
    alertToggle: $('#sg-alert-toggle'),
    alertLanguage: $('#sg-alert-language'),
    testVoiceBtn: $('#sg-test-voice'),
    voiceStatus: $('#sg-voice-status'),
    featureDialog: $('#feature-dialog'),
    featureDialogTitle: $('#feature-dialog-title'),
    featureDialogDescription: $('#feature-dialog-description'),
    featureDialogLive: $('#feature-dialog-live'),
    featureDialogAction: $('#feature-dialog-action'),
    featureDialogClose: $('#feature-dialog-close'),
    counters: $$('.counter'),
  };

  /* 2. State */
  const state = {
    monitoring: false,
    sessionId: null,
    faceMesh: null,
    meshRetryCount: 0,
    meshRetryTimer: null,
    cameraObj: null,
    lastFrameTime: 0,
    frameCount: 0,
    fpsValue: 0,
    earHistory: [],
    attentionData: new Array(100).fill(0.3),
    eyeClosedStart: null,
    eyeClosedDuration: 0,
    yawnStart: null,
    lastYawnAt: 0,
    yawnStatusUntil: 0,
    mouthRatio: null,
    alertActive: false,
    alarmInterval: null,
    speechInterval: null,
    audioCtx: null,
    totalEar: 0,
    totalFrames: 0,
    lastEventTime: 0,
  };

  /* 3. LOADER — Updated Code */
  function runLoader() {
    const loader = DOM.loader;
    const count = DOM.loadCount;

    if (!loader) return;

    let progress = 0;

    const interval = setInterval(() => {
      progress = Math.min(progress + Math.random() * 8 + 2, 100);

      if (count) {
        count.textContent = String(Math.floor(progress));
      }

      if (progress >= 100) {
        clearInterval(interval);

        if (count) {
          count.textContent = '100';
        }

        setTimeout(() => {
          loader.classList.add('hidden');
        }, 400);
      }
    }, 80);
  }

  runLoader();

  /* 4. STARFIELD CANVAS */
  function initStars() {
    const canvas = DOM.stars;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let w, h, stars = [];

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }

    function createStars() {
      stars = [];
      const count = Math.floor((w * h) / 4000);

      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 1.4 + 0.3,
          a: Math.random(),
          speed: Math.random() * 0.005 + 0.002,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }

    function draw(t) {
      ctx.clearRect(0, 0, w, h);

      for (const s of stars) {
        const alpha =
          0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 225, 255, ${alpha})`;
        ctx.fill();
      }

      requestAnimationFrame(draw);
    }

    resize();
    createStars();
    requestAnimationFrame(draw);

    window.addEventListener('resize', () => {
      resize();
      createStars();
    });
  }

  initStars();

  /* 5. THREE.JS SCENE */
  function initThreeScene() {
    const container = DOM.threeScene;

    if (!container || typeof THREE === 'undefined') return;

    const w = container.clientWidth || 400;
    const h = container.clientHeight || 400;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });

    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const shieldGeo = new THREE.IcosahedronGeometry(1.8, 1);

    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      wireframe: true,
      transparent: true,
      opacity: 0.22,
    });

    const shield = new THREE.Mesh(shieldGeo, shieldMat);
    scene.add(shield);

    const innerGeo = new THREE.IcosahedronGeometry(1.2, 2);

    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      wireframe: true,
      transparent: true,
      opacity: 0.08,
    });

    const inner = new THREE.Mesh(innerGeo, innerMat);
    scene.add(inner);

    const particleCount = 200;
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 2.2 + Math.random() * 1.2;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }

    const particleGeo = new THREE.BufferGeometry();

    particleGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );

    const particleMat = new THREE.PointsMaterial({
      color: 0x00e5ff,
      size: 0.03,
      transparent: true,
      opacity: 0.6,
    });

    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    const ringGeo = new THREE.TorusGeometry(2.5, 0.01, 8, 80);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.15,
    });

    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2.5;
    scene.add(ring);

    function animate() {
      requestAnimationFrame(animate);

      const t = Date.now() * 0.001;

      shield.rotation.y = t * 0.15;
      shield.rotation.x = Math.sin(t * 0.1) * 0.15;
      inner.rotation.y = -t * 0.2;
      inner.rotation.z = t * 0.08;
      particles.rotation.y = t * 0.05;
      ring.rotation.z = t * 0.08;

      renderer.render(scene, camera);
    }

    animate();

    window.addEventListener('resize', () => {
      const nw = container.clientWidth;
      const nh = container.clientHeight;

      if (nw && nh) {
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      }
    });
  }

  initThreeScene();

  /* 6. NAVIGATION */
  window.addEventListener('scroll', () => {
    if (DOM.nav) {
      DOM.nav.classList.toggle('scrolled', window.scrollY > 40);
    }
  }, { passive: true });

  if (DOM.menuBtn && DOM.navLinks) {
    DOM.menuBtn.addEventListener('click', () => {
      DOM.navLinks.classList.toggle('open');

      DOM.menuBtn.textContent =
        DOM.navLinks.classList.contains('open') ? '✕' : '☰';
      DOM.menuBtn.setAttribute(
        'aria-expanded',
        String(DOM.navLinks.classList.contains('open'))
      );
    });

    $$('a', DOM.navLinks).forEach(link => {
      link.addEventListener('click', () => {
        DOM.navLinks.classList.remove('open');
        DOM.menuBtn.textContent = '☰';
        DOM.menuBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* 7. COUNTER ANIMATION */
  function animateCounters() {
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;

        const el = entry.target;
        const target = parseFloat(el.dataset.count);
        const isDecimal = String(target).includes('.');
        const duration = 2000;
        const start = performance.now();

        function tick(now) {
          const t = Math.min((now - start) / duration, 1);
          const ease = 1 - Math.pow(1 - t, 3);
          const current = ease * target;

          el.textContent = isDecimal
            ? current.toFixed(2)
            : Math.floor(current);

          if (t < 1) requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
        observer.unobserve(el);
      });
    }, { threshold: 0.5 });

    DOM.counters.forEach(c => observer.observe(c));
  }

  animateCounters();

  /* 8. SCROLL REVEAL */
  function initReveal() {
    if (typeof IntersectionObserver === 'undefined') return;

    const targets = $$(
      '.section-intro, .section h2, .problem-grid, .wide-copy, ' +
      '.feature-grid, .solution-copy, .orbital-art, .tech-copy, ' +
      '.orbit, .dash-head, .dashboard-shell, .pipeline, ' +
      '.architecture-flow, .future-list, .contact-card'
    );

    targets.forEach(el => el.classList.add('reveal'));

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -40px 0px',
    });

    targets.forEach(el => observer.observe(el));
  }

  initReveal();

  function setupFeatureDialog() {
    const dialog = DOM.featureDialog;
    if (
      !dialog ||
      !DOM.featureDialogTitle ||
      !DOM.featureDialogDescription ||
      !DOM.featureDialogAction
    ) return;

    const details = {
      face: {
        title: 'Face landmarking',
        description: 'Click Start Monitoring in the live dashboard and allow camera access. MediaPipe tracks face landmarks in this browser; your camera video is not uploaded.',
        action: 'Open live camera',
        target: '#dashboard',
        live: 'Camera status will appear here after you start monitoring.'
      },
      ear: {
        title: 'EAR analysis',
        description: 'Eye Aspect Ratio compares the vertical and horizontal eye landmarks. This demo treats EAR below 0.22 as closed and triggers the wake-up alert after 1.5 seconds. Brief blinks do not trigger an alarm.',
        action: 'Try live EAR detection',
        target: '#dashboard',
        live: 'Start monitoring to see the live EAR reading.'
      },
      yawn: {
        title: 'Yawn detection',
        description: 'Mouth Aspect Ratio compares the vertical mouth opening with mouth width. A ratio of at least 0.60 sustained for 1.2 seconds is recorded as a yawn event, with a 10-second cooldown to avoid duplicate events.',
        action: 'Try live yawn detection',
        target: '#dashboard',
        live: 'Start monitoring to see the live mouth ratio.'
      },
      analytics: {
        title: 'Weekly analytics',
        description: 'Your session history and event counts are loaded from the Flask API. Finish a monitoring session to add its readings to the dashboard.',
        action: 'Open weekly analytics',
        target: '#weekly-analytics',
        live: 'Analytics refresh automatically when this page loads.'
      },
      trip: {
        title: 'Trip insights',
        description: 'SafarGuard records the average EAR and safety-event count for each monitoring session. Review recent sessions and event totals in the history and weekly analytics sections.',
        action: 'Open session history',
        target: '#session-history',
        live: 'Stop monitoring to save a session summary.'
      },
      device: {
        title: 'Device camera',
        description: 'Monitoring uses the camera you choose in your browser. Keep the camera steady, ensure your face is visible, and grant permission when your browser asks.',
        action: 'Open live camera',
        target: '#dashboard',
        live: 'Your camera stays off until you press Start Monitoring.'
      },
      privacy: {
        title: 'Private by design',
        description: 'Face detection runs in your browser. Only session summaries and safety-event readings are saved to the local SafarGuard SQLite database; camera video and live location are not uploaded.',
        action: 'View system details',
        target: '#technology',
        live: 'Camera access starts only after you press Start Monitoring.'
      },
      alerts: {
        title: 'Smart alerting',
        description: 'The on-screen alert appears after eyes stay closed for 1.5 seconds. Spoken and audio alerts can be switched on or off in Profile & Settings.',
        action: 'Configure alert preference',
        target: '#profile-settings',
        live: 'Camera access and the first monitoring click are required before alerts can be tested.'
      },
      escalation: {
        title: 'Safety escalation',
        description: 'Automatic emergency SMS or contact notifications are not connected in this demo. You can submit a contact request, but this feature will not call or message anyone during a drive.',
        action: 'View contact options',
        target: '#contact',
        live: 'No emergency messages or calls are sent.'
      },
    };

    let opener = null;
    $$('[data-feature]', document).forEach(button => {
      button.addEventListener('click', () => {
        const feature = details[button.dataset.feature];
        if (!feature) return;

        opener = button;
        DOM.featureDialogTitle.textContent = feature.title;
        DOM.featureDialogDescription.textContent = feature.description;
        DOM.featureDialogAction.textContent = feature.action;
        DOM.featureDialogAction.href = feature.target;
        if (DOM.featureDialogLive) {
          DOM.featureDialogLive.hidden = !feature.live;
          DOM.featureDialogLive.textContent = feature.live;
        }
        dialog.showModal();
      });
    });

    if (DOM.featureDialogClose) {
      DOM.featureDialogClose.addEventListener('click', () => dialog.close());
    }
    DOM.featureDialogAction.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => {
      if (opener) opener.focus();
    });
  }

  setupFeatureDialog();

  function updateFeatureReadouts(ear) {
    if (!DOM.featureDialogLive || !DOM.featureDialog.open) return;
    const feature = DOM.featureDialogTitle.textContent;
    if (feature === 'EAR analysis') {
      DOM.featureDialogLive.textContent =
        `Live EAR: ${ear.toFixed(3)} · ${ear < EAR_THRESHOLD ? 'eyes closed' : 'eyes open'} · alert threshold: ${EAR_THRESHOLD.toFixed(2)}`;
    } else if (feature === 'Yawn detection') {
      const ratio = state.mouthRatio;
      const duration = state.yawnStart === null
        ? 0
        : (Date.now() - state.yawnStart) / 1000;
      DOM.featureDialogLive.textContent = ratio === null
        ? 'Live mouth ratio is unavailable.'
        : `Live mouth ratio: ${ratio.toFixed(3)} / 0.600 · sustained: ${duration.toFixed(1)} / 1.2 s`;
    } else if (feature === 'Face landmarking') {
      DOM.featureDialogLive.textContent = state.monitoring
        ? 'Camera is running · face landmarks are being processed in this browser.'
        : 'Camera is off · click Start Monitoring in the dashboard to begin.';
    }
  }

  /* 9. ALARM AUDIO */
  function getAudioCtx() {
    if (!state.audioCtx) {
      state.audioCtx = new (
        window.AudioContext || window.webkitAudioContext
      )();
    }

    return state.audioCtx;
  }

  function playAlarmBeep() {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'square';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        ctx.currentTime + 0.3
      );

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      /* Audio context may not be available */
    }
  }

  function startAlarm() {
    if (state.alarmInterval) return;

    playAlarmBeep();
    state.alarmInterval = setInterval(playAlarmBeep, 600);
  }

  function stopAlarm() {
    if (state.alarmInterval) {
      clearInterval(state.alarmInterval);
      state.alarmInterval = null;
    }
  }

  /* 10. DASHBOARD HELPERS */
  function setDriverStatus(label, detail, isAlert) {
    if (DOM.driverStatus) {
      DOM.driverStatus.innerHTML = `<i></i> ${label}`;
    }

    if (DOM.statusDetail) {
      DOM.statusDetail.textContent = detail;
    }

    if (DOM.statusCard) {
      DOM.statusCard.classList.toggle('alert', isAlert);
    }
  }

  function setGauge(pct) {
    const clamped = Math.max(0, Math.min(100, pct));

    if (DOM.gauge) {
      DOM.gauge.style.setProperty('--fatigue', clamped + '%');
      DOM.gauge.classList.toggle('alert', clamped > 60);
    }

    if (DOM.gaugeValue) {
      DOM.gaugeValue.textContent = Math.round(clamped);
    }

    if (DOM.fatigueIndex) {
      DOM.fatigueIndex.textContent = Math.round(clamped) + '%';
    }
  }

  function updateEarDisplay(ear) {
    const val = ear.toFixed(3);

    if (DOM.earValue) DOM.earValue.textContent = val;

    const pct = Math.min(100, (ear / 0.4) * 100);

    if (DOM.earBar) DOM.earBar.style.width = pct + '%';
  }

  function updateClosedDisplay(seconds) {
    if (DOM.closedTime) {
      DOM.closedTime.textContent = seconds.toFixed(1) + 's';
    }

    const pct = Math.min(100, (seconds / 3) * 100);

    if (DOM.closedBar) DOM.closedBar.style.width = pct + '%';
  }

  function updateYawnDisplay(now = Date.now()) {
    if (DOM.mouthRatio) {
      DOM.mouthRatio.textContent = state.mouthRatio === null
        ? '--'
        : state.mouthRatio.toFixed(3);
    }

    if (DOM.mouthBar) {
      const ratio = state.mouthRatio || 0;
      DOM.mouthBar.style.width = Math.min(100, (ratio / 0.9) * 100) + '%';
    }

    if (!DOM.yawnState) return;
    if (state.mouthRatio === null) {
      DOM.yawnState.textContent = 'WAITING';
    } else if (now < state.yawnStatusUntil) {
      DOM.yawnState.textContent = 'DETECTED';
    } else if (state.yawnStart !== null) {
      DOM.yawnState.textContent =
        `${Math.min(1.2, (now - state.yawnStart) / 1000).toFixed(1)}s / 1.2s`;
    } else if (state.mouthRatio >= 0.6) {
      DOM.yawnState.textContent = 'OPEN MOUTH';
    } else {
      DOM.yawnState.textContent = 'READY';
    }

    if (DOM.yawnBar) {
      DOM.yawnBar.style.width = state.yawnStart === null
        ? (state.mouthRatio >= 0.6 ? '5%' : '0%')
        : Math.min(100, ((now - state.yawnStart) / 1200) * 100) + '%';
    }
  }

  function updateAttentionChart(ear) {
    state.attentionData.push(ear);

    if (state.attentionData.length > 100) {
      state.attentionData.shift();
    }

    const w = 800;
    const h = 160;
    const step = w / (state.attentionData.length - 1);
    let linePath = '';
    let areaPath = '';

    state.attentionData.forEach((val, i) => {
      const x = i * step;
      const y = h - (val / 0.45) * h;
      const clampedY = Math.max(5, Math.min(h - 5, y));

      if (i === 0) {
        linePath += `M${x},${clampedY}`;
        areaPath += `M${x},${clampedY}`;
      } else {
        linePath += ` L${x},${clampedY}`;
        areaPath += ` L${x},${clampedY}`;
      }
    });

    areaPath += ` L${w},${h} L0,${h}Z`;

    if (DOM.attLine) DOM.attLine.setAttribute('d', linePath);
    if (DOM.attArea) DOM.attArea.setAttribute('d', areaPath);
  }

  /* 11. EAR CALCULATION */
  const RIGHT_EYE = {
    p1: 33, p2: 160, p3: 158, p4: 133, p5: 153, p6: 144,
  };

  const LEFT_EYE = {
    p1: 362, p2: 385, p3: 387, p4: 263, p5: 373, p6: 380,
  };

  function dist(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }

  function eyeAspectRatio(landmarks, eye) {
    const p1 = landmarks[eye.p1];
    const p2 = landmarks[eye.p2];
    const p3 = landmarks[eye.p3];
    const p4 = landmarks[eye.p4];
    const p5 = landmarks[eye.p5];
    const p6 = landmarks[eye.p6];

    const vertical1 = dist(p2, p6);
    const vertical2 = dist(p3, p5);
    const horizontal = dist(p1, p4);

    return (vertical1 + vertical2) / (2 * horizontal);
  }

  function computeEAR(landmarks) {
    const left = eyeAspectRatio(landmarks, LEFT_EYE);
    const right = eyeAspectRatio(landmarks, RIGHT_EYE);

    return (left + right) / 2;
  }

  function mouthAspectRatio(landmarks) {
    const top = landmarks[13];
    const bottom = landmarks[14];
    const left = landmarks[61];
    const right = landmarks[291];
    const mouthWidth = dist(left, right);

    return mouthWidth > 0 ? dist(top, bottom) / mouthWidth : 0;
  }

  function detectYawn(landmarks, ear, now) {
    const YAWN_THRESHOLD = 0.6;
    const YAWN_DURATION_MS = 1200;
    const YAWN_COOLDOWN_MS = 10000;

    state.mouthRatio = mouthAspectRatio(landmarks);
    if (state.mouthRatio < YAWN_THRESHOLD) {
      state.yawnStart = null;
      return;
    }

    if (state.yawnStart === null) state.yawnStart = now;
    const duration = (now - state.yawnStart) / 1000;

    if (
      duration >= YAWN_DURATION_MS / 1000 &&
      now - state.lastYawnAt >= YAWN_COOLDOWN_MS
    ) {
      state.lastYawnAt = now;
      state.yawnStart = null;
      state.yawnStatusUntil = now + 4000;
      sendEvent('yawn_detected', ear, duration);
    }
  }

  /* 12. FACE MESH RESULT HANDLER */
  const EAR_THRESHOLD = 0.22;
  const CLOSED_ALERT_SEC = 1.5;

  function onFaceMeshResults(results) {
    state.frameCount++;

    const now = performance.now();

    if (now - state.lastFrameTime >= 1000) {
      state.fpsValue = state.frameCount;
      state.frameCount = 0;
      state.lastFrameTime = now;

      if (DOM.fps) DOM.fps.textContent = state.fpsValue;
    }

    if (!DOM.overlay) return;

    const ctx = DOM.overlay.getContext('2d');

    ctx.clearRect(0, 0, DOM.overlay.width, DOM.overlay.height);

    if (
      !results.multiFaceLandmarks ||
      results.multiFaceLandmarks.length === 0
    ) {
      state.yawnStart = null;
      state.mouthRatio = null;
      state.eyeClosedStart = null;
      state.eyeClosedDuration = 0;
      updateClosedDisplay(0);
      setGauge(0);
      updateYawnDisplay();

      if (DOM.faceState) {
        DOM.faceState.textContent = 'FACE NOT DETECTED';
      }

      setDriverStatus(
        'FACE LOST',
        'Driver face not visible to camera',
        true
      );

      if (
        state.sessionId &&
        Date.now() - state.lastEventTime > 5000
      ) {
        state.lastEventTime = Date.now();
        sendEvent('face_lost', 0, 0);
      }

      clearAlertState();
      return;
    }

    const landmarks = results.multiFaceLandmarks[0];
    const ear = computeEAR(landmarks);

    state.totalEar += ear;
    state.totalFrames++;

    drawFaceMesh(ctx, landmarks);

    if (DOM.faceState) {
      DOM.faceState.textContent = 'FACE LOCKED · TRACKING';
    }

    updateEarDisplay(ear);
    updateAttentionChart(ear);
    detectYawn(landmarks, ear, Date.now());
    updateYawnDisplay();
    updateFeatureReadouts(ear);

    if (ear < EAR_THRESHOLD) {
      if (!state.eyeClosedStart) {
        state.eyeClosedStart = Date.now();
      }

      state.eyeClosedDuration =
        (Date.now() - state.eyeClosedStart) / 1000;

      updateClosedDisplay(state.eyeClosedDuration);

      const fatiguePct = Math.min(
        100,
        (state.eyeClosedDuration / 3) * 100
      );

      setGauge(fatiguePct);

      if (
        state.eyeClosedDuration >= CLOSED_ALERT_SEC &&
        !state.alertActive
      ) {
        triggerAlert(ear);
      }

      setDriverStatus(
        'DROWSY',
        `Eyes closed for ${state.eyeClosedDuration.toFixed(1)}s`,
        true
      );
    } else {
      if (state.alertActive) {
        clearAlertState();
      }

      state.eyeClosedStart = null;
      state.eyeClosedDuration = 0;

      updateClosedDisplay(0);
      setGauge(Math.max(0, ((0.3 - ear) / 0.3) * 30));

      if (Date.now() < state.yawnStatusUntil) {
        setDriverStatus(
          'YAWN DETECTED',
          'A prolonged yawn was recorded. Consider taking a break.',
          false
        );
      } else {
        setDriverStatus(
          'ALERT',
          'Driver attention confirmed',
          false
        );
      }
    }
  }

  function drawFaceMesh(ctx, landmarks) {
    const w = DOM.overlay.width;
    const h = DOM.overlay.height;

    ctx.fillStyle = 'rgba(0, 229, 255, 0.35)';
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.12)';
    ctx.lineWidth = 0.5;

    const keyPoints = [
      10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
      397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
      172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
      33, 160, 158, 133, 153, 144, 362, 385, 387, 263, 373, 380,
      1, 2, 4, 5,
      61, 291, 13, 14, 78, 308,
    ];

    for (const idx of keyPoints) {
      const p = landmarks[idx];
      if (!p) continue;

      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    const leftEyeContour = [
      362, 382, 381, 380, 374, 373, 390, 249,
      263, 466, 388, 387, 386, 385, 384, 398,
    ];

    const rightEyeContour = [
      33, 7, 163, 144, 145, 153, 154, 155,
      133, 173, 157, 158, 159, 160, 161, 246,
    ];

    drawContour(
      ctx, landmarks, leftEyeContour, w, h,
      'rgba(0, 229, 255, 0.6)'
    );

    drawContour(
      ctx, landmarks, rightEyeContour, w, h,
      'rgba(0, 229, 255, 0.6)'
    );

    const mouthContour = [
      61, 146, 91, 181, 84, 17, 314, 405, 321, 375,
      291, 409, 270, 269, 267, 0, 37, 39, 40, 185,
    ];

    drawContour(
      ctx, landmarks, mouthContour, w, h,
      'rgba(0, 229, 255, 0.3)'
    );
  }

  function drawContour(ctx, landmarks, indices, w, h, color) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    for (let i = 0; i < indices.length; i++) {
      const p = landmarks[indices[i]];
      if (!p) continue;

      if (i === 0) {
        ctx.moveTo(p.x * w, p.y * h);
      } else {
        ctx.lineTo(p.x * w, p.y * h);
      }
    }

    ctx.closePath();
    ctx.stroke();
  }

  /* 13. ALERT MANAGEMENT */
  const ALERT_SPEECH = {
    'en-IN': {
      phrase: 'Wake up. Your eyes have been closed. Please stop somewhere safe and take a rest.',
      title: 'WAKE UP — EYES CLOSED',
      detail: 'Your eyes have been closed too long. Stop somewhere safe and rest.',
      name: 'English',
    },
    'mr-IN': {
      phrase: 'जागे व्हा. तुमचे डोळे बराच वेळ बंद आहेत. कृपया सुरक्षित ठिकाणी थांबा आणि विश्रांती घ्या.',
      title: 'जागे व्हा — डोळे बंद आहेत',
      detail: 'डोळे बराच वेळ बंद आहेत. सुरक्षित ठिकाणी थांबून विश्रांती घ्या.',
      name: 'मराठी',
    },
    'hi-IN': {
      phrase: 'जाग जाइए। आपकी आँखें काफी देर से बंद हैं। कृपया सुरक्षित जगह पर रुककर आराम करें।',
      title: 'जाग जाइए — आँखें बंद हैं',
      detail: 'आपकी आँखें काफी देर से बंद हैं। सुरक्षित जगह पर रुककर आराम करें।',
      name: 'हिन्दी',
    },
  };

  function getSelectedLang() {
    return DOM.alertLanguage?.value || 'en-IN';
  }

  function setVoiceStatus(message, type = '') {
    if (!DOM.voiceStatus) return;
    DOM.voiceStatus.textContent = message;
    DOM.voiceStatus.dataset.state = type;
  }

  function updateAlertLanguage() {
    const alertCopy = ALERT_SPEECH[getSelectedLang()] || ALERT_SPEECH['en-IN'];
    const title = DOM.sleepAlert?.querySelector('strong');
    const detail = DOM.sleepAlert?.querySelector('span');
    if (title) title.textContent = alertCopy.title;
    if (detail) detail.textContent = alertCopy.detail;
  }

  function speakWakeUp(isTest = false) {
    if (
      !('speechSynthesis' in window) ||
      typeof SpeechSynthesisUtterance === 'undefined'
    ) {
      setVoiceStatus(
        'Spoken alerts are not supported by this browser. The safety alarm will still sound.',
        'error'
      );
      return false;
    }

    const language = getSelectedLang();
    const alertCopy = ALERT_SPEECH[language] || ALERT_SPEECH['en-IN'];
    const voices = window.speechSynthesis.getVoices();
    const baseLanguage = language.split('-')[0].toLowerCase();
    const voice = voices.find(item =>
      (item.lang || '').toLowerCase() === language.toLowerCase()
    ) || voices.find(item =>
      (item.lang || '').split('-')[0].toLowerCase() === baseLanguage
    );
    const utterance = new SpeechSynthesisUtterance(alertCopy.phrase);
    utterance.lang = language;
    utterance.rate = 0.88;
    utterance.pitch = 1;
    utterance.volume = 1;
    if (voice) utterance.voice = voice;

    utterance.onstart = () => setVoiceStatus(
      `${alertCopy.name} voice speaking${voice ? ` (${voice.name})` : ''}.`,
      'success'
    );
    utterance.onend = () => {
      if (isTest) setVoiceStatus(`${alertCopy.name} voice test finished.`, 'success');
    };
    utterance.onerror = event => {
      console.error('Spoken safety alert failed:', event.error);
      setVoiceStatus(
        `Could not play the ${alertCopy.name} voice (${event.error}). Install or enable this language's speech voice in your browser/OS.`,
        'error'
      );
    };

    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.error('Could not start spoken safety alert:', error);
      setVoiceStatus(
        `Could not start ${alertCopy.name} speech. Check browser speech settings.`,
        'error'
      );
      return false;
    }
    if (!voice) {
      setVoiceStatus(
        `Requesting ${alertCopy.name} speech. No matching installed voice was found; install the ${alertCopy.name} speech voice for best results.`,
        ''
      );
    } else {
      setVoiceStatus(`${alertCopy.name} voice is ready (${voice.name}).`, 'success');
    }
    return true;
  }

  function startSpeechAlert() {
    stopSpeechAlert();
    speakWakeUp();
    state.speechInterval = setInterval(() => {
      if (state.alertActive && (!DOM.alertToggle || DOM.alertToggle.checked)) {
        speakWakeUp();
      }
    }, 5000);
  }

  function stopSpeechAlert() {
    if (state.speechInterval) {
      clearInterval(state.speechInterval);
      state.speechInterval = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  function updateSpeechVoiceAvailability() {
    if (!DOM.voiceStatus) return;
    if (
      !('speechSynthesis' in window) ||
      typeof SpeechSynthesisUtterance === 'undefined'
    ) {
      setVoiceStatus(
        'Spoken alerts are not supported by this browser. The safety alarm will still sound.',
        'error'
      );
      return;
    }

    const language = getSelectedLang();
    const selected = ALERT_SPEECH[language] || ALERT_SPEECH['en-IN'];
    const base = language.split('-')[0].toLowerCase();
    const voice = window.speechSynthesis.getVoices().find(item =>
      (item.lang || '').toLowerCase() === language.toLowerCase()
    ) || window.speechSynthesis.getVoices().find(item =>
      (item.lang || '').split('-')[0].toLowerCase() === base
    );

    setVoiceStatus(
      voice
        ? `${selected.name} voice ready: ${voice.name}. Use Test spoken alert to check it.`
        : `No ${selected.name} voice is installed yet. Install this speech language in your browser/OS, then test again.`,
      voice ? 'success' : ''
    );
  }

  function triggerAlert(ear) {
    state.alertActive = true;

    if (DOM.sleepAlert) DOM.sleepAlert.classList.add('show');
    updateAlertLanguage();
    if (DOM.cameraPanel) DOM.cameraPanel.classList.add('alarm');

    if (DOM.recordState) {
      DOM.recordState.textContent = '● ALERT';
      DOM.recordState.style.color = '#ff3344';
    }

    if (!DOM.alertToggle || DOM.alertToggle.checked) {
      startAlarm();
      startSpeechAlert();
    }

    if (state.sessionId) {
      sendEvent('drowsiness_alert', ear, state.eyeClosedDuration);
    }
  }

  function clearAlertState() {
    state.alertActive = false;

    if (DOM.sleepAlert) DOM.sleepAlert.classList.remove('show');
    if (DOM.cameraPanel) DOM.cameraPanel.classList.remove('alarm');

    if (DOM.recordState) {
      DOM.recordState.textContent = state.monitoring
        ? '● MONITORING'
        : '● STANDBY';

      DOM.recordState.style.color = state.monitoring
        ? '#22c55e'
        : '';
    }

    stopAlarm();

    stopSpeechAlert();
  }

  const FACE_MESH_CDN =
    'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/';

  function createFaceMesh() {
    if (typeof FaceMesh === 'undefined') {
      throw new Error('MediaPipe Face Mesh did not load. Check your internet connection and refresh.');
    }

    const mesh = new FaceMesh({
      locateFile: file => `${FACE_MESH_CDN}${file}`,
    });
    mesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    mesh.onResults(onFaceMeshResults);
    return mesh;
  }

  async function closeFaceMesh(mesh) {
    if (!mesh) return;
    try {
      await mesh.close();
    } catch (error) {
      console.warn('Could not close Face Mesh cleanly:', error);
    }
  }

  function recoverFaceMesh(error, failedMesh) {
    console.error('Face Mesh frame processing failed:', error);
    if (
      !state.monitoring ||
      (failedMesh && failedMesh !== state.faceMesh)
    ) return;

    state.meshRetryCount++;
    const attempts = 3;
    if (state.meshRetryCount > attempts) {
      const reason = String(error?.message || error || 'Unknown MediaPipe error')
        .replace(/\s+/g, ' ')
        .slice(0, 180);
      stopMonitoring();
      if (DOM.faceState) DOM.faceState.textContent = 'FACE MESH STOPPED';
      setDriverStatus(
        'ERROR',
        `Face detection stopped after ${attempts} retries. ${reason} Check internet access and camera lighting, then start again.`,
        true
      );
      return;
    }

    if (DOM.faceState) {
      DOM.faceState.textContent = `RECONNECTING FACE MESH · ${state.meshRetryCount}/${attempts}`;
    }
    setDriverStatus(
      'RECONNECTING',
      'Recovering the face model. Keep the browser open and your face visible.',
      false
    );

    state.meshRetryTimer = setTimeout(async () => {
      state.meshRetryTimer = null;
      if (!state.monitoring) return;

      if (state.meshRetryCount === 2) {
        await closeFaceMesh(failedMesh);
        if (state.faceMesh === failedMesh) state.faceMesh = null;
        try {
          state.faceMesh = createFaceMesh();
        } catch (recoveryError) {
          recoverFaceMesh(recoveryError, state.faceMesh);
          return;
        }
      }

      processFrameLoop();
    }, state.meshRetryCount * 700);
  }

  /* 14. CAMERA & MEDIAPIPE INIT */
  async function startMonitoring() {
    if (state.monitoring) return;

    if (
      !DOM.video ||
      !DOM.overlay ||
      !DOM.cameraPanel
    ) {
      alert('Camera section elements are missing from the HTML.');
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Camera API is unavailable. Use localhost or HTTPS.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
      });

      DOM.video.srcObject = stream;
      await DOM.video.play();

      DOM.overlay.width = DOM.video.videoWidth || 640;
      DOM.overlay.height = DOM.video.videoHeight || 480;

      state.monitoring = true;

      DOM.cameraPanel.classList.add('monitoring');

      if (DOM.cameraState) DOM.cameraState.textContent = 'Camera active';
      if (DOM.startBtn) DOM.startBtn.textContent = 'STOP MONITORING ■';

      if (DOM.recordState) {
        DOM.recordState.textContent = '● MONITORING';
        DOM.recordState.style.color = '#22c55e';
      }

      if (DOM.faceState) {
        DOM.faceState.textContent = 'INITIALIZING FACE MESH...';
      }

      setDriverStatus(
        'INITIALIZING',
        'Loading face detection model...',
        false
      );

      startSession();

      try {
        state.faceMesh = createFaceMesh();
        state.meshRetryCount = 0;
        processFrameLoop();

        if (DOM.faceState) {
          DOM.faceState.textContent = 'WAITING FOR FACE...';
        }

        setDriverStatus(
          'SCANNING',
          'Looking for driver face...',
          false
        );
      } catch (meshError) {
        stopMonitoring();
        if (DOM.faceState) DOM.faceState.textContent = 'FACE MODEL UNAVAILABLE';
        setDriverStatus('ERROR', meshError.message, true);
        alert(meshError.message);
      }
    } catch (err) {
      console.error('Camera access error:', err);

      let msg = 'Camera access denied';

      if (err.name === 'NotAllowedError') {
        msg = 'Camera permission denied. Please allow camera access and refresh.';
      } else if (err.name === 'NotFoundError') {
        msg = 'No camera found. Please connect a camera.';
      } else if (err.name === 'NotReadableError') {
        msg = 'Camera is in use by another application.';
      }

      if (state.monitoring) stopMonitoring();
      else if (DOM.video?.srcObject) {
        DOM.video.srcObject.getTracks().forEach(track => track.stop());
        DOM.video.srcObject = null;
      }
      if (DOM.faceState) DOM.faceState.textContent = 'CAMERA ERROR';

      setDriverStatus('ERROR', msg, true);
      alert('⚠️ ' + msg);
    }
  }

  function processFrameLoop() {
    if (!state.monitoring || !state.faceMesh) return;

    if (DOM.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      requestAnimationFrame(processFrameLoop);
      return;
    }
    const mesh = state.faceMesh;
    try {
      mesh.send({ image: DOM.video })
        .then(() => {
          if (mesh !== state.faceMesh || !state.monitoring) return;
          state.meshRetryCount = 0;
          requestAnimationFrame(processFrameLoop);
        })
        .catch(error => recoverFaceMesh(error, mesh));
    } catch (error) {
      recoverFaceMesh(error, mesh);
    }
  }

  /* 15. STOP MONITORING */
  function stopMonitoring() {
    state.monitoring = false;
    state.yawnStart = null;
    state.mouthRatio = null;
    state.meshRetryCount = 0;
    if (state.meshRetryTimer) {
      clearTimeout(state.meshRetryTimer);
      state.meshRetryTimer = null;
    }

    if (DOM.cameraPanel) {
      DOM.cameraPanel.classList.remove('monitoring');
    }

    clearAlertState();

    if (state.cameraObj) {
      state.cameraObj.stop();
      state.cameraObj = null;
    }

    if (state.faceMesh) {
      closeFaceMesh(state.faceMesh);
      state.faceMesh = null;
    }

    if (DOM.video && DOM.video.srcObject) {
      DOM.video.srcObject.getTracks().forEach(track => track.stop());
      DOM.video.srcObject = null;
    }

    if (state.sessionId) {
      endSession();
    }

    if (DOM.cameraState) DOM.cameraState.textContent = 'Camera off';
    if (DOM.startBtn) DOM.startBtn.textContent = 'START MONITORING →';

    if (DOM.recordState) {
      DOM.recordState.textContent = '● STANDBY';
      DOM.recordState.style.color = '';
    }

    if (DOM.faceState) {
      DOM.faceState.textContent = 'WAITING FOR CAMERA';
    }

    setDriverStatus(
      'STANDBY',
      'Enable camera to begin monitoring',
      false
    );
  }

  /* 16. SESSION API */
  async function startSession() {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
      });

      if (res.ok) {
        const data = await res.json();
        state.sessionId = data.sessionId || data.id || null;
      }
    } catch (e) {
      console.warn(
        'Could not start session (backend may be offline):',
        e.message
      );
    }
  }

  async function endSession() {
    if (!state.sessionId) return;

    const avgEar = state.totalFrames > 0
      ? state.totalEar / state.totalFrames
      : null;

    try {
      await fetch(`/api/sessions/${state.sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ averageEar: avgEar }),
      });
    } catch (e) {
      console.warn('Could not end session:', e.message);
    }

    state.sessionId = null;
    state.totalEar = 0;
    state.totalFrames = 0;
  }

  async function sendEvent(eventType, ear, durationSeconds) {
    if (!state.sessionId) return;

    try {
      await fetch(`/api/sessions/${state.sessionId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType,
          ear,
          durationSeconds,
        }),
      });
    } catch (e) {
      console.warn('Could not send event:', e.message);
    }
  }

  /* 17. CONTACT FORM */
  if (DOM.contactForm) {
    DOM.contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = DOM.contactForm.elements.namedItem('name')?.value.trim();
      const email = DOM.contactForm.elements.namedItem('email')?.value.trim();
      const message = DOM.contactForm.elements.namedItem('message')?.value.trim();

      if (!name || !email || !message) {
        alert('Please fill all fields.');
        return;
      }

      const btn = DOM.contactForm.querySelector('button');

      if (!btn) return;

      const original = btn.innerHTML;
      btn.innerHTML = 'Sending...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, message }),
        });

        if (res.ok) {
          btn.innerHTML = '✓ Sent!';
          DOM.contactForm.reset();

          setTimeout(() => {
            btn.innerHTML = original;
            btn.disabled = false;
          }, 2500);
        } else {
          let data = {};

          try {
            data = await res.json();
          } catch (_) { }

          alert(data.error || 'Something went wrong.');

          btn.innerHTML = original;
          btn.disabled = false;
        }
      } catch (err) {
        console.error('Contact form error:', err);
        alert('Unable to send message. Check that the backend is running.');

        btn.innerHTML = original;
        btn.disabled = false;
      }
    });
  }

  /* 18. BUTTON BINDINGS */
  if (DOM.startBtn) {
    DOM.startBtn.addEventListener('click', async () => {
      if (state.monitoring) {
        stopMonitoring();
        return;
      }
      DOM.startBtn.disabled = true;
      try { await startMonitoring(); }
      finally { DOM.startBtn.disabled = false; }
    });
  }

  if (DOM.alertToggle) {
    DOM.alertToggle.addEventListener('change', () => {
      if (!DOM.alertToggle.checked) {
        stopAlarm();
        stopSpeechAlert();
      } else if (state.alertActive) {
        startAlarm();
        startSpeechAlert();
      }
    });
  }

  if (DOM.alertLanguage) {
    DOM.alertLanguage.addEventListener('change', () => {
      updateAlertLanguage();
      updateSpeechVoiceAvailability();
      if (state.alertActive && (!DOM.alertToggle || DOM.alertToggle.checked)) {
        startSpeechAlert();
      }
    });
  }

  window.addEventListener('safaraguardlanguagechange', event => {
    const language = event.detail?.language;
    if (DOM.alertLanguage && ALERT_SPEECH[language]) {
      DOM.alertLanguage.value = language;
    }
    updateAlertLanguage();
    updateSpeechVoiceAvailability();
  });

  if (DOM.testVoiceBtn) {
    DOM.testVoiceBtn.addEventListener('click', () => {
      if (!speakWakeUp(true)) return;
    });
  }

  if ('speechSynthesis' in window) {
    if (typeof window.speechSynthesis.addEventListener === 'function') {
      window.speechSynthesis.addEventListener(
        'voiceschanged',
        updateSpeechVoiceAvailability
      );
    } else {
      window.speechSynthesis.onvoiceschanged = updateSpeechVoiceAvailability;
    }
  }
  updateAlertLanguage();
  updateSpeechVoiceAvailability();

  /* 19. INIT LOG */
  console.log(
    '%c✦ SafarGuard AI — Initialized',
    'color: #00e5ff; font-weight: bold; font-size: 14px;'
  );
})();

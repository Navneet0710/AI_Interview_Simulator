import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, CameraOff, Eye, Activity, AlertCircle } from 'lucide-react';

/**
 * WebcamScanner with real facial analysis via MediaPipe FaceLandmarker.
 * Detects: facial expression, eye contact, head pose, blink rate, stress level.
 * Falls back to simulation mode if camera or ML model fails to load.
 */
export default function WebcamScanner({ isInterviewActive, userSpeaking }) {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');

  // ML model state
  const [mlReady, setMlReady] = useState(false);
  const [mlLoading, setMlLoading] = useState(true);
  const [mlError, setMlError] = useState('');

  // Real-time HUD metrics (use refs to avoid excessive re-renders, sync to state at lower frequency)
  const [expression, setExpression] = useState('Neutral');
  const [eyeContactActive, setEyeContactActive] = useState(true);
  const [stressLevel, setStressLevel] = useState('Low');
  const [blinkRate, setBlinkRate] = useState(0);
  const [eyeContactPct, setEyeContactPct] = useState(100);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const landmarkerRef = useRef(null);
  const streamRef = useRef(null); // Use ref instead of state to avoid stale closure in cleanup

  // Tracking refs for running calculations
  const metricsRef = useRef({
    eyeContactFrames: 0,
    totalFrames: 0,
    blinkCount: 0,
    wasBlinking: false,
    startTime: Date.now(),
    recentHeadPositions: [],
    lastStateUpdate: 0, // throttle state updates to ~4fps
  });

  // -------------------------------------------------
  // 1. Initialize MediaPipe FaceLandmarker
  // -------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function initMediaPipe() {
      try {
        const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');

        const filesetResolver = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true
        });

        if (!cancelled) {
          landmarkerRef.current = landmarker;
          setMlReady(true);
          setMlLoading(false);
        }
      } catch (err) {
        console.error('MediaPipe init error:', err);
        if (!cancelled) {
          setMlError('Face analysis model could not load. Using simulation fallback.');
          setMlLoading(false);
        }
      }
    }

    initMediaPipe();
    return () => { cancelled = true; };
  }, []);

  // -------------------------------------------------
  // 2. Start Webcam
  // -------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let localStream = null;

    async function startCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: false // Audio is handled by SpeechTracker
        });

        // If component unmounted while awaiting, stop the stream immediately
        if (cancelled) {
          mediaStream.getTracks().forEach(track => track.stop());
          return;
        }

        localStream = mediaStream;
        streamRef.current = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
        setCameraActive(true);
        setCameraError('');
      } catch (err) {
        console.error('Error starting camera:', err);
        if (!cancelled) {
          setCameraError('Webcam access blocked or unavailable. Visual tracking is running in simulation mode.');
          setCameraActive(false);
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      // Stop tracks using local variable (not stale state)
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // -------------------------------------------------
  // 3. Blendshape → Metric Extraction Helpers
  // -------------------------------------------------
  const processBlendshapes = useCallback((blendshapeCategories) => {
    // Convert array to lookup map
    const bs = {};
    blendshapeCategories.forEach(b => { bs[b.categoryName] = b.score; });

    const m = metricsRef.current;
    m.totalFrames++;

    // --- Eye Contact Detection ---
    const gazeUp = Math.max(bs['eyeLookUpLeft'] || 0, bs['eyeLookUpRight'] || 0);
    const gazeDown = Math.max(bs['eyeLookDownLeft'] || 0, bs['eyeLookDownRight'] || 0);
    const gazeIn = Math.max(bs['eyeLookInLeft'] || 0, bs['eyeLookInRight'] || 0);
    const gazeOut = Math.max(bs['eyeLookOutLeft'] || 0, bs['eyeLookOutRight'] || 0);
    const gazeDeviation = Math.max(gazeUp, gazeDown, gazeIn, gazeOut);
    const hasEyeContact = gazeDeviation < 0.35;

    if (hasEyeContact) m.eyeContactFrames++;

    // --- Blink Detection ---
    const blinkLeft = bs['eyeBlinkLeft'] || 0;
    const blinkRight = bs['eyeBlinkRight'] || 0;
    const isBlinking = (blinkLeft + blinkRight) / 2 > 0.5;
    if (isBlinking && !m.wasBlinking) {
      m.blinkCount++;
    }
    m.wasBlinking = isBlinking;

    // --- Expression Detection ---
    const smileScore = ((bs['mouthSmileLeft'] || 0) + (bs['mouthSmileRight'] || 0)) / 2;
    const jawOpen = bs['jawOpen'] || 0;
    const browDown = ((bs['browDownLeft'] || 0) + (bs['browDownRight'] || 0)) / 2;
    const browUp = bs['browInnerUp'] || 0;
    const mouthFunnel = bs['mouthFunnel'] || 0;

    let expr = 'Neutral';
    if (jawOpen > 0.25 || mouthFunnel > 0.3) expr = 'Speaking';
    else if (smileScore > 0.35) expr = 'Confident';
    else if (browDown > 0.3) expr = 'Focused';
    else if (browUp > 0.4) expr = 'Surprised';

    // --- Stress Level ---
    const elapsedMinutes = (Date.now() - m.startTime) / 60000;
    const currentBlinkRate = elapsedMinutes > 0.1 ? Math.round(m.blinkCount / elapsedMinutes) : 0;
    const blinkStress = currentBlinkRate > 25 ? 0.3 : 0;
    const browStress = browDown > 0.2 ? browDown * 0.5 : 0;
    const gazeStress = !hasEyeContact ? 0.2 : 0;
    const totalStress = blinkStress + browStress + gazeStress;
    const stress = totalStress > 0.5 ? 'High' : totalStress > 0.25 ? 'Moderate' : 'Low';

    // --- Throttled state updates (~4fps to avoid excessive re-renders) ---
    const now = Date.now();
    if (now - m.lastStateUpdate > 250) {
      m.lastStateUpdate = now;
      const pct = m.totalFrames > 0 ? Math.round((m.eyeContactFrames / m.totalFrames) * 100) : 100;
      setEyeContactActive(hasEyeContact);
      setEyeContactPct(pct);
      setBlinkRate(currentBlinkRate);
      setExpression(expr);
      setStressLevel(stress);
    }
  }, []);

  // -------------------------------------------------
  // 4. Simulation fallback (when ML model not loaded)
  // -------------------------------------------------
  const runSimulatedMetrics = useCallback(() => {
    if (userSpeaking) {
      setExpression('Speaking');
      setStressLevel(Math.random() > 0.7 ? 'Moderate' : 'Low');
      setBlinkRate(prev => Math.min(22, Math.max(12, prev + Math.floor(Math.random() * 3) - 1)));
    } else {
      setExpression(isInterviewActive ? 'Thinking' : 'Focused');
      setStressLevel('Low');
      setBlinkRate(prev => Math.min(18, Math.max(10, prev + Math.floor(Math.random() * 3) - 1)));
    }
    setEyeContactPct(prev => Math.min(100, Math.max(70, prev + Math.floor(Math.random() * 5) - 2)));
    setEyeContactActive(Math.random() > 0.15);
  }, [userSpeaking, isInterviewActive]);

  // -------------------------------------------------
  // 5. Canvas HUD + Detection Loop
  // -------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let frame = 0;
    let lastDetectTime = 0;

    const resizeCanvas = () => {
      if (canvas && canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
      }
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Store detected landmarks for HUD drawing
    let currentLandmarks = null;

    const drawHUD = (timestamp) => {
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;

      if (w === 0 || h === 0) {
        animationRef.current = requestAnimationFrame(drawHUD);
        return;
      }

      // --- Run ML detection every ~66ms (15fps for performance) ---
      if (cameraActive && mlReady && landmarkerRef.current && videoRef.current) {
        if (timestamp - lastDetectTime > 66) {
          lastDetectTime = timestamp;
          try {
            const results = landmarkerRef.current.detectForVideo(videoRef.current, timestamp);
            if (results.faceLandmarks && results.faceLandmarks.length > 0) {
              currentLandmarks = results.faceLandmarks[0];
            }
            if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
              processBlendshapes(results.faceBlendshapes[0].categories);
            }
          } catch (e) {
            // Silently skip detection errors
          }
        }
      } else if (cameraActive && !mlReady && frame % 30 === 0) {
        // Run simulation at ~2fps when ML isn't available
        runSimulatedMetrics();
      }

      // === Draw futuristic HUD overlay ===

      // Screen corner brackets
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
      ctx.lineWidth = 2;
      const cl = 20;

      ctx.beginPath();
      ctx.moveTo(10, 10 + cl); ctx.lineTo(10, 10); ctx.lineTo(10 + cl, 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w - 10, 10 + cl); ctx.lineTo(w - 10, 10); ctx.lineTo(w - 10 - cl, 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(10, h - 10 - cl); ctx.lineTo(10, h - 10); ctx.lineTo(10 + cl, h - 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w - 10, h - 10 - cl); ctx.lineTo(w - 10, h - 10); ctx.lineTo(w - 10 - cl, h - 10);
      ctx.stroke();

      if (cameraActive) {
        // Scanning sweep line
        const scanY = (Math.sin(frame * 0.015) + 1) * 0.5 * h;
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(20, scanY);
        ctx.lineTo(w - 20, scanY);
        ctx.stroke();

        const gradient = ctx.createLinearGradient(0, scanY - 8, 0, scanY + 8);
        gradient.addColorStop(0, 'rgba(6, 182, 212, 0)');
        gradient.addColorStop(0.5, 'rgba(6, 182, 212, 0.12)');
        gradient.addColorStop(1, 'rgba(6, 182, 212, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(20, scanY - 8, w - 40, 16);

        // Draw REAL face landmarks if available
        if (currentLandmarks) {
          // Draw mesh connections (subset for performance)
          ctx.strokeStyle = 'rgba(6, 182, 212, 0.15)';
          ctx.lineWidth = 0.5;

          // Face oval outline (indices 0-16 approximate face contour)
          const ovalIndices = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 
                               397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 
                               172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10];
          ctx.beginPath();
          ovalIndices.forEach((idx, i) => {
            if (idx < currentLandmarks.length) {
              const pt = currentLandmarks[idx];
              const px = (1 - pt.x) * w; // Mirror for selfie view
              const py = pt.y * h;
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
          });
          ctx.stroke();

          // Draw key landmark dots (eyes, nose, mouth)
          const keyPoints = [
            // Left eye
            33, 133, 159, 145,
            // Right eye
            263, 362, 386, 374,
            // Nose
            1, 4, 5, 195,
            // Mouth
            61, 291, 13, 14, 78, 308
          ];

          ctx.fillStyle = 'rgba(99, 102, 241, 0.7)';
          keyPoints.forEach(idx => {
            if (idx < currentLandmarks.length) {
              const pt = currentLandmarks[idx];
              const px = (1 - pt.x) * w;
              const py = pt.y * h;
              ctx.beginPath();
              ctx.arc(px, py, 2, 0, Math.PI * 2);
              ctx.fill();
            }
          });

          // Eye reticles
          ctx.strokeStyle = 'rgba(99, 102, 241, 0.3)';
          ctx.lineWidth = 1;
          [159, 386].forEach(idx => { // Top of each eye
            if (idx < currentLandmarks.length) {
              const pt = currentLandmarks[idx];
              const px = (1 - pt.x) * w;
              const py = pt.y * h;
              ctx.beginPath();
              ctx.arc(px, py, 10 + Math.sin(frame * 0.08) * 3, 0, Math.PI * 2);
              ctx.stroke();
            }
          });

          // Face bounding box from landmarks
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          currentLandmarks.forEach(pt => {
            const px = (1 - pt.x) * w;
            const py = pt.y * h;
            if (px < minX) minX = px;
            if (py < minY) minY = py;
            if (px > maxX) maxX = px;
            if (py > maxY) maxY = py;
          });

          const pad = 15;
          ctx.strokeStyle = 'rgba(6, 182, 212, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2);

          ctx.fillStyle = 'rgba(6, 182, 212, 0.9)';
          ctx.font = 'bold 9px monospace';
          ctx.fillText('FACE LOCK 100%', minX - pad, minY - pad - 6);

        } else {
          // No landmarks — draw simulated targeting circle
          ctx.strokeStyle = 'rgba(99, 102, 241, 0.25)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 6]);
          ctx.beginPath();
          ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.35, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.font = '10px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Searching for face...', w / 2, h / 2);
          ctx.textAlign = 'start';
        }
      } else {
        // Camera inactive — simulation placeholder
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(15, 15, w - 30, h - 30);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Camera Feed Inactive', w / 2, h / 2 - 10);
        ctx.fillText('Simulating Biometric Cues', w / 2, h / 2 + 10);
        ctx.textAlign = 'start';
      }

      animationRef.current = requestAnimationFrame(drawHUD);
    };

    drawHUD(performance.now());

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [cameraActive, mlReady, processBlendshapes, runSimulatedMetrics]);

  // Stress level color
  const stressColor = stressLevel === 'High' ? 'text-rose-400' : stressLevel === 'Moderate' ? 'text-amber-400' : 'text-emerald-400';
  const stressBg = stressLevel === 'High' ? 'rgba(244,63,94,0.15)' : stressLevel === 'Moderate' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.1)';

  return (
    <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-slate-950 border border-white/10 shadow-2xl flex items-center justify-center" style={{ position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: '1rem', overflow: 'hidden', background: '#020617', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Video stream */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: 'scaleX(-1)',
          display: cameraActive ? 'block' : 'none'
        }}
      />
      
      {/* Simulation Background (when camera is offline) */}
      {!cameraActive && (
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, rgba(15,23,42,0.8), rgba(2,6,23,1))', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <CameraOff style={{ width: '3rem', height: '3rem', color: 'rgb(100,116,139)', marginBottom: '0.75rem', animation: 'pulse 2s infinite' }} />
          {cameraError && (
            <p style={{ fontSize: '0.625rem', color: 'rgb(148,163,184)', maxWidth: '16rem', textAlign: 'center', padding: '0 1rem' }}>
              {cameraError}
            </p>
          )}
        </div>
      )}

      {/* Futuristic scanning Canvas HUD */}
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}
      />

      {/* ML Model Loading Indicator */}
      {mlLoading && cameraActive && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 15, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', padding: '1rem 1.5rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
          <div style={{ width: '1.5rem', height: '1.5rem', border: '2px solid rgba(6,182,212,0.3)', borderTopColor: 'rgb(6,182,212)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 0.5rem' }}></div>
          <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.7)' }}>Loading face analysis model...</span>
        </div>
      )}

      {/* Biometric Stats Floating Widgets */}
      <div style={{ position: 'absolute', bottom: '1rem', left: '1rem', right: '1rem', zIndex: 20, display: 'flex', justifyContent: 'space-between', gap: '0.5rem', pointerEvents: 'none' }}>
        {/* Expression Badge */}
        <div style={{ background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)', padding: '0.5rem 0.75rem', borderRadius: '0.75rem', display: 'flex', flexDirection: 'column', pointerEvents: 'auto' }}>
          <span style={{ fontSize: '0.5625rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgb(6,182,212)', fontWeight: 700, marginBottom: '0.125rem' }}>Expression</span>
          <span style={{ fontSize: '0.75rem', color: 'white', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <Eye style={{ width: '0.75rem', height: '0.75rem', color: 'rgb(6,182,212)' }} />
            {expression}
          </span>
        </div>

        {/* Eye Contact Badge */}
        <div style={{ background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)', padding: '0.5rem 0.75rem', borderRadius: '0.75rem', display: 'flex', flexDirection: 'column', pointerEvents: 'auto' }}>
          <span style={{ fontSize: '0.5625rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: eyeContactActive ? 'rgb(16,185,129)' : 'rgb(244,63,94)', fontWeight: 700, marginBottom: '0.125rem' }}>Eye Contact</span>
          <span style={{ fontSize: '0.75rem', color: 'white', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <span style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', background: eyeContactActive ? 'rgb(16,185,129)' : 'rgb(244,63,94)', display: 'inline-block', animation: eyeContactActive ? 'none' : 'pulse 1.5s infinite' }}></span>
            {eyeContactPct}%
          </span>
        </div>

        {/* Blink Rate Badge */}
        <div style={{ background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)', padding: '0.5rem 0.75rem', borderRadius: '0.75rem', display: 'flex', flexDirection: 'column', pointerEvents: 'auto' }}>
          <span style={{ fontSize: '0.5625rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgb(165,180,252)', fontWeight: 700, marginBottom: '0.125rem' }}>Blink Rate</span>
          <span style={{ fontSize: '0.75rem', color: 'white', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <Activity style={{ width: '0.75rem', height: '0.75rem', color: 'rgb(165,180,252)' }} />
            {blinkRate} <span style={{ fontSize: '0.5625rem', color: 'rgba(255,255,255,0.5)', fontWeight: 400 }}>/min</span>
          </span>
        </div>

        {/* Stress Badge */}
        <div style={{ background: stressBg, border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)', padding: '0.5rem 0.75rem', borderRadius: '0.75rem', display: 'flex', flexDirection: 'column', pointerEvents: 'auto' }}>
          <span style={{ fontSize: '0.5625rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgb(99,102,241)', fontWeight: 700, marginBottom: '0.125rem' }}>Stress Level</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: stressLevel === 'High' ? 'rgb(244,63,94)' : stressLevel === 'Moderate' ? 'rgb(245,158,11)' : 'rgb(16,185,129)' }}>
            {stressLevel}
          </span>
        </div>
      </div>

      {/* Status Bar */}
      <div style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)', padding: '0.25rem 0.625rem', borderRadius: '9999px', fontSize: '0.5625rem', fontFamily: 'monospace', color: mlReady ? 'rgb(6,182,212)' : 'rgb(245,158,11)', display: 'flex', alignItems: 'center', gap: '0.375rem', letterSpacing: '0.05em' }}>
        <span style={{ width: '0.375rem', height: '0.375rem', borderRadius: '50%', background: mlReady ? 'rgb(6,182,212)' : 'rgb(245,158,11)', animation: 'pulse 2s infinite' }}></span>
        {mlReady ? 'MEDIAPIPE_ACTIVE' : mlLoading ? 'ML_LOADING...' : 'SIMULATION_MODE'}
      </div>

      {/* ML Error notice */}
      {mlError && !mlLoading && (
        <div style={{ position: 'absolute', top: '1rem', left: '1rem', zIndex: 20, background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '0.5rem', padding: '0.4rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.55rem', color: 'rgb(245,158,11)' }}>
          <AlertCircle style={{ width: '0.75rem', height: '0.75rem', flexShrink: 0 }} />
          {mlError}
        </div>
      )}
    </div>
  );
}

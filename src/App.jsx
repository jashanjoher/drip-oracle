import React, { useEffect, useRef, useState, useCallback } from 'react';

const ROASTS = {
  low: [
    'That outfit called. It wants its dignity back.',
    'Bold of you to leave the house like that. Bold and wrong.',
    'Your fit has filed a missing persons report.',
    'Somewhere a thrift store is judging you.',
  ],
  mid: [
    'Respectable. Forgettable, but respectable.',
    'Solid base, zero personality. Add one accessory and pray.',
    'You are wearing clothes. Technically that counts.',
  ],
  high: [
    'Okay, the drip is unreasonable. Someone call the fashion police to arrest your competition.',
    'Main character energy detected. Mirrors are filing complaints.',
    'Golden hour lives in your wardrobe rent free.',
  ],
};

const COMBOS = [
  'Swap the hoodie for a structured overshirt and go monochrome.',
  'Add a chunky watch and clean white sneakers.',
  'Tuck the top in and add a belt with a bold buckle.',
  'Layer a denim jacket over the outfit and roll the sleeves once.',
  'Try a dark pair of straight-leg trousers and a crisp knit.',
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Lightweight on-device stand-in for a vision rater: scores frame contrast and colour variety.
// No frames leave the browser.
function scoreFrame(video, canvas) {
  const w = 64;
  const h = 48;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  let sum = 0;
  let sumSq = 0;
  let colourSpread = 0;
  const n = w * h;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sum += lum;
    sumSq += lum * lum;
    colourSpread += Math.abs(data[i] - data[i + 1]) + Math.abs(data[i + 1] - data[i + 2]);
  }
  const mean = sum / n;
  const contrast = Math.sqrt(Math.max(0, sumSq / n - mean * mean)) / 128;
  const spread = colourSpread / n / 255;
  const raw = 3 + contrast * 9 + spread * 6;
  return Math.max(1, Math.min(10, Math.round(raw * 10) / 10));
}

function useAudio() {
  const ctxRef = useRef(null);
  const getCtx = () => {
    if (!ctxRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctxRef.current = new AC();
    }
    return ctxRef.current;
  };
  const tone = useCallback((freq, dur = 0.2, type = 'sine', gain = 0.12, sweepTo) => {
    const ctx = getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }, []);
  return {
    unlock: () => getCtx()?.resume?.(),
    low: () => tone(180, 0.5, 'sawtooth', 0.15, 60),
    mid: () => tone(440, 0.2),
    high: () => { tone(660, 0.15); setTimeout(() => tone(990, 0.3), 120); },
  };
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  u.pitch = 0.9;
  window.speechSynthesis.speak(u);
}

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const audio = useAudio();
  const [status, setStatus] = useState('REQUESTING CAMERA');
  const [error, setError] = useState('');
  const [score, setScore] = useState(null);
  const [roast, setRoast] = useState('');
  const [combo, setCombo] = useState('');
  const [tier, setTier] = useState('neutral');
  const [voiceOn, setVoiceOn] = useState(true);
  const voiceRef = useRef(true);
  voiceRef.current = voiceOn;

  useEffect(() => {
    let stream;
    let timer;
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera API is not available in this browser.');
        setStatus('OFFLINE');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = videoRef.current;
        v.srcObject = stream;
        await v.play();
        setStatus('LIVE');
        analyse();
        timer = setInterval(analyse, 6000);
      } catch (e) {
        setError('Camera access was denied or unavailable. Allow camera permission and reload.');
        setStatus('NO SIGNAL');
      }
    }

    function analyse() {
      const v = videoRef.current;
      if (!v || v.readyState < 2) return;
      const s = scoreFrame(v, canvasRef.current);
      const t = s >= 7.5 ? 'high' : s >= 4.5 ? 'mid' : 'low';
      const line = pick(ROASTS[t === 'high' ? 'high' : t === 'mid' ? 'mid' : 'low']);
      setScore(s);
      setTier(t);
      setRoast(line);
      setCombo(pick(COMBOS));
      if (t === 'low') audio.low();
      else if (t === 'high') audio.high();
      else audio.mid();
      if (voiceRef.current) speak(line);
    }

    start();
    return () => {
      cancelled = true;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      window.speechSynthesis?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const edgeClass = tier === 'low' ? 'edge low' : tier === 'high' ? 'edge high' : 'edge';
  const scoreColour = tier === 'low' ? '#ff2a00' : tier === 'high' ? '#ffd700' : '#39ff14';

  return (
    <div className="stage" onClick={() => audio.unlock()}>
      <video ref={videoRef} className="video" playsInline muted autoPlay />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <div className={edgeClass} />
      <div className="scanlines" />
      <div className="crosshair tl" />
      <div className="crosshair tr" />
      <div className="crosshair bl" />
      <div className="crosshair br" />
      <div className="status">DRIP ORACLE // {status}</div>
      <button
        onClick={(e) => { e.stopPropagation(); setVoiceOn((x) => !x); }}
        style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', color: '#39ff14', border: '1px solid #39ff14', padding: '6px 10px', fontFamily: 'inherit', cursor: 'pointer' }}
      >
        VOICE {voiceOn ? 'ON' : 'OFF'}
      </button>
      {error ? (
        <div className="msg" style={{ color: '#ff2a00' }}>{error}</div>
      ) : (
        <div className="hud">
          <div className="score" style={{ color: scoreColour }}>
            {score === null ? 'SCANNING...' : `${score.toFixed(1)} / 10`}
          </div>
          <div className="roast">{roast || 'Hold still. The oracle is studying your fit.'}</div>
          {combo && <div className="combo">Try: {combo}</div>}
        </div>
      )}
    </div>
  );
}

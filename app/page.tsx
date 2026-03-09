'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

type CallState =
  | 'idle'
  | 'ringing'
  | 'connected'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'ended';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Browser compatibility check ────────────────────────────────────────────

function getSpeechRecognition(): any {
  if (typeof window === 'undefined') return null;
  return (
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition ||
    null
  );
}

// ─── Web Audio Ringtone ──────────────────────────────────────────────────────

function createRingtone(): { stop: () => void } | null {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    const playBeep = (startTime: number, freq = 520) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.25, startTime + 0.05);
      gain.gain.setValueAtTime(0.25, startTime + 0.35);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);
      osc.start(startTime);
      osc.stop(startTime + 0.5);
    };

    // Nigerian-style double ring pattern: ring-ring ... pause ... ring-ring
    const schedulePattern = (offset: number) => {
      playBeep(offset + 0.0, 520);
      playBeep(offset + 0.0, 660); // harmony
      playBeep(offset + 0.6, 520);
      playBeep(offset + 0.6, 660);
    };

    schedulePattern(0.1);
    schedulePattern(2.3);
    schedulePattern(4.5);

    return {
      stop: () => {
        try {
          ctx.close();
        } catch {}
      },
    };
  } catch {
    return null;
  }
}

// ─── Format time ────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ─── Orb Component ──────────────────────────────────────────────────────────

function Orb({ state }: { state: CallState }) {
  const orbClass = {
    idle: 'orb-idle',
    ringing: 'orb-ringing',
    connected: 'orb-idle',
    listening: 'orb-listening',
    thinking: 'orb-thinking',
    speaking: 'orb-speaking',
    ended: '',
  }[state];

  const borderColor = {
    idle: 'border-emerald-700',
    ringing: 'border-emerald-500',
    connected: 'border-emerald-600',
    listening: 'border-emerald-400',
    thinking: 'border-emerald-600',
    speaking: 'border-emerald-400',
    ended: 'border-zinc-700',
  }[state];

  const bgGradient = {
    idle: 'from-zinc-900 via-emerald-950 to-zinc-900',
    ringing: 'from-zinc-900 via-emerald-950 to-zinc-900',
    connected: 'from-zinc-900 via-emerald-950 to-zinc-900',
    listening: 'from-zinc-800 via-emerald-950 to-zinc-900',
    thinking: 'from-zinc-900 via-zinc-800 to-zinc-900',
    speaking: 'from-zinc-800 via-emerald-950 to-zinc-900',
    ended: 'from-zinc-950 via-zinc-900 to-zinc-950',
  }[state];

  return (
    <div className="relative flex items-center justify-center" style={{ width: 180, height: 180 }}>
      {/* Ripple rings — only when speaking */}
      {state === 'speaking' && (
        <>
          <div
            className="ripple-ring absolute rounded-full border border-emerald-500"
            style={{ width: 180, height: 180, opacity: 0 }}
          />
          <div
            className="ripple-ring-delayed absolute rounded-full border border-emerald-500"
            style={{ width: 180, height: 180, opacity: 0 }}
          />
          <div
            className="ripple-ring-delayed-2 absolute rounded-full border border-emerald-500"
            style={{ width: 180, height: 180, opacity: 0 }}
          />
        </>
      )}

      {/* Thinking spinner ring */}
      {state === 'thinking' && (
        <div
          className="thinking-spinner absolute rounded-full"
          style={{
            width: 196,
            height: 196,
            background:
              'conic-gradient(from 0deg, transparent 0%, #10b981 25%, transparent 50%, transparent 100%)',
            borderRadius: '50%',
            padding: 2,
          }}
        />
      )}

      {/* Main orb */}
      <div
        className={`orb-base ${orbClass} ${borderColor} rounded-full border-2 bg-gradient-to-br ${bgGradient} flex items-center justify-center`}
        style={{ width: 180, height: 180 }}
      >
        {/* Inner glow dot */}
        <div
          className={`rounded-full transition-all duration-500 ${
            state === 'listening'
              ? 'bg-emerald-400 opacity-80'
              : state === 'speaking'
              ? 'bg-emerald-300 opacity-90'
              : state === 'thinking'
              ? 'bg-emerald-600 opacity-60'
              : 'bg-emerald-700 opacity-40'
          }`}
          style={{ width: 24, height: 24 }}
        />
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function PathSagePage() {
  const [callState, setCallState] = useState<CallState>('idle');
  const [transcript, setTranscript] = useState('');
  const [aiText, setAiText] = useState('');
  const [statusText, setStatusText] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const [isSupported, setIsSupported] = useState(true);
  const [micError, setMicError] = useState('');
  const [endedDuration, setEndedDuration] = useState('');

  const messagesRef = useRef<Message[]>([]);
  const recognitionRef = useRef<any>(null);
  const ringtoneRef = useRef<{ stop: () => void } | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const callStateRef = useRef<CallState>('idle');
  const finalTranscriptRef = useRef('');
  const audioUnlockedRef = useRef(false);
  // Keep ref in sync with state
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  // Check browser support
  useEffect(() => {
    const SR = getSpeechRecognition();
    if (!SR) {
      setIsSupported(false);
    }
  }, []);

  // Timer
  useEffect(() => {
    if (callState === 'connected' || callState === 'listening' || callState === 'thinking' || callState === 'speaking') {
      timerRef.current = setInterval(() => {
        setCallDuration((d) => d + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  // ─── Speech via Groq Orpheus TTS ────────────────────────────────────────

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Unlock audio on mobile — must be called inside a user gesture (tap)
  const unlockAudio = useCallback(() => {
    if (audioUnlockedRef.current) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      setTimeout(() => ctx.close(), 100);
      audioUnlockedRef.current = true;
    } catch {}
  }, []);

  const speak = useCallback(async (text: string, onDone?: () => void) => {
    // Stop any playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setCallState('speaking');
    setStatusText('Speaking');

    const handleFallback = () => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.92;
      utterance.onend = () => {
        if (callStateRef.current !== 'ended') {
          if (onDone) onDone();
          else startListening();
        }
      };
      window.speechSynthesis.speak(utterance);
    };

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        console.error('TTS failed with status:', res.status);
        handleFallback();
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      const handleDone = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        if (callStateRef.current !== 'ended') {
          if (onDone) onDone();
          else startListening();
        }
      };

      audio.onended = handleDone;
      audio.onerror = () => {
        console.error('Audio playback error, falling back');
        handleFallback();
      };

      // Mobile requires explicit user-gesture-unlocked play
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          console.error('audio.play() blocked, falling back');
          handleFallback();
        });
      }

    } catch (err) {
      console.error('TTS error, falling back:', err);
      handleFallback();
    }
  }, []);

  // ─── Send to Groq ───────────────────────────────────────────────────────

  const sendToGroq = useCallback(
    async (userText: string) => {
      if (!userText.trim()) {
        startListening();
        return;
      }

      const userMessage: Message = { role: 'user', content: userText };
      messagesRef.current = [...messagesRef.current, userMessage];

      setCallState('thinking');
      setStatusText('Thinking');
      setTranscript('');
      setAiText('');

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: messagesRef.current }),
        });

        const data = await res.json();

        if (!data.reply) throw new Error('No reply');

        const assistantMessage: Message = {
          role: 'assistant',
          content: data.reply,
        };
        messagesRef.current = [...messagesRef.current, assistantMessage];

        setAiText(data.reply);
        speak(data.reply);
      } catch (err) {
        console.error('Groq error:', err);
        setAiText("Sorry, I had a connection issue. Please try again.");
        speak("Sorry, I had a connection issue. Please try again.");
      }
    },
    [speak]
  );

  // ─── Speech recognition ─────────────────────────────────────────────────

  const startListening = useCallback(() => {
    if (callStateRef.current === 'ended') return;

    const SR = getSpeechRecognition();
    if (!SR) return;

    // If AI is speaking, cancel it first
    window.speechSynthesis.cancel();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
    }

    const recognition = new SR();
    recognitionRef.current = recognition;

    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-NG';

    finalTranscriptRef.current = '';

    recognition.onstart = () => {
      if (callStateRef.current !== 'ended') {
        setCallState('listening');
        setStatusText('Listening');
        setTranscript('');
        setAiText('');
      }
    };

    recognition.onresult = (event: any) => {
      if (callStateRef.current === 'ended') return;

      clearTimeout(silenceTimerRef.current!);

      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (final) finalTranscriptRef.current += final;
      const displayText = finalTranscriptRef.current + interim;
      setTranscript(displayText);

      // Silence detection: 1.5s after last word
      silenceTimerRef.current = setTimeout(() => {
        if (callStateRef.current === 'listening') {
          recognition.stop();
        }
      }, 1500);
    };

    recognition.onend = () => {
      clearTimeout(silenceTimerRef.current!);
      if (callStateRef.current === 'ended') return;

      const text = finalTranscriptRef.current.trim();
      if (text) {
        sendToGroq(text);
      } else {
        // Nothing heard — restart listening
        setTimeout(() => {
          if (callStateRef.current !== 'ended' && callStateRef.current !== 'thinking' && callStateRef.current !== 'speaking') {
            startListening();
          }
        }, 500);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('SpeechRecognition error:', event.error);
      if (event.error === 'not-allowed') {
        setMicError('Microphone access was denied. Please allow mic access and try again.');
        endCall();
        return;
      }
      // For other errors, restart
      if (callStateRef.current !== 'ended' && callStateRef.current !== 'thinking' && callStateRef.current !== 'speaking') {
        setTimeout(() => startListening(), 1000);
      }
    };

    try {
      recognition.start();
    } catch (err) {
      console.error('Failed to start recognition:', err);
    }
  }, [sendToGroq]);

  // ─── Call lifecycle ─────────────────────────────────────────────────────

  const startCall = useCallback(() => {
    if (callState !== 'idle') return;

    // Unlock audio on mobile — must happen inside tap gesture
    unlockAudio();

    setCallState('ringing');
    setCallDuration(0);
    setTranscript('');
    setAiText('');
    setStatusText('Calling PathSage...');
    setMicError('');
    messagesRef.current = [];

    // Play ringtone
    ringtoneRef.current = createRingtone();

    // Connect after 2.8s
    setTimeout(() => {
      if (callStateRef.current !== 'ringing') return;

      if (ringtoneRef.current) {
        ringtoneRef.current.stop();
        ringtoneRef.current = null;
      }

      setCallState('connected');
      setStatusText('Connected');

      // AI speaks first
      const greeting =
        "Hello! I'm your PathSage mentor. What would you like help with today?";
      setAiText(greeting);
      speak(greeting);
    }, 2800);
  }, [callState, speak]);

  const endCall = useCallback(() => {
    if (callStateRef.current === 'ended') return;

    const duration = formatTime(callDuration);
    setEndedDuration(duration);

    // Stop everything
    if (ringtoneRef.current) {
      ringtoneRef.current.stop();
      ringtoneRef.current = null;
    }

    window.speechSynthesis.cancel();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }

    clearTimeout(silenceTimerRef.current!);
    clearInterval(timerRef.current!);

    setCallState('ended');
    setStatusText('');
  }, [callDuration]);

  const resetCall = useCallback(() => {
    setCallState('idle');
    setTranscript('');
    setAiText('');
    setStatusText('');
    setCallDuration(0);
    setEndedDuration('');
    setMicError('');
    messagesRef.current = [];
    finalTranscriptRef.current = '';
  }, []);

  // ─── Interrupt AI speaking ───────────────────────────────────────────────

  const handleInterrupt = useCallback(() => {
    if (callState === 'speaking') {
      window.speechSynthesis.cancel();
      startListening();
    }
  }, [callState, startListening]);

  // ─── Unsupported browser ─────────────────────────────────────────────────

  if (!isSupported) {
    return (
      <div
        style={{ background: '#080808', minHeight: '100dvh' }}
        className="flex flex-col items-center justify-center gap-6 px-8 text-center"
      >
        <div
          className="rounded-full border border-amber-700 bg-amber-950 flex items-center justify-center"
          style={{ width: 80, height: 80, fontSize: 36 }}
        >
          ⚠️
        </div>
        <div>
          <p className="text-zinc-200 text-lg font-medium mb-2" style={{ fontFamily: 'var(--font-dm-sans)' }}>
            Chrome Required
          </p>
          <p className="text-zinc-500 text-sm leading-relaxed" style={{ fontFamily: 'var(--font-dm-sans)' }}>
            PathSage Voice uses the Web Speech API, which only works in Chrome or Edge. Please open this page in Chrome.
          </p>
        </div>
      </div>
    );
  }

  // ─── Ended screen ────────────────────────────────────────────────────────

  if (callState === 'ended') {
    return (
      <div
        style={{ background: '#080808', minHeight: '100dvh' }}
        className="ended-fade flex flex-col items-center justify-center gap-8 px-8 text-center"
      >
        {micError ? (
          <>
            <div className="text-4xl">🎙️</div>
            <div>
              <p className="text-zinc-200 text-base font-medium mb-2" style={{ fontFamily: 'var(--font-dm-sans)' }}>
                Mic Access Needed
              </p>
              <p className="text-zinc-500 text-sm leading-relaxed" style={{ fontFamily: 'var(--font-dm-sans)' }}>
                {micError}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center gap-3">
              <div
                className="rounded-full border border-zinc-700"
                style={{ width: 64, height: 64, background: '#111' }}
              />
              <div>
                <p className="text-zinc-400 text-xs tracking-widest uppercase mb-1" style={{ fontFamily: 'var(--font-dm-mono)' }}>
                  Call Ended
                </p>
                <p className="text-zinc-200 text-3xl font-light" style={{ fontFamily: 'var(--font-dm-mono)' }}>
                  {endedDuration}
                </p>
              </div>
            </div>
          </>
        )}

        <button
          onClick={resetCall}
          className="rounded-full px-8 py-3 text-sm font-medium text-zinc-200 border border-zinc-700 hover:border-zinc-500 transition-colors"
          style={{ fontFamily: 'var(--font-dm-sans)', background: '#111' }}
        >
          Call again
        </button>
      </div>
    );
  }

  // ─── Idle screen ─────────────────────────────────────────────────────────

  if (callState === 'idle') {
    return (
      <div
        style={{ background: '#080808', minHeight: '100dvh' }}
        className="flex flex-col items-center justify-center gap-10 px-8"
      >
        <div className="flex flex-col items-center gap-3 fade-up">
          <Orb state="idle" />
          <div className="text-center mt-2">
            <p className="text-zinc-100 text-lg font-medium" style={{ fontFamily: 'var(--font-dm-sans)' }}>
              PathSage
            </p>
            <p className="text-emerald-500 text-xs tracking-widest uppercase mt-1" style={{ fontFamily: 'var(--font-dm-mono)' }}>
              ● Online
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 fade-up" style={{ animationDelay: '0.1s' }}>
          <p className="text-zinc-500 text-sm text-center" style={{ fontFamily: 'var(--font-dm-sans)' }}>
            Your AI academic mentor
          </p>

          {/* Green call button */}
          <button
            onClick={startCall}
            className="rounded-full flex items-center justify-center shadow-lg hover:shadow-emerald-500/20 transition-all active:scale-95"
            style={{
              width: 80,
              height: 80,
              background: 'linear-gradient(135deg, #10b981, #059669)',
              boxShadow: '0 0 30px rgba(16,185,129,0.25)',
            }}
            aria-label="Start call"
          >
            <PhoneIcon />
          </button>

          <p className="text-zinc-600 text-xs" style={{ fontFamily: 'var(--font-dm-mono)' }}>
            tap to call
          </p>
        </div>
      </div>
    );
  }

  // ─── Active call screen ─────────────────────────────────────────────────

  return (
    <div
      style={{ background: '#080808', minHeight: '100dvh' }}
      className="flex flex-col items-center justify-between py-12 px-6"
      onClick={handleInterrupt}
    >
      {/* Top — name + timer */}
      <div className="flex flex-col items-center gap-1 fade-up">
        <p className="text-zinc-200 text-base font-medium" style={{ fontFamily: 'var(--font-dm-sans)' }}>
          PathSage Mentor
        </p>
        <p
          className="text-emerald-500 text-xs"
          style={{ fontFamily: 'var(--font-dm-mono)' }}
        >
          {callState === 'ringing' ? 'Calling...' : formatTime(callDuration)}
        </p>
      </div>

      {/* Middle — orb + status */}
      <div className="flex flex-col items-center gap-6">
        <Orb state={callState} />

        <div className="flex flex-col items-center gap-3" style={{ minHeight: 60 }}>
          {/* Status label */}
          <div className="status-pulse">
            {callState === 'ringing' && (
              <p className="text-zinc-400 text-sm" style={{ fontFamily: 'var(--font-dm-sans)' }}>
                Calling AI Mentor...
              </p>
            )}
            {callState === 'listening' && (
              <p className="text-emerald-400 text-sm" style={{ fontFamily: 'var(--font-dm-sans)' }}>
                Listening
              </p>
            )}
            {callState === 'thinking' && (
              <div className="flex items-center gap-1">
                <span className="dot-1 inline-block w-1.5 h-1.5 rounded-full bg-zinc-400" />
                <span className="dot-2 inline-block w-1.5 h-1.5 rounded-full bg-zinc-400" />
                <span className="dot-3 inline-block w-1.5 h-1.5 rounded-full bg-zinc-400" />
              </div>
            )}
            {callState === 'speaking' && (
              <p className="text-emerald-300 text-sm" style={{ fontFamily: 'var(--font-dm-sans)' }}>
                Speaking
              </p>
            )}
            {callState === 'connected' && (
              <p className="text-zinc-500 text-sm" style={{ fontFamily: 'var(--font-dm-sans)' }}>
                Connected
              </p>
            )}
          </div>

          {/* Transcript / AI text */}
          {(transcript || aiText) && (
            <div
              className="text-fade text-center px-4 max-w-xs"
              style={{ maxHeight: 120, overflow: 'hidden' }}
            >
              {callState === 'listening' && transcript && (
                <p className="text-zinc-300 text-sm leading-relaxed" style={{ fontFamily: 'var(--font-dm-sans)' }}>
                  {transcript}
                </p>
              )}
              {(callState === 'speaking' || callState === 'thinking') && aiText && (
                <p className="text-zinc-400 text-sm leading-relaxed italic" style={{ fontFamily: 'var(--font-dm-sans)' }}>
                  {aiText}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom — end call button */}
      <div className="flex flex-col items-center gap-3">
        {callState === 'speaking' && (
          <p className="text-zinc-600 text-xs" style={{ fontFamily: 'var(--font-dm-mono)' }}>
            tap screen to interrupt
          </p>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            endCall();
          }}
          className="rounded-full flex items-center justify-center transition-all active:scale-95"
          style={{
            width: 72,
            height: 72,
            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
            boxShadow: '0 0 24px rgba(239,68,68,0.2)',
          }}
          aria-label="End call"
        >
          <PhoneOffIcon />
        </button>
      </div>
    </div>
  );
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function PhoneIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.8a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function PhoneOffIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.9 15M5.24 10.26A19.5 19.5 0 0 1 3.07 5.52 2 2 0 0 1 5.1 3.34h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L9.37 11" />
      <line x1="23" y1="1" x2="1" y2="23" />
    </svg>
  );
}

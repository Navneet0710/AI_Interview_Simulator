import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, AlertCircle } from 'lucide-react';

const FILLER_WORDS = ['um', 'uh', 'like', 'so', 'you know', 'actually', 'basically'];

export default function SpeechTracker({ 
  isRecording, 
  onTranscriptUpdate, 
  onMetricsUpdate,
  resetTrigger 
}) {
  const [transcript, setTranscript] = useState('');
  const [wpm, setWpm] = useState(0);
  const [fillerCount, setFillerCount] = useState(0);
  const [detectedFillers, setDetectedFillers] = useState({});
  const [recognitionError, setRecognitionError] = useState('');
  const [isListening, setIsListening] = useState(false);

  const recognitionRef = useRef(null);
  const startTimeRef = useRef(null);
  const wordCountRef = useRef(0);
  const fillerCountRef = useRef(0);
  const fillersRef = useRef({});
  // Use a ref to accumulate finalized transcript text to avoid stale closure issues
  const finalTranscriptRef = useRef('');
  const isRecordingRef = useRef(isRecording);

  // Keep isRecordingRef in sync
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // Reset transcript and metrics when resetTrigger changes (e.g. moving to next question)
  useEffect(() => {
    setTranscript('');
    setWpm(0);
    setFillerCount(0);
    setDetectedFillers({});
    wordCountRef.current = 0;
    fillerCountRef.current = 0;
    fillersRef.current = {};
    startTimeRef.current = null;
    finalTranscriptRef.current = '';
    
    // Notify parent of reset
    onTranscriptUpdate('');
    onMetricsUpdate({
      wpm: 0,
      fillerCount: 0,
      fillers: {},
      confidenceScore: 100
    });

    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        setTimeout(() => {
          if (isRecordingRef.current) {
            try {
              recognitionRef.current.start();
            } catch (e) {
              console.error('Error restarting recognition after reset:', e);
            }
          }
        }, 150);
      } catch (e) {
        console.error(e);
      }
    }
  }, [resetTrigger]);

  const analyzeSpeech = useCallback((text) => {
    if (!text || !text.trim()) {
      onMetricsUpdate({
        wpm: 0,
        fillerCount: 0,
        fillers: {},
        confidenceScore: 100
      });
      return;
    }

    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    const count = words.length;
    wordCountRef.current = count;

    // 1. Calculate WPM (Words Per Minute)
    let currentWpm = 0;
    if (startTimeRef.current && count > 0) {
      const elapsedMinutes = (Date.now() - startTimeRef.current) / 60000;
      if (elapsedMinutes > 0.05) { // Minimum 3 seconds to avoid spike
        currentWpm = Math.round(count / elapsedMinutes);
        // Constrain extreme spikes at the start
        currentWpm = Math.min(220, currentWpm);
      } else if (count > 0) {
        // Short burst estimate
        currentWpm = Math.min(220, Math.round(count / 0.05));
      }
    }
    setWpm(currentWpm);

    // 2. Count Filler Words
    let fillersFound = 0;
    const fillerMap = {};
    
    FILLER_WORDS.forEach(filler => {
      // Use regex to match exact word
      const regex = new RegExp(`\\b${filler}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) {
        fillersFound += matches.length;
        fillerMap[filler] = matches.length;
      }
    });

    fillerCountRef.current = fillersFound;
    fillersRef.current = fillerMap;
    setFillerCount(fillersFound);
    setDetectedFillers(fillerMap);

    // Calculate Confidence percentage
    // Start at 100%, subtract 5% per filler word, and floor at 50%
    const confidence = Math.max(50, 100 - (fillersFound * 5));

    // Send metrics back to parent — use the freshly computed WPM, not stale state
    onMetricsUpdate({
      wpm: currentWpm,
      fillerCount: fillersFound,
      fillers: fillerMap,
      confidenceScore: confidence
    });
  }, [onMetricsUpdate]);

  // Handle active recording state
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setRecognitionError('Web Speech API is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
      return;
    }

    if (!recognitionRef.current) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setRecognitionError('');
        if (!startTimeRef.current) {
          startTimeRef.current = Date.now();
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        // Automatically restart if we should still be recording
        if (isRecordingRef.current) {
          try {
            setTimeout(() => {
              if (isRecordingRef.current && recognitionRef.current) {
                recognitionRef.current.start();
              }
            }, 100);
          } catch (e) {
            console.error('Error restarting recognition:', e);
          }
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setRecognitionError('Microphone access denied. Please grant microphone permission.');
        } else if (event.error === 'no-speech') {
          // Silently ignore no-speech errors, they're normal
        } else if (event.error === 'aborted') {
          // Silently ignore aborted errors (happens on stop/restart)
        } else {
          setRecognitionError(`Speech recognition issue: ${event.error}`);
        }
      };

      recognition.onresult = (event) => {
        let newFinalText = '';
        let interimText = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const resultText = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            newFinalText += resultText + ' ';
          } else {
            interimText += resultText;
          }
        }

        // Append any new final text to the accumulated ref
        if (newFinalText) {
          finalTranscriptRef.current += newFinalText;
        }

        // Full display = accumulated finals + current interim
        const fullText = (finalTranscriptRef.current + interimText).trim();
        
        setTranscript(fullText);
        onTranscriptUpdate(fullText);

        // Calculate WPM and analyze filler words
        analyzeSpeech(fullText);
      };

      recognitionRef.current = recognition;
    }

    if (isRecording) {
      try {
        setRecognitionError('');
        recognitionRef.current.start();
      } catch (e) {
        // Recognition already started — this is okay
        if (e.name !== 'InvalidStateError') {
          console.error('Recognition start error:', e);
        }
      }
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Recognition already stopped
        }
        setIsListening(false);
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        try {
          recognitionRef.current.stop();
        } catch (e) {}
        recognitionRef.current = null;
      }
    };
  }, [isRecording]);

  const getPacingLabel = (wpmVal) => {
    if (wpmVal === 0) return { label: 'Waiting...', color: 'text-slate-400' };
    if (wpmVal < 90) return { label: 'Slow', color: 'text-amber-400' };
    if (wpmVal >= 90 && wpmVal <= 150) return { label: 'Optimal', color: 'text-emerald-400' };
    return { label: 'Fast', color: 'text-rose-400' };
  };

  const paceInfo = getPacingLabel(wpm);

  return (
    <div className="glass-panel p-4 flex flex-col gap-3 rounded-2xl relative overflow-hidden border border-white/10 bg-white/5 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-1">
        <div className="flex items-center gap-2">
          {isListening ? (
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          ) : (
            <span className="h-3 w-3 rounded-full bg-slate-500"></span>
          )}
          <h4 className="text-sm font-semibold text-white">Speech Analyst</h4>
        </div>
        <div className="text-xs text-white/50">Real-time feedback</div>
      </div>

      {recognitionError ? (
        <div className="flex gap-2 items-start text-rose-400 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20 text-xs">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{recognitionError}</span>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {/* WPM Counter */}
          <div className="bg-white/5 border border-white/5 p-3 rounded-xl flex flex-col items-center justify-center text-center">
            <span className="text-xs text-white/60 mb-1">Pace (WPM)</span>
            <span className={`text-xl font-bold tracking-tight ${paceInfo.color}`}>
              {wpm || 0}
            </span>
            <span className={`text-[10px] mt-0.5 font-medium ${paceInfo.color}`}>
              {paceInfo.label}
            </span>
          </div>

          {/* Filler Counter */}
          <div className="bg-white/5 border border-white/5 p-3 rounded-xl flex flex-col items-center justify-center text-center">
            <span className="text-xs text-white/60 mb-1">Filler Words</span>
            <span className="text-xl font-bold text-indigo-400">
              {fillerCount}
            </span>
            <span className="text-[10px] text-white/40 mt-0.5">
              Hesitations
            </span>
          </div>

          {/* Words Count */}
          <div className="bg-white/5 border border-white/5 p-3 rounded-xl flex flex-col items-center justify-center text-center">
            <span className="text-xs text-white/60 mb-1">Total Words</span>
            <span className="text-xl font-bold text-cyan-400">
              {wordCountRef.current}
            </span>
            <span className="text-[10px] text-white/40 mt-0.5">
              Spoken
            </span>
          </div>
        </div>
      )}

      {/* Live filler words tags */}
      {fillerCount > 0 && (
        <div className="mt-1 flex flex-wrap gap-1 items-center">
          <span className="text-[10px] text-white/55 mr-1 font-semibold">Detected:</span>
          {Object.entries(detectedFillers).map(([word, count]) => (
            <span 
              key={word} 
              className="text-[10px] bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded-full"
            >
              "{word}" &times; {count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

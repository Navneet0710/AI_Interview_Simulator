import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Volume2, VolumeX, RefreshCw } from 'lucide-react';

const VoiceSynthesizer = forwardRef(({ 
  onSpeechStart, 
  onSpeechEnd,
  defaultVoiceGender = 'female' // 'male' or 'female'
}, ref) => {
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [genderPreference, setGenderPreference] = useState(defaultVoiceGender);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const synthRef = useRef(window.speechSynthesis);
  const utteranceRef = useRef(null);

  // Initialize and load voices
  useEffect(() => {
    if (!synthRef.current) return;

    const loadVoices = () => {
      const availableVoices = synthRef.current.getVoices();
      setVoices(availableVoices);
      
      // Select preferred voice
      const preferred = selectPreferredVoice(availableVoices, genderPreference);
      setSelectedVoice(preferred);
    };

    loadVoices();
    if (synthRef.current.onvoiceschanged !== undefined) {
      synthRef.current.onvoiceschanged = loadVoices;
    }

    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  // Update selected voice when gender preference changes
  useEffect(() => {
    if (voices.length > 0) {
      const preferred = selectPreferredVoice(voices, genderPreference);
      setSelectedVoice(preferred);
    }
  }, [genderPreference, voices]);

  const selectPreferredVoice = (voiceList, gender) => {
    // English language filters
    const englishVoices = voiceList.filter(v => v.lang.startsWith('en-'));
    const candidates = englishVoices.length ? englishVoices : voiceList;

    // Standard heuristics for gendered voice names (Microsoft, Google, Apple)
    // Female voices: Zira, Hazel, Susan, Google US English (has female pitch usually), Samantha, Karen, Moira, Tessa
    // Male voices: David, Mark, George, Google UK English Male, Daniel, Ravi
    const femaleHeuristics = ['zira', 'hazel', 'samantha', 'karen', 'moira', 'tessa', 'susan', 'female', 'natural'];
    const maleHeuristics = ['david', 'mark', 'george', 'daniel', 'ravi', 'male', 'shirish', 'jarvis'];

    if (gender === 'female') {
      const match = candidates.find(v => 
        femaleHeuristics.some(h => v.name.toLowerCase().includes(h))
      );
      if (match) return match;
    } else {
      const match = candidates.find(v => 
        maleHeuristics.some(h => v.name.toLowerCase().includes(h))
      );
      if (match) return match;
    }

    // Fallback: search for any english voice
    const defaultEnglish = candidates.find(v => v.lang === 'en-US' || v.lang === 'en-GB');
    return defaultEnglish || voiceList[0] || null;
  };

  const speak = (text) => {
    if (!synthRef.current) return;

    // Stop current speech first
    cancel();

    if (isMuted) {
      // If muted, trigger start then end immediately via timeout to allow text-only flows
      if (onSpeechStart) onSpeechStart();
      setIsSpeaking(true);
      
      const estimatedDuration = Math.max(2000, text.split(' ').length * 350);
      setTimeout(() => {
        setIsSpeaking(false);
        if (onSpeechEnd) onSpeechEnd();
      }, estimatedDuration);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    
    // Set natural speed and pitch
    utterance.rate = 1.05; // Slightly faster for clean pacing
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      setIsSpeaking(true);
      if (onSpeechStart) onSpeechStart();
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      if (onSpeechEnd) onSpeechEnd();
    };

    utterance.onerror = (e) => {
      console.error('TTS error:', e);
      setIsSpeaking(false);
      if (onSpeechEnd) onSpeechEnd();
    };

    utteranceRef.current = utterance;
    synthRef.current.speak(utterance);
  };

  const cancel = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
    }
  };

  // Expose these methods to parent component via ref
  useImperativeHandle(ref, () => ({
    speak,
    cancel,
    isSpeaking
  }));

  const toggleMute = () => {
    if (isSpeaking) {
      cancel();
      onSpeechEnd();
    }
    setIsMuted(!isMuted);
  };

  return (
    <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2.5 rounded-full backdrop-blur-md">
      <button 
        onClick={toggleMute}
        className={`p-1.5 rounded-full transition-all ${isMuted ? 'bg-rose-500/20 text-rose-400' : 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'}`}
        title={isMuted ? 'Unmute AI Voice' : 'Mute AI Voice'}
      >
        {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
      
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-white/70">Voice:</span>
        <select 
          value={genderPreference}
          onChange={(e) => setGenderPreference(e.target.value)}
          className="bg-transparent text-xs text-white border-0 focus:ring-0 cursor-pointer pr-5 font-medium outline-none"
        >
          <option value="female" className="bg-slate-900 text-white">Female AI</option>
          <option value="male" className="bg-slate-900 text-white">Male AI</option>
        </select>
      </div>

      {isSpeaking && !isMuted && (
        <div className="flex gap-0.5 items-center h-3 shrink-0 ml-1">
          <div className="w-[3px] bg-indigo-400 rounded animate-[soundwave_0.8s_ease-in-out_infinite]" style={{ height: '60%' }}></div>
          <div className="w-[3px] bg-cyan-400 rounded animate-[soundwave_0.8s_ease-in-out_infinite_0.15s]" style={{ height: '100%' }}></div>
          <div className="w-[3px] bg-indigo-400 rounded animate-[soundwave_0.8s_ease-in-out_infinite_0.3s]" style={{ height: '40%' }}></div>
          <div className="w-[3px] bg-cyan-400 rounded animate-[soundwave_0.8s_ease-in-out_infinite_0.45s]" style={{ height: '80%' }}></div>
        </div>
      )}
    </div>
  );
});

export default VoiceSynthesizer;

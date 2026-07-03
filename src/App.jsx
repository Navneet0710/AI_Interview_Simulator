import React, { useState, useEffect, useRef } from 'react';
import { 
  Briefcase, 
  Settings, 
  Upload, 
  Play, 
  AlertCircle, 
  ChevronRight, 
  Sparkles, 
  User, 
  Volume2, 
  StopCircle, 
  Mic, 
  MicOff,
  CheckCircle,
  Camera,
  MessageSquare
} from 'lucide-react';
import './App.css';
import SpeechTracker from './components/SpeechTracker';
import VoiceSynthesizer from './components/VoiceSynthesizer';
import WebcamScanner from './components/WebcamScanner';
import FeedbackReport from './components/FeedbackReport';
import { generateQuestions, generateFeedbackReport, PROVIDERS } from './services/gemini';

const POPULAR_ROLES = [
  'Frontend Engineer',
  'Backend Engineer',
  'Fullstack Developer',
  'Data Scientist',
  'DevOps Engineer',
  'Mobile Developer',
  'Product Manager',
  'System Architect'
];

export default function App() {
  // App views: 'setup', 'interview', 'report'
  const [view, setView] = useState('setup');
  
  // Provider, API Key, Model & Demo State
  const [provider, setProvider] = useState(() => localStorage.getItem('ai_provider') || 'gemini');
  const [apiKey, setApiKey] = useState(() => {
    const prov = localStorage.getItem('ai_provider') || 'gemini';
    return localStorage.getItem(`api_key_${prov}`) || '';
  });
  const [modelName, setModelName] = useState(() => {
    const prov = localStorage.getItem('ai_provider') || 'gemini';
    return localStorage.getItem(`model_${prov}`) || PROVIDERS[prov]?.models[0]?.id || 'gemini-2.5-flash';
  });
  const [showKey, setShowKey] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [apiError, setApiError] = useState('');

  // Setup state
  const [role, setRole] = useState('Frontend Engineer');
  const [customRole, setCustomRole] = useState('');
  const [difficulty, setDifficulty] = useState('Mid-Level');
  const [interviewType, setInterviewType] = useState('Technical');
  const [voicePreference, setVoicePreference] = useState('female');
  
  // Resume upload states
  const [resumeText, setResumeText] = useState('');
  const [resumeFileName, setResumeFileName] = useState('');
  const [parsingResume, setParsingResume] = useState(false);
  const [resumeError, setResumeError] = useState('');

  // Device permissions popup modal states
  const [permissionModalOpen, setPermissionModalOpen] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState('idle'); // 'idle' | 'pending' | 'granted' | 'denied'
  const [permissionError, setPermissionError] = useState('');

  // Interview session state
  const [questions, setQuestions] = useState([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [interviewAnswers, setInterviewAnswers] = useState([]);
  
  // Real-time interview loop controls
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [typedAnswer, setTypedAnswer] = useState('');
  const [currentMetrics, setCurrentMetrics] = useState({
    wpm: 0,
    fillerCount: 0,
    fillers: {},
    confidenceScore: 100
  });
  
  // States to drive SpeechTracker & VoiceSynthesizer
  const [isRecording, setIsRecording] = useState(false);
  const [interviewerActive, setInterviewerActive] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [speechResetTrigger, setSpeechResetTrigger] = useState(0);
  
  // Final Feedback Report Data
  const [feedbackReport, setFeedbackReport] = useState(null);
  
  // Refs
  const synthRef = useRef(null);

  // Save API Key to local storage per provider
  useEffect(() => {
    localStorage.setItem(`api_key_${provider}`, apiKey);
  }, [apiKey, provider]);

  // Save provider and model selection
  useEffect(() => {
    localStorage.setItem('ai_provider', provider);
  }, [provider]);

  useEffect(() => {
    localStorage.setItem(`model_${provider}`, modelName);
  }, [modelName, provider]);

  // When provider changes, load that provider's saved key and default model
  const handleProviderChange = (newProvider) => {
    setProvider(newProvider);
    setApiKey(localStorage.getItem(`api_key_${newProvider}`) || '');
    const savedModel = localStorage.getItem(`model_${newProvider}`);
    setModelName(savedModel || PROVIDERS[newProvider]?.models[0]?.id || '');
    setApiError('');
  };

  // Adjust isDemo when API Key is empty
  useEffect(() => {
    if (!apiKey) {
      setIsDemo(true);
    }
  }, [apiKey]);

  // 1. PDF/TXT Resume Upload handler
  const handleResumeUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setResumeFileName(file.name);
    setParsingResume(true);
    setResumeError('');

    try {
      if (file.type === 'application/pdf') {
        if (!window.pdfjsLib) {
          throw new Error('PDF parsing library is still loading. Please try again in a moment.');
        }

        const reader = new FileReader();
        reader.onload = async function () {
          try {
            const typedarray = new Uint8Array(this.result);
            const pdf = await window.pdfjsLib.getDocument({ data: typedarray }).promise;
            let fullText = '';
            
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const textContent = await page.getTextContent();
              const pageText = textContent.items.map(item => item.str).join(' ');
              fullText += pageText + '\n';
            }
            
            if (!fullText.trim()) {
              throw new Error('No text content found in PDF.');
            }
            
            setResumeText(fullText.trim());
            setParsingResume(false);
          } catch (err) {
            console.error('PDF JS extraction error:', err);
            setResumeError('Could not extract text from PDF. You can paste your resume details below.');
            setParsingResume(false);
          }
        };
        reader.readAsArrayBuffer(file);
      } else if (file.type === 'text/plain') {
        const text = await file.text();
        setResumeText(text);
        setParsingResume(false);
      } else {
        setResumeError('Unsupported file type. Please upload a PDF or TXT file.');
        setParsingResume(false);
      }
    } catch (err) {
      console.error(err);
      setResumeError(err.message || 'Error processing file.');
      setParsingResume(false);
    }
  };

  // 2. Start Interview Session (checks permissions first)
  const startInterview = async () => {
    if (!isDemo && !apiKey) {
      setApiError('API Key is required to run live. Please enter your Gemini API Key or enable Demo Mode.');
      return;
    }

    setApiError('');
    
    // Request or check microphone & camera permissions first
    if (permissionStatus !== 'granted') {
      setPermissionModalOpen(true);
      return;
    }

    proceedToInterview();
  };

  // 3. Request permissions explicitly via popup trigger
  const requestDevicePermissions = async () => {
    setPermissionStatus('pending');
    setPermissionError('');
    try {
      // Triggers browser prompt popup
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      // Release tracks immediately
      mediaStream.getTracks().forEach(track => track.stop());
      
      setPermissionStatus('granted');
      setPermissionModalOpen(false);
      proceedToInterview();
    } catch (err) {
      console.error('Device access denied:', err);
      setPermissionStatus('denied');
      setPermissionError(err.message || 'Access denied. Please check your browser address bar locks.');
    }
  };

  // 4. Bypasses permissions and uses Simulated HUD / feeds
  const skipPermissionsAndSimulate = () => {
    setPermissionStatus('granted'); // bypass modal checks
    setPermissionModalOpen(false);
    proceedToInterview();
  };

  // 5. Query questions and switch views
  const proceedToInterview = async () => {
    setLoadingQuestions(true);
    const selectedRole = role === 'Other' ? customRole : role;

    try {
      const result = await generateQuestions(apiKey, {
        role: selectedRole,
        difficulty,
        type: interviewType,
        resumeText: resumeText || null,
        isDemo,
        modelName,
        provider
      });

      if (!result || !Array.isArray(result.questions) || result.questions.length === 0) {
        throw new Error('Could not retrieve questions. Make sure your API key is correct and valid.');
      }

      setQuestions(result.questions);
      setInterviewAnswers([]);
      setCurrentQIndex(0);
      setView('interview');
      setLoadingQuestions(false);

      // Give a tiny buffer for elements to mount, then read the first question
      setTimeout(() => {
        if (synthRef.current) {
          synthRef.current.speak(result.questions[0].text);
        }
      }, 800);

    } catch (err) {
      console.error(err);
      setApiError(`Failed to fetch questions: ${err.message}. Please verify your API Key and connection.`);
      setLoadingQuestions(false);
    }
  };

  // 6. Handle Question Speaking State (mute mic while AI talks)
  const handleAISpeakingStart = () => {
    setInterviewerActive(true);
    setIsRecording(false); // Silence mic
  };

  const handleAISpeakingEnd = () => {
    setInterviewerActive(false);
    setIsRecording(true); // Automatically open mic
  };

  // 7. Save response & advance
  const submitAnswer = () => {
    const activeQuestion = questions[currentQIndex];
    if (!activeQuestion) return;

    // Determine input method and choose the right answer source
    const hasSpoken = currentTranscript.trim().length > 0;
    const hasTyped = typedAnswer.trim().length > 0;
    
    let finalAnswer;
    let inputMethod;
    
    if (hasTyped && hasSpoken) {
      // If both typed and spoken, prefer the longer one
      if (typedAnswer.trim().length >= currentTranscript.trim().length) {
        finalAnswer = typedAnswer.trim();
        inputMethod = 'typed';
      } else {
        finalAnswer = currentTranscript.trim();
        inputMethod = 'spoken';
      }
    } else if (hasTyped) {
      finalAnswer = typedAnswer.trim();
      inputMethod = 'typed';
    } else if (hasSpoken) {
      finalAnswer = currentTranscript.trim();
      inputMethod = 'spoken';
    } else {
      finalAnswer = 'No spoken or typed response was recorded.';
      inputMethod = 'none';
    }
    
    const answerObject = {
      questionId: activeQuestion.id,
      question: activeQuestion.text,
      text: activeQuestion.text,
      answer: finalAnswer,
      inputMethod,
      wpm: inputMethod === 'spoken' ? currentMetrics.wpm : 0,
      fillerCount: inputMethod === 'spoken' ? currentMetrics.fillerCount : 0,
      confidenceScore: inputMethod === 'spoken' ? currentMetrics.confidenceScore : 100
    };

    const updatedAnswers = [...interviewAnswers, answerObject];
    setInterviewAnswers(updatedAnswers);
    
    // Clear state for next question
    setTypedAnswer('');
    setCurrentTranscript('');
    setCurrentMetrics({ wpm: 0, fillerCount: 0, fillers: {}, confidenceScore: 100 });
    
    const nextIndex = currentQIndex + 1;
    if (nextIndex < questions.length) {
      setCurrentQIndex(nextIndex);
      setSpeechResetTrigger(prev => prev + 1);
      
      // Speak next question
      setTimeout(() => {
        if (synthRef.current) {
          synthRef.current.speak(questions[nextIndex].text);
        }
      }, 500);
    } else {
      // Finished all questions! Produce report.
      setIsRecording(false);
      finishInterview(updatedAnswers);
    }
  };

  // 8. Complete Interview & Generate Detailed Analytics Report
  const finishInterview = async (completedAnswers) => {
    setLoadingReport(true);
    setView('report');
    const selectedRole = role === 'Other' ? customRole : role;

    try {
      const report = await generateFeedbackReport(apiKey, {
        role: selectedRole,
        difficulty,
        type: interviewType,
        questionsAndAnswers: completedAnswers,
        isDemo,
        modelName,
        provider
      });

      // Embed raw timeline data for chart plotting
      report.rawPacing = completedAnswers.map(ans => ans.wpm);
      report.rawFillers = completedAnswers.map(ans => ans.fillerCount);
      
      // Inject inputMethod into each question for the FeedbackReport display
      if (report.questions) {
        report.questions = report.questions.map((q, idx) => ({
          ...q,
          inputMethod: completedAnswers[idx]?.inputMethod || 'unknown'
        }));
      }

      setFeedbackReport(report);
      setLoadingReport(false);
    } catch (err) {
      console.error(err);
      // Construct a mock feedback report so user doesn't lose progress if API errors out
      const fallbackReport = {
        overallScore: 50,
        scores: { technicalDepth: 50, communication: 50, structure: 50, confidence: 50, pacing: 50 },
        summary: `The simulator successfully recorded your responses, but the ${PROVIDERS[provider]?.name || 'AI'} evaluation encountered an error (${err.message}). Showing a local scorecard evaluation. Re-run with a valid API key for accurate AI-powered feedback.`,
        communicationFeedback: 'Unable to generate detailed communication feedback due to API error. Please ensure your API key is valid and try again.',
        questions: completedAnswers.map(ans => ({
          question: ans.question,
          answer: ans.answer,
          score: (!ans.answer || ans.answer === 'No spoken or typed response was recorded.') ? 0 : 50,
          inputMethod: ans.inputMethod || 'unknown',
          strengths: (!ans.answer || ans.answer === 'No spoken or typed response was recorded.') ? [] : ['Response was recorded'],
          weaknesses: ['AI evaluation unavailable — API error occurred'],
          improvement: 'Check your internet connection and API key configuration, then run the simulation again.'
        })),
        rawPacing: completedAnswers.map(ans => ans.wpm),
        rawFillers: completedAnswers.map(ans => ans.fillerCount)
      };
      setFeedbackReport(fallbackReport);
      setLoadingReport(false);
    }
  };

  const abortInterview = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setIsRecording(false);
    setQuestions([]);
    setCurrentQIndex(0);
    setView('setup');
  };

  const getJobRoleDisplay = () => {
    return role === 'Other' ? customRole || 'Custom Role' : role;
  };

  return (
    <div className="app-container">
      {/* App Header logo block */}
      <header className="header-section no-print">
        <div className="header-logo">
          <div className="header-icon">AI</div>
          <div className="header-title-group">
            <h1>Interstellar</h1>
            <p>Interview Simulator</p>
          </div>
        </div>
        
        {view === 'interview' && (
          <button 
            onClick={abortInterview}
            className="btn-secondary"
            style={{ 
              padding: '0.5rem 1rem', 
              fontSize: '0.75rem', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.35rem', 
              color: 'rgb(244, 63, 94)',
              borderColor: 'rgba(244, 63, 94, 0.2)',
              background: 'rgba(244, 63, 94, 0.05)'
            }}
          >
            <StopCircle size={14} />
            Abort Simulation
          </button>
        )}
      </header>

      {/* VIEW: SETUP SCREEN */}
      {view === 'setup' && (
        <div className="setup-layout animate-fade-in">
          {/* Main configuration settings panel */}
          <div className="glass-panel setup-card">
            <div className="setup-card-header">
              <h2>
                <Briefcase className="text-indigo-400" size={20} />
                Configure Simulator Session
              </h2>
              <p>Select your job target and configure the simulation criteria.</p>
            </div>

            {/* Grid fields */}
            <div className="form-grid">
              {/* Job role Selection */}
              <div className="form-field">
                <label>Job Target Role</label>
                <select 
                  value={role} 
                  onChange={(e) => setRole(e.target.value)}
                  className="glass-input glass-select"
                >
                  {POPULAR_ROLES.map(r => (
                    <option key={r} value={r} className="bg-slate-900 text-white">{r}</option>
                  ))}
                  <option value="Other" className="bg-slate-900 text-white">Other / Write-in...</option>
                </select>
              </div>

              {/* Custom Job Role Write-in */}
              {role === 'Other' && (
                <div className="form-field">
                  <label>Write-in Target Role</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Senior Security Engineer"
                    value={customRole}
                    onChange={(e) => setCustomRole(e.target.value)}
                    className="glass-input"
                  />
                </div>
              )}

              {/* Experience Level */}
              <div className="form-field">
                <label>Experience Level</label>
                <select 
                  value={difficulty} 
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="glass-input glass-select"
                >
                  <option value="Junior" className="bg-slate-900 text-white">Junior (0 - 2 years)</option>
                  <option value="Mid-Level" className="bg-slate-900 text-white">Mid-Level (2 - 5 years)</option>
                  <option value="Senior" className="bg-slate-900 text-white">Senior (5 - 8 years)</option>
                  <option value="Lead" className="bg-slate-900 text-white">Lead / Staff (8+ years)</option>
                </select>
              </div>

              {/* Interview Category */}
              <div className="form-field">
                <label>Interview Focus</label>
                <select 
                  value={interviewType} 
                  onChange={(e) => setInterviewType(e.target.value)}
                  className="glass-input glass-select"
                >
                  <option value="Technical" className="bg-slate-900 text-white">Technical Deep-Dive</option>
                  <option value="System Design" className="bg-slate-900 text-white">System Design & Architecture</option>
                  <option value="Behavioral" className="bg-slate-900 text-white">Behavioral (STAR Method)</option>
                </select>
              </div>

              {/* Speech gender */}
              <div className="form-field">
                <label>Interviewer AI Voice Type</label>
                <select 
                  value={voicePreference} 
                  onChange={(e) => setVoicePreference(e.target.value)}
                  className="glass-input glass-select"
                >
                  <option value="female" className="bg-slate-900 text-white">Female Professional Voice</option>
                  <option value="male" className="bg-slate-900 text-white">Male Professional Voice</option>
                </select>
              </div>
            </div>

            {/* Resume Upload Box */}
            <div className="resume-section">
              <div className="resume-section-header">
                <label>
                  <Upload size={14} className="text-cyan-400" />
                  Tailor to Resume (PDF/TXT)
                </label>
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>Optional &bull; Runs client-side</span>
              </div>
              
              <div className="upload-dropzone">
                <input 
                  type="file" 
                  accept=".pdf,.txt"
                  onChange={handleResumeUpload}
                  className="upload-input"
                  disabled={parsingResume}
                />
                
                {parsingResume ? (
                  <div className="upload-details" style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.75)' }}>
                    <div className="w-5 h-5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" style={{ width: '1.25rem', height: '1.25rem', marginBottom: '0.5rem' }}></div>
                    <span>Parsing resume text locally...</span>
                  </div>
                ) : resumeFileName ? (
                  <div className="upload-details">
                    <CheckCircle className="text-emerald-400" size={32} style={{ marginBottom: '0.25rem' }} />
                    <h4>{resumeFileName}</h4>
                    <p style={{ color: 'rgb(16, 185, 129)' }}>Success! Tailored questions enabled.</p>
                  </div>
                ) : (
                  <div className="upload-details">
                    <Upload size={32} />
                    <h4>Drag & drop your resume file or click to browse</h4>
                    <p>Supports PDF, TXT (Maximum 4MB)</p>
                  </div>
                )}
              </div>
              
              {resumeError && (
                <div style={{ fontSize: '0.7rem', color: 'rgb(244, 63, 94)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <AlertCircle size={14} />
                  <span>{resumeError}</span>
                </div>
              )}

              {/* Paste resume text fallback box */}
              {resumeFileName && (
                <details style={{ marginTop: '0.25rem' }}>
                  <summary className="typing-fallback-summary">
                    View extracted resume text ({resumeText.length} characters)
                  </summary>
                  <textarea
                    value={resumeText}
                    onChange={(e) => setResumeText(e.target.value)}
                    className="glass-input"
                    style={{ marginTop: '0.5rem', fontFamily: 'monospace', fontSize: '0.65rem', height: '100px', resize: 'none', lineHeight: '1.5' }}
                    placeholder="Extracted text shown here..."
                  />
                </details>
              )}
            </div>

            {/* Launch simulation Button */}
            <div style={{ marginTop: '0.75rem' }}>
              <button 
                onClick={startInterview}
                disabled={loadingQuestions || (role === 'Other' && !customRole)}
                className="btn-primary"
                style={{ width: '100%', padding: '1rem' }}
              >
                {loadingQuestions ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" style={{ width: '1rem', height: '1rem' }}></div>
                    Generating AI Interview Questions...
                  </>
                ) : (
                  <>
                    <Play size={16} />
                    Initiate Simulation Session
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right sidebar column: API details and Instructions */}
          <div className="sidebar-section">
            {/* API Settings glass-panel */}
            <div className="glass-panel api-card">
              <div>
                <h3>
                  <Settings className="text-cyan-400" size={16} />
                  API Settings Configuration
                </h3>
                <p>Your key is stored only in your local browser storage.</p>
              </div>

              {/* AI Provider selector */}
              <div className="api-input-group">
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255, 255, 255, 0.75)' }}>AI Provider</label>
                <select 
                  value={provider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="glass-input glass-select"
                  style={{ fontSize: '0.8rem' }}
                >
                  {Object.entries(PROVIDERS).map(([key, prov]) => (
                    <option key={key} value={key} className="bg-slate-900 text-white">{prov.name}</option>
                  ))}
                </select>
                <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', marginTop: '0.15rem' }}>
                  {PROVIDERS[provider]?.keyHint}
                </span>
              </div>

              {/* API Key input */}
              <div className="api-input-group">
                <div className="api-input-header">
                  <label>{PROVIDERS[provider]?.name} API Key</label>
                  <button onClick={() => setShowKey(!showKey)}>
                    {showKey ? 'Hide Key' : 'Show Key'}
                  </button>
                </div>
                <input 
                  type={showKey ? 'text' : 'password'}
                  placeholder={PROVIDERS[provider]?.keyPlaceholder || 'Paste your API key'}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    if (e.target.value) setApiError('');
                  }}
                  className="glass-input"
                  style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                />
              </div>

              {/* Model selection dropdown — dynamic per provider */}
              <div className="api-input-group" style={{ marginTop: '0.5rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255, 255, 255, 0.75)' }}>Active Model</label>
                <select 
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="glass-input glass-select"
                  style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
                >
                  {PROVIDERS[provider]?.models.map(m => (
                    <option key={m.id} value={m.id} className="bg-slate-900 text-white">{m.label}</option>
                  ))}
                </select>
              </div>

              <div className="demo-toggle-row">
                <div className="demo-toggle-label">
                  <span>Enable Demo Simulation</span>
                  <small>Runs mock data without API key</small>
                </div>
                <button
                  onClick={() => setIsDemo(!isDemo)}
                  className={`toggle-switch ${isDemo ? 'active' : 'inactive'}`}
                >
                  <div className="toggle-dot"></div>
                </button>
              </div>

              {apiError && (
                <div style={{ display: 'flex', gap: '0.4rem', padding: '0.75rem', background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.15)', borderRadius: '0.5rem', color: 'rgb(244, 63, 94)', fontSize: '0.7rem' }}>
                  <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                  <span>{apiError}</span>
                </div>
              )}
            </div>

            {/* Quick guide panel */}
            <div className="glass-panel guide-card">
              <h3>
                <Sparkles className="text-indigo-400" size={16} />
                User Quick-Start Guide
              </h3>
              
              <ul className="guide-list">
                <li>Provide browser <strong>Microphone & Camera permissions</strong> when prompted in the room.</li>
                <li>The AI interviewer will read the technical questions out loud using speech synthesis.</li>
                <li>Speak your response naturally. Real-time transcriptions will record your answer.</li>
                <li>Biometric details (pace, hesitations) are tracked dynamically on your webcam screen.</li>
                <li>Click <strong>Submit Answer</strong> when finished to continue to the next mock question.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: INTERVIEW ROOM */}
      {view === 'interview' && Array.isArray(questions) && questions.length > 0 && (
        <div className="interview-layout animate-fade-in">
          {/* LEFT: AI INTERVIEWER VIEW (1/3 width) */}
          <div className="interview-left">
            {/* AI Avatar Glassmorphic card */}
            <div className="glass-panel ai-avatar-card">
              {/* Voice controls */}
              <div className="ai-card-header">
                <span className="question-badge">
                  QUESTION {currentQIndex + 1} OF {questions.length}
                </span>
                
                {/* Voice synthesiser widget */}
                <VoiceSynthesizer 
                  ref={synthRef}
                  onSpeechStart={handleAISpeakingStart}
                  onSpeechEnd={handleAISpeakingEnd}
                  defaultVoiceGender={voicePreference}
                />
              </div>

              {/* Pulsing visual AI avatar center */}
              <div className="avatar-container">
                <div className={`avatar-circle ${interviewerActive ? 'avatar-pulsing' : ''}`}>
                  <div className="avatar-circle-inner">
                    <User size={36} className={interviewerActive ? 'animate-pulse' : ''} />
                    
                    {/* Concentric glowing shapes when speaking */}
                    {interviewerActive && (
                      <div className="absolute inset-0 bg-cyan-400/5 backdrop-blur-xs animate-pulse"></div>
                    )}
                  </div>
                </div>

                <h3 className="ai-status-label">AI Technical Evaluator</h3>
                <p className="ai-status-sub">
                  {interviewerActive ? (
                    <span style={{ color: 'rgb(165, 180, 252)', fontWeight: '700' }} className="animate-pulse">AI Speaking Question...</span>
                  ) : isRecording ? (
                    <span style={{ color: 'rgb(6, 182, 212)', fontWeight: '700' }}>Listening to response...</span>
                  ) : (
                    <span>Waiting for recording...</span>
                  )}
                </p>
              </div>

              {/* Text display of the active question */}
              <div className="question-box">
                <p>
                  "{questions[currentQIndex]?.text || ''}"
                </p>
              </div>
            </div>
            
            {/* Real-time stats speech analyzer widget */}
            <SpeechTracker 
              isRecording={isRecording}
              onTranscriptUpdate={setCurrentTranscript}
              onMetricsUpdate={setCurrentMetrics}
              resetTrigger={speechResetTrigger}
            />
          </div>

          {/* RIGHT: WEBCAM SCREEN & TRANSCRIPTION (2/3 width) */}
          <div className="interview-right">
            {/* Live Camera display container */}
            <WebcamScanner 
              isInterviewActive={true}
              userSpeaking={currentTranscript.length > 0 && isRecording}
            />

            {/* Transcript & Response Area */}
            <div className="glass-panel response-card">
              <div className="card-header">
                <span className="card-header-title">
                  <MessageSquare size={14} className="text-cyan-400" />
                  Your Response Log
                </span>
                <span className="card-header-sub">Mic transcription logs in real-time</span>
              </div>

              {/* Live scrolling transcription text box */}
              <div className="transcript-box">
                {currentTranscript ? (
                  <p style={{ selectText: 'true' }}>
                    {currentTranscript}
                    {isRecording && <span className="inline-block w-1.5 h-3.5 bg-cyan-400 animate-pulse ml-0.5 align-middle" style={{ width: '6px', height: '14px', display: 'inline-block', backgroundColor: 'rgb(6, 182, 212)' }}></span>}
                  </p>
                ) : (
                  <p style={{ color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
                    Start speaking when the AI stops talking to see your transcript appear here...
                  </p>
                )}
              </div>

              {/* Typing fallback toggle */}
              <details style={{ width: '100%' }}>
                <summary className="typing-fallback-summary">
                  Prefer typing? Enter text reply manually
                </summary>
                <textarea
                  value={typedAnswer}
                  onChange={(e) => setTypedAnswer(e.target.value)}
                  className="glass-input"
                  style={{ marginTop: '0.5rem', height: '80px', resize: 'none', lineHeight: '1.5', fontSize: '0.75rem' }}
                  placeholder="Type your technical response here if microphone is offline..."
                />
              </details>

              {/* Bottom Controls toolbar */}
              <div className="controls-row">
                {/* Microphone trigger toggle */}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => setIsRecording(!isRecording)}
                    disabled={interviewerActive}
                    className={`mic-toggle-btn ${interviewerActive ? 'disabled' : isRecording ? 'recording' : 'active-idle'}`}
                    title={isRecording ? 'Mute Mic' : 'Unmute Mic'}
                  >
                    {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                    {isRecording ? 'Mute' : 'Record'}
                  </button>
                  
                  <button 
                    onClick={() => {
                      if (synthRef.current && questions[currentQIndex]) {
                        synthRef.current.speak(questions[currentQIndex].text);
                      }
                    }}
                    className="round-control-btn"
                    title="Replay Question Audio"
                  >
                    <Volume2 size={16} />
                  </button>
                </div>

                {/* Submit button */}
                <button
                  onClick={submitAnswer}
                  className="btn-primary"
                  style={{ padding: '0.75rem 1.5rem', fontSize: '0.75rem' }}
                >
                  {currentQIndex === questions.length - 1 ? 'Finish & Generate Report' : 'Submit Answer & Continue'}
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: FEEDBACK REPORT */}
      {view === 'report' && (
        <div style={{ width: '100%', flex: 1 }}>
          {loadingReport ? (
            <div className="glass-panel animate-fade-in" style={{ padding: '2.5rem', textAlign: 'center', maxWidth: '450px', margin: '3rem auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <div className="relative" style={{ width: '4rem', height: '4rem', position: 'relative' }}>
                <div className="absolute" style={{ inset: 0, borderRadius: '50%', border: '4px solid rgba(99, 102, 241, 0.2)', borderTopColor: 'rgb(99, 102, 241)', animation: 'spin 1s linear infinite' }}></div>
                <div className="absolute" style={{ inset: '8px', borderRadius: '50%', border: '4px solid rgba(6, 182, 212, 0.2)', borderBottomColor: 'rgb(6, 182, 212)', animation: 'spin 1.5s linear infinite reverse' }}></div>
              </div>
              <h3 style={{ fontSize: '1.1rem', color: 'white' }}>Analyzing Simulator Performance</h3>
              <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', lineHeight: '1.5' }}>
                Evaluating transcript responses, analyzing voice pacing data, and compiling feedback report from Gemini...
              </p>
              <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden', marginTop: '0.5rem' }}>
                <div style={{ height: '100%', background: 'linear-gradient(to right, rgb(99, 102, 241), rgb(6, 182, 212))', width: '80%', animation: 'soundwave 2.5s ease-in-out infinite' }}></div>
              </div>
            </div>
          ) : (
            feedbackReport && (
              <FeedbackReport 
                reportData={feedbackReport}
                onRestart={abortInterview}
                role={getJobRoleDisplay()}
                difficulty={difficulty}
                type={interviewType}
              />
            )
          )}
        </div>
      )}

      {/* POPUP: MICROPHONE & CAMERA AUTHORIZATION MODAL (GORGEOUS GLASSMORPHISM) */}
      {permissionModalOpen && (
        <div className="modal-backdrop">
          <div className="glass-panel modal-content animate-slide-up">
            <div className="modal-header-glow">
              <Camera size={24} />
            </div>
            
            <h3>Authorization Required</h3>
            
            <p>
              To simulate a realistic face-to-face interview, this application requests access to your camera for biometric tracking and microphone for speech transcriptions.
            </p>

            <div className="permissions-checklist">
              <div className={`permission-check-item ${permissionStatus === 'granted' ? 'granted' : ''}`}>
                <div className="permission-check-icon">
                  <Mic size={14} />
                </div>
                <div className="permission-check-text">
                  <span>Microphone Access</span>
                  <small>Needed for real-time speech-to-text</small>
                </div>
              </div>

              <div className={`permission-check-item ${permissionStatus === 'granted' ? 'granted' : ''}`}>
                <div className="permission-check-icon">
                  <Camera size={14} />
                </div>
                <div className="permission-check-text">
                  <span>Camera Access</span>
                  <small>Needed for facial scanning and stress HUD</small>
                </div>
              </div>
            </div>

            {permissionStatus === 'denied' && (
              <div className="permission-troubleshoot">
                <strong>Trouble connecting devices?</strong>
                It looks like permissions were denied. Please click the lock icon 🔒 next to the URL in your browser address bar and change both Camera and Microphone to "Allow", then try again.
              </div>
            )}

            <div className="modal-actions">
              <button 
                onClick={requestDevicePermissions}
                disabled={permissionStatus === 'pending'}
                className="btn-primary"
                style={{ width: '100%', padding: '0.85rem' }}
              >
                {permissionStatus === 'pending' ? 'Connecting...' : 'Authorize Camera & Mic'}
              </button>
              
              <button 
                onClick={skipPermissionsAndSimulate}
                className="btn-secondary"
                style={{ width: '100%', padding: '0.85rem', fontSize: '0.75rem' }}
              >
                Skip & Use Simulation Fallback
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

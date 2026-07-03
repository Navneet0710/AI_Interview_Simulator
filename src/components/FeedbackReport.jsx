import React, { useState } from 'react';
import { 
  Chart as ChartJS, 
  RadialLinearScale, 
  PointElement, 
  LineElement, 
  Filler, 
  Tooltip, 
  Legend, 
  ArcElement, 
  CategoryScale, 
  LinearScale 
} from 'chart.js';
import { Radar, Line, Doughnut } from 'react-chartjs-2';
import { 
  Award, 
  ChevronDown, 
  ChevronUp, 
  ArrowLeft, 
  MessageSquare, 
  ThumbsUp, 
  AlertTriangle, 
  TrendingUp, 
  Activity, 
  Printer 
} from 'lucide-react';

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  ArcElement,
  CategoryScale,
  LinearScale
);

export default function FeedbackReport({ reportData, onRestart, role, difficulty, type }) {
  const [expandedQuestion, setExpandedQuestion] = useState(0);

  const { overallScore, scores, summary, communicationFeedback, questions } = reportData;

  // 1. Doughnut Chart Configuration (Overall Score)
  const doughnutData = {
    datasets: [
      {
        data: [overallScore, 100 - overallScore],
        backgroundColor: ['rgba(6, 182, 212, 0.85)', 'rgba(255, 255, 255, 0.05)'],
        borderWidth: 0,
        circumference: 270,
        rotation: 225,
        cutout: '80%'
      }
    ]
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: { enabled: false },
      legend: { display: false }
    }
  };

  // 2. Radar Chart Configuration (Skill Metrics)
  const radarData = {
    labels: ['Technical Depth', 'Communication', 'Structure', 'Confidence', 'Pacing'],
    datasets: [
      {
        label: 'Candidate Score',
        data: [
          scores.technicalDepth,
          scores.communication,
          scores.structure,
          scores.confidence,
          scores.pacing
        ],
        backgroundColor: 'rgba(99, 102, 241, 0.2)',
        borderColor: 'rgba(99, 102, 241, 0.8)',
        borderWidth: 2,
        pointBackgroundColor: 'rgba(6, 182, 212, 1)',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: 'rgba(99, 102, 241, 1)'
      }
    ]
  };

  const radarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        angleLines: { color: 'rgba(255, 255, 255, 0.08)' },
        grid: { color: 'rgba(255, 255, 255, 0.08)' },
        pointLabels: {
          color: 'rgba(255, 255, 255, 0.75)',
          font: { family: 'Outfit, sans-serif', size: 11, weight: '500' }
        },
        ticks: {
          display: false,
          stepSize: 20
        },
        min: 0,
        max: 100
      }
    },
    plugins: {
      legend: { display: false }
    }
  };

  // 3. Line Chart Configuration (Pacing over time)
  const questionLabels = questions.map((_, idx) => `Q${idx + 1}`);
  
  // Retrieve pacing metrics from actual questions
  const pacingValues = questions.map((q, idx) => {
    const inputMethod = q.inputMethod || 'unknown';
    if (inputMethod === 'spoken') {
      return reportData.rawPacing?.[idx] || 0;
    }
    return 0; // No WPM data for typed/no responses
  });

  const lineData = {
    labels: questionLabels,
    datasets: [
      {
        label: 'Speaking Pace (WPM)',
        data: pacingValues,
        fill: true,
        borderColor: 'rgba(6, 182, 212, 0.85)',
        backgroundColor: 'rgba(6, 182, 212, 0.1)',
        tension: 0.35,
        borderWidth: 2.5,
        pointRadius: 4,
        pointBackgroundColor: 'rgba(99, 102, 241, 1)'
      }
    ]
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: 'rgba(255, 255, 255, 0.5)' },
        min: 60,
        max: 200,
        title: {
          display: true,
          text: 'Words Per Minute',
          color: 'rgba(255, 255, 255, 0.4)',
          font: { size: 10 }
        }
      },
      x: {
        grid: { display: false },
        ticks: { color: 'rgba(255, 255, 255, 0.5)' }
      }
    },
    plugins: {
      legend: { display: false }
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="report-container print:p-0 print:bg-white print:text-black">
      {/* Header section */}
      <div className="report-header print:border-black/20">
        <div>
          <button 
            onClick={onRestart}
            className="btn-secondary"
            style={{ 
              padding: '0.4rem 0.8rem', 
              fontSize: '0.7rem', 
              marginBottom: '0.75rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              borderRadius: '0.5rem'
            }}
          >
            <ArrowLeft size={12} />
            Start New Session
          </button>
          
          <h2 style={{ fontSize: '1.6rem', color: 'white' }} className="print:text-black">
            Interview Analytics & Feedback
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.5)', marginTop: '0.25rem' }} className="print:text-black/60">
            Target Role: <strong style={{ color: 'white' }} className="print:text-black">{difficulty} {role}</strong> ({type} Evaluation)
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem' }} className="print:hidden">
          <button 
            onClick={handlePrint}
            className="btn-secondary"
            style={{ padding: '0.65rem 1.25rem', fontSize: '0.75rem' }}
          >
            <Printer size={14} />
            Export Report
          </button>
          <button 
            onClick={onRestart}
            className="btn-primary"
            style={{ padding: '0.65rem 1.25rem', fontSize: '0.75rem' }}
          >
            Try Again
          </button>
        </div>
      </div>

      {/* Overview Dashboard Row */}
      <div className="overview-row">
        {/* Overall Score Doughnut Gauge */}
        <div className="glass-panel score-card print:bg-transparent print:border-black/20">
          <span style={{ fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '0.5rem' }} className="print:text-black/55">Overall Performance Score</span>
          <div className="relative" style={{ width: '130px', height: '130px', display: 'flex', alignItems: 'center', justifycontent: 'center', position: 'relative' }}>
            <Doughnut data={doughnutData} options={doughnutOptions} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: '10px' }}>
              <span style={{ fontSize: '2.2rem', fontWeight: '800', color: 'white' }} className="print:text-black">{overallScore}</span>
              <span style={{ fontSize: '0.55rem', color: 'rgb(6, 182, 212)', fontWeight: '700', letterSpacing: '0.1em', uppercase: 'true' }}>SCORE</span>
            </div>
          </div>
          <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.75rem' }} className="print:text-black/50">Evaluation powered by Gemini AI</p>
        </div>

        {/* Skill Metrics Radar */}
        <div className="glass-panel radar-card print:bg-transparent print:border-black/20">
          <span style={{ fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '0.75rem', textAlign: 'center' }} className="print:text-black/55">Core Skill Dimensions</span>
          <div className="relative" style={{ flex: 1, height: '140px' }}>
            <Radar data={radarData} options={radarOptions} />
          </div>
        </div>

        {/* Executive summary block */}
        <div className="glass-panel summary-card print:bg-transparent print:border-black/20">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.05em', color: 'rgb(6, 182, 212)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.35rem' }} className="print:text-cyan-600">
              <Award size={14} />
              Interviewer Summary
            </span>
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', lineHeight: '1.5' }} className="print:text-black/85">
              {summary}
            </p>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '1rem', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)' }} className="print:border-black/10 print:text-black/60">
            <span>Interview Length: ~10 mins</span>
            <span>Questions: {questions.length} / 5</span>
          </div>
        </div>
      </div>

      {/* Pacing and Communication Section */}
      <div className="details-row">
        {/* Pacing Timeline */}
        <div className="glass-panel pace-chart-card print:bg-transparent print:border-black/20">
          <span style={{ fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }} className="print:text-black/55">
            <Activity size={14} className="text-cyan-400" />
            Speaking Pace Timeline (WPM)
          </span>
          <div style={{ flex: 1, minHeight: '140px', position: 'relative' }}>
            <Line data={lineData} options={lineOptions} />
          </div>
        </div>

        {/* Communication feedback text */}
        <div className="glass-panel presence-card print:bg-transparent print:border-black/20">
          <span style={{ fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.05em', color: 'rgb(99, 102, 241)', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }} className="print:text-indigo-600">
            <MessageSquare size={14} />
            Communication & Presence
          </span>
          <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.75)', lineHeight: '1.5' }} className="print:text-black/80">
            {communicationFeedback}
          </p>
        </div>
      </div>

      {/* Detailed Question Review */}
      <div className="questions-list">
        <h3 style={{ fontSize: '1.1rem', color: 'white', marginTop: '0.5rem', marginBottom: '0.25rem' }} className="print:text-black">
          Question-by-Question Breakdown
        </h3>
        
        {questions.map((q, idx) => {
          const isExpanded = expandedQuestion === idx;
          const scoreColor = q.score >= 85 ? 'text-emerald-400' : q.score >= 70 ? 'text-amber-400' : 'text-rose-400';
          const scoreStyle = q.score >= 85 
            ? { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.2)', color: 'rgb(16, 185, 129)' }
            : q.score >= 70 
            ? { backgroundColor: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.2)', color: 'rgb(245, 158, 11)' }
            : { backgroundColor: 'rgba(244, 63, 94, 0.1)', borderColor: 'rgba(244, 63, 94, 0.2)', color: 'rgb(244, 63, 94)' };

          return (
            <div 
              key={idx}
              className="glass-panel question-item print:bg-transparent print:border-black/10"
              style={{ overflow: 'hidden', borderColor: isExpanded ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255,255,255,0.06)' }}
            >
              {/* Question Header Accordion */}
              <button
                onClick={() => setExpandedQuestion(isExpanded ? null : idx)}
                className="question-trigger print:text-black"
              >
                <div className="question-trigger-left">
                  <span className="question-trigger-index print:border-black/20 print:text-black">
                    {idx + 1}
                  </span>
                    <div className="question-trigger-text">
                    <h4>{q.question}</h4>
                    <p>
                      {(() => {
                        const inputMethod = q.inputMethod || 'unknown';
                        const pacing = reportData.rawPacing?.[idx] || 0;
                        const fillers = reportData.rawFillers?.[idx] || 0;
                        if (inputMethod === 'typed') {
                          return <>Input: <strong style={{color: 'rgb(165, 180, 252)'}}>Typed Response</strong> &bull; Filler Words: 0</>;
                        } else if (inputMethod === 'none' || (!q.answer || q.answer === 'No spoken or typed response was recorded.')) {
                          return <>Input: <strong style={{color: 'rgb(244, 63, 94)'}}>No Response</strong></>;
                        } else {
                          return <>Pacing: {pacing > 0 ? `${pacing} WPM` : 'N/A'} &bull; Filler Words: {fillers}</>;
                        }
                      })()}
                    </p>
                    </div>
                </div>
                
                <div className="question-trigger-right">
                  <div 
                    className="question-score-badge"
                    style={{ ...scoreStyle, border: '1px solid' }}
                  >
                    {q.score}%
                  </div>
                  {isExpanded ? <ChevronUp size={16} style={{ color: 'rgba(255,255,255,0.4)' }} /> : <ChevronDown size={16} style={{ color: 'rgba(255,255,255,0.4)' }} />}
                </div>
              </button>

              {/* Accordion Content */}
              {isExpanded && (
                <div className="question-details print:border-black/10">
                  {/* Full transcript answer */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: '700', letterSpacing: '0.05em', color: 'rgb(6, 182, 212)', textTransform: 'uppercase' }} className="print:text-cyan-600">Your Response Transcript:</span>
                    <blockquote style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', fontStyle: 'italic', borderLeft: '2px solid rgba(99,102,241,0.4)', paddingLeft: '0.75rem', lineHeight: '1.5' }} className="print:text-black/75">
                      "{q.answer}"
                    </blockquote>
                  </div>

                  {/* Strengths & Weaknesses */}
                  <div className="strengths-gaps-grid">
                    {/* Strengths */}
                    {q.strengths && q.strengths.length > 0 && (
                    <div className="strengths-box">
                      <span style={{ fontSize: '0.65rem', fontWeight: '700', letterSpacing: '0.05em', color: 'rgb(16, 185, 129)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <ThumbsUp size={12} />
                        Strengths
                      </span>
                      <ul>
                        {q.strengths.map((str, sIdx) => (
                          <li key={sIdx}>
                            <span>&bull;</span>
                            {str}
                          </li>
                        ))}
                      </ul>
                    </div>
                    )}

                    {/* Weaknesses */}
                    <div className="gaps-box">
                      <span style={{ fontSize: '0.65rem', fontWeight: '700', letterSpacing: '0.05em', color: 'rgb(244, 63, 94)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <AlertTriangle size={12} />
                        Gaps & Weaknesses
                      </span>
                      <ul>
                        {q.weaknesses.map((weak, wIdx) => (
                          <li key={wIdx}>
                            <span>&bull;</span>
                            {weak}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Actionable Advice */}
                  <div className="advice-box">
                    <span style={{ fontSize: '0.65rem', fontWeight: '700', letterSpacing: '0.05em', color: 'rgb(165, 180, 252)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <TrendingUp size={12} />
                      Actionable Improvement Advice
                    </span>
                    <p>{q.improvement}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

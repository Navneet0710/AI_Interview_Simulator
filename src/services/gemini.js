/**
 * Multi-Provider AI Service for Interview Simulator
 * Supports: Google Gemini, OpenRouter, Mistral AI
 */

// ==========================================
// Provider Configurations (exported for UI)
// ==========================================

export const PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Stable Default)' },
      { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (Frontier Fast)' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Stable Reasoning)' },
      { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro (Frontier Reasoning)' },
    ],
    keyPlaceholder: 'Paste your AIzaSy... key',
    keyHint: 'Get free key at ai.google.dev',
  },
  openrouter: {
    name: 'OpenRouter',
    models: [
      { id: 'deepseek/deepseek-chat-v4-0324:free', label: 'DeepSeek V4 Chat (Free)' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (Free)' },
      { id: 'qwen/qwen3-coder:free', label: 'Qwen3 Coder (Free)' },
      { id: 'google/gemma-4-12b-it:free', label: 'Gemma 4 12B (Free)' },
    ],
    keyPlaceholder: 'Paste your sk-or-... key',
    keyHint: 'Get free key at openrouter.ai (no credit card)',
  },
  mistral: {
    name: 'Mistral AI',
    models: [
      { id: 'mistral-small-latest', label: 'Mistral Small (Fast)' },
      { id: 'mistral-large-latest', label: 'Mistral Large (Best Quality)' },
      { id: 'codestral-latest', label: 'Codestral (Code Specialist)' },
    ],
    keyPlaceholder: 'Paste your Mistral API key',
    keyHint: 'Get free key at console.mistral.ai (1B tokens/mo)',
  }
};

// ==========================================
// Utility
// ==========================================

/**
 * Clean markdown code block wraps from LLM string output before parsing
 */
function cleanJsonString(str) {
  let cleaned = str.trim();
  // Remove starting ```json or ```
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
  // Remove ending ```
  cleaned = cleaned.replace(/\s*```$/, '');
  return cleaned.trim();
}

// ==========================================
// Provider-Specific API Callers
// ==========================================

/**
 * Calls the Google Gemini API (native format).
 */
async function callGemini(apiKey, prompt, jsonMode, modelName) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      ...(jsonMode ? { responseMimeType: 'application/json' } : {})
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Gemini API Error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text;
}

/**
 * Calls an OpenAI-compatible API (works for OpenRouter + Mistral).
 */
async function callOpenAICompatible(baseUrl, apiKey, prompt, jsonMode, modelName, extraHeaders = {}) {
  const payload = {
    model: modelName,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {})
  };

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...extraHeaders
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const msg = errData.error?.message || errData.detail || `API Error: ${response.status}`;
    throw new Error(msg);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content;
}

// ==========================================
// Universal LLM Router
// ==========================================

/**
 * Routes the prompt to the correct provider's API.
 */
async function callLLM(provider, apiKey, prompt, jsonMode = false, modelName) {
  let text;

  try {
    switch (provider) {
      case 'gemini':
        text = await callGemini(apiKey, prompt, jsonMode, modelName);
        break;
      case 'openrouter':
        text = await callOpenAICompatible(
          'https://openrouter.ai/api/v1/chat/completions',
          apiKey, prompt, jsonMode, modelName,
          { 'HTTP-Referer': window.location.origin, 'X-Title': 'AI Interview Simulator' }
        );
        break;
      case 'mistral':
        text = await callOpenAICompatible(
          'https://api.mistral.ai/v1/chat/completions',
          apiKey, prompt, jsonMode, modelName
        );
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    if (!text) throw new Error('Empty response from AI provider');

    if (jsonMode) {
      const cleaned = cleanJsonString(text);
      return JSON.parse(cleaned);
    }

    return text;
  } catch (error) {
    console.error(`[${provider}] API call failed:`, error);
    throw error;
  }
}

// ==========================================
// Public API Functions
// ==========================================

/**
 * Generates 5 interview questions based on job description, experience, type, and optional resume.
 */
export async function generateQuestions(apiKey, { role, difficulty, type, resumeText, isDemo, modelName, provider = 'gemini' }) {
  if (isDemo) {
    return getMockQuestions(role, difficulty, type);
  }

  const prompt = `You are an expert technical interviewer.
Generate exactly 5 interview questions for a candidate applying for:
Job Role: ${role}
Experience Level: ${difficulty}
Interview Type: ${type}
${resumeText ? `Candidate Resume Content:\n"""\n${resumeText}\n"""\n` : ''}

Make the questions challenging, realistic, and tailored to the job role and experience level. 
${resumeText ? 'Ensure at least 2 questions are directly related to the candidate\'s actual projects, technologies, and experience listed in their resume.' : ''}

You MUST respond with a JSON object matching this structure:
{
  "questions": [
    {
      "id": 1,
      "text": "The text of the question"
    },
    ...
  ]
}
Do not include any other text, markdown formatting (outside the json block), or wrappers. Return ONLY the JSON object.`;

  return callLLM(provider, apiKey, prompt, true, modelName);
}

/**
 * Evaluates candidate responses and creates a detailed performance report.
 */
export async function generateFeedbackReport(apiKey, { role, difficulty, type, questionsAndAnswers, isDemo, modelName, provider = 'gemini' }) {
  if (isDemo) {
    return getMockReport(role, difficulty, type, questionsAndAnswers);
  }

  const prompt = `You are an expert technical interviewer and communication coach.
Evaluate the candidate's performance in the following interview:
Role: ${role}
Difficulty Level: ${difficulty}
Interview Type: ${type}

Here is the transcript of the questions and the candidate's answers, along with client-side speech metrics (such as words-per-minute pacing and hesitation count):
${JSON.stringify(questionsAndAnswers, null, 2)}

Analyze the candidate's answers for technical depth, structural clarity, communication quality, pace (optimal is 110-150 WPM), and confidence (affected by hesitations like filler words "um", "uh", "like", "so").

Generate a comprehensive feedback report.
You MUST respond with a JSON object matching this structure:
{
  "overallScore": 85, 
  "scores": {
    "technicalDepth": 80,
    "communication": 90,
    "structure": 85,
    "confidence": 75,
    "pacing": 95
  },
  "summary": "Overall summary paragraph analyzing candidate's performance...",
  "communicationFeedback": "Detailed feedback on communication style, filler words usage, and speech pacing...",
  "questions": [
    {
      "question": "Question text...",
      "answer": "Candidate's response...",
      "score": 80, 
      "strengths": ["list of specific strengths in this answer"],
      "weaknesses": ["list of technical gaps or areas they missed"],
      "improvement": "Specific actionable advice on how to improve this response..."
    },
    ...
  ]
}
Do not include any other text. Return ONLY the JSON object.`;

  return callLLM(provider, apiKey, prompt, true, modelName);
}

// ==========================================
// Mock Data Generators for Demo Mode
// ==========================================

function getMockQuestions(role, difficulty, type) {
  const genericQuestions = {
    Technical: [
      `Can you explain the differences between React's Virtual DOM and the real DOM, and how fibers optimize rendering?`,
      `How would you optimize a slow React application that suffers from excessive re-rendering?`,
      `What are React Hooks rules, and how does React internally track state hook indexes between renders?`,
      `Explain the difference between useEffect, useLayoutEffect, and useInsertionEffect. When would you use each?`,
      `How does Javascript handle asynchronous operations? Explain the Event Loop, microtasks, and macrotasks.`
    ],
    "System Design": [
      `How would you design a real-time collaborative document editor like Google Docs?`,
      `Design a scalable notifications system that can handle 10 million alerts per day with push, email, and SMS.`,
      `How would you design a rate limiting system for a public API gateway? What algorithms would you consider?`,
      `Describe how you would design a global video streaming platform like Netflix. How do you handle low latency CDN delivery?`,
      `Design an image upload and processing service where users upload photos, and the system crops, scales, and watermarks them.`
    ],
    Behavioral: [
      `Tell me about a time you had a significant technical disagreement with a teammate. How did you resolve it?`,
      `Describe a situation where you had to ship a feature under extremely tight deadlines. What tradeoffs did you make?`,
      `Tell me about a project that failed or didn't meet expectations. What did you learn and what would you do differently?`,
      `How do you keep your technical skills sharp and stay up-to-date with fast-moving web ecosystems?`,
      `Describe a time you had to take ownership of a critical bug in production. Walk me through your steps to diagnose and fix it.`
    ]
  };

  const selectedCategory = genericQuestions[type] || genericQuestions['Technical'];
  
  return {
    questions: selectedCategory.map((text, idx) => ({
      id: idx + 1,
      text: `${text} (Simulated for ${difficulty} ${role})`
    }))
  };
}

function getMockReport(role, difficulty, type, questionsAndAnswers) {
  const wpmList = questionsAndAnswers.map(q => q.wpm).filter(w => w > 0);
  const avgWpm = wpmList.length ? Math.round(wpmList.reduce((a, b) => a + b, 0) / wpmList.length) : 130;
  const totalFillers = questionsAndAnswers.reduce((sum, q) => sum + (q.fillerCount || 0), 0);
  
  const paceScore = avgWpm >= 110 && avgWpm <= 150 ? 95 : avgWpm > 150 ? 75 : 65;
  const confidenceScore = Math.max(50, 100 - (totalFillers * 5));
  const technicalDepth = 78 + Math.floor(Math.random() * 12);
  const communication = Math.max(60, Math.round((paceScore + confidenceScore) / 2));
  const structure = 80 + Math.floor(Math.random() * 10);
  const overallScore = Math.round((technicalDepth * 0.4) + (communication * 0.3) + (structure * 0.2) + (paceScore * 0.1));

  return {
    overallScore,
    scores: {
      technicalDepth,
      communication,
      structure,
      confidence: confidenceScore,
      pacing: paceScore
    },
    summary: `The candidate showed a solid performance interviewing for the ${difficulty} ${role} role (${type}). They demonstrated clear domain understanding, though some technical explanations could be structured more tightly. Communication was generally strong with a steady talking pace of ${avgWpm} WPM.`,
    communicationFeedback: `Your average speaking pace was ${avgWpm} WPM, which is ${avgWpm >= 110 && avgWpm <= 150 ? 'right in the sweet spot for professional communication (110-150 WPM).' : avgWpm > 150 ? 'a bit fast. Try to pause for emphasis to help the interviewer follow.' : 'a bit slow. Try to speak with slightly more energy.'} You used a total of ${totalFillers} filler words (like 'um', 'uh', 'like') throughout the session. Working on minimizing these hesitations will significantly improve your overall executive presence.`,
    questions: questionsAndAnswers.map((q, idx) => {
      const qText = q.text || `Question ${idx + 1}`;
      const aText = q.answer || `No response provided.`;
      
      return {
        question: qText,
        answer: aText,
        score: Math.min(100, Math.max(40, overallScore + Math.floor(Math.random() * 15) - 7)),
        strengths: [
          "Address the core problem directly",
          "Maintained a professional tone",
          "Used key industry terminology correctly"
        ],
        weaknesses: [
          "Could go deeper into optimization trade-offs",
          "Structure could benefit from using the STAR method"
        ],
        improvement: `For questions like "${qText.substring(0, 40)}...", structure your response by first giving a high-level summary, then detailing your approach, and finishing with the trade-offs or alternatives.`
      };
    })
  };
}

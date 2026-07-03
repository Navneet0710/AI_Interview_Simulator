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

  const prompt = `You are an expert technical interviewer and communication coach. Your job is to give HONEST, CRITICAL feedback.
Evaluate the candidate's performance in the following interview:
Role: ${role}
Difficulty Level: ${difficulty}
Interview Type: ${type}

Here is the transcript of the questions and the candidate's answers, along with client-side speech metrics and input method:
${JSON.stringify(questionsAndAnswers, null, 2)}

CRITICAL SCORING RULES — you MUST follow these strictly:
1. If the candidate's answer is empty, blank, "No spoken or typed response was recorded.", or contains no meaningful content, the score for that question MUST be between 0 and 5.
2. If the answer is extremely short (under 15 words), vague, or completely irrelevant to the question, the score MUST be between 5 and 25.
3. If the answer shows some understanding but lacks depth or misses key points, score between 25 and 55.
4. If the answer is decent but could be improved, score between 55 and 75.
5. If the answer is good with solid technical depth, score between 75 and 90.
6. Only score above 90 for truly exceptional, comprehensive answers that demonstrate deep expertise.
7. The overallScore should be a weighted average reflecting ALL individual question scores. If multiple questions were unanswered, the overall score MUST be very low.
8. If the inputMethod is "typed", ignore pacing/WPM metrics for that answer since it was typed, not spoken.

Analyze each answer individually for: technical accuracy, relevance to the specific question asked, depth of explanation, structural clarity, and use of specific examples or terminology.

For strengths and weaknesses, be SPECIFIC to each answer — do NOT use generic phrases like "maintained professional tone" or "addressed the core problem" unless the answer genuinely does that. Each question must have DIFFERENT, SPECIFIC feedback.

Generate a comprehensive feedback report.
You MUST respond with a JSON object matching this structure:
{
  "overallScore": <number 0-100>,
  "scores": {
    "technicalDepth": <number 0-100>,
    "communication": <number 0-100>,
    "structure": <number 0-100>,
    "confidence": <number 0-100>,
    "pacing": <number 0-100>
  },
  "summary": "Overall summary paragraph analyzing candidate's actual performance honestly...",
  "communicationFeedback": "Detailed feedback on communication style, filler words usage, and speech pacing...",
  "questions": [
    {
      "question": "Question text...",
      "answer": "Candidate's response...",
      "score": <number 0-100>,
      "strengths": ["list of SPECIFIC strengths unique to THIS answer — leave empty array if answer was empty/irrelevant"],
      "weaknesses": ["list of SPECIFIC gaps unique to THIS answer"],
      "improvement": "Specific actionable advice for THIS particular question..."
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

// ==========================================
// Intelligent Mock Report Generator
// ==========================================

/**
 * Strength/weakness pools organized by quality tier for realistic variation
 */
const STRENGTH_POOLS = {
  good: [
    "Demonstrated clear understanding of core concepts",
    "Provided specific technical examples to support the answer",
    "Showed awareness of trade-offs and edge cases",
    "Used appropriate industry terminology throughout",
    "Structured the response with a logical progression",
    "Connected the answer to real-world implementation scenarios",
    "Identified potential bottlenecks and mitigation strategies",
    "Referenced relevant design patterns or best practices"
  ],
  moderate: [
    "Showed basic familiarity with the topic",
    "Attempted to provide a structured response",
    "Touched on some relevant points",
    "Demonstrated willingness to reason through the problem"
  ],
  poor: [
    // No strengths for very poor answers — empty array returned
  ]
};

const WEAKNESS_POOLS = {
  good: [
    "Could elaborate more on scalability considerations",
    "Missing discussion of error handling strategies",
    "Could benefit from mentioning alternative approaches",
    "Time complexity analysis was not discussed"
  ],
  moderate: [
    "Answer lacked sufficient technical depth for this level",
    "Did not address the specific scenario in the question",
    "Missing concrete examples or implementation details",
    "Response was too surface-level for the expected expertise",
    "Failed to discuss trade-offs between different approaches",
    "Did not demonstrate hands-on experience with the topic"
  ],
  poor: [
    "No substantive response was provided",
    "Answer was completely irrelevant to the question asked",
    "Failed to demonstrate any understanding of the topic",
    "Response was too brief to evaluate technical competency",
    "Did not attempt to address any aspect of the question"
  ],
  empty: [
    "No response was recorded for this question",
    "The question was left completely unanswered",
    "Unable to evaluate — no content provided"
  ]
};

const IMPROVEMENT_TEMPLATES = {
  empty: [
    "For this question, start by identifying the key concepts being tested, then structure your answer with: (1) a brief definition or overview, (2) your approach, and (3) trade-offs.",
    "Practice answering this type of question out loud. Even a partial answer is far better than silence — begin with what you know and build from there.",
    "Review the fundamentals of this topic area. In an interview, it's better to think aloud and show your reasoning process than to remain silent."
  ],
  short: [
    "Expand your answer by including specific examples from your experience. The STAR method (Situation, Task, Action, Result) works well for structuring detailed responses.",
    "Your answer needs more depth. Try to cover: what the concept is, how it works under the hood, when you'd use it vs alternatives, and any pitfalls you've encountered.",
    "Aim for at least 60-90 seconds of speaking time per question. Break down your answer into clear sections and provide concrete examples."
  ],
  moderate: [
    "Good foundation, but dive deeper into implementation details. Discuss specific algorithms, data structures, or patterns you'd use and why.",
    "Strengthen your answer by addressing edge cases, error scenarios, and how you'd test your solution in production.",
    "Add more structure to your response: lead with a summary, walk through your approach step by step, and conclude with trade-offs."
  ],
  good: [
    "Strong answer overall. To make it exceptional, compare multiple approaches and explain why you chose one over another.",
    "Consider adding metrics or benchmarks from your past experience to make your answer more compelling and evidence-based."
  ]
};

/**
 * Picks N random items from an array without repetition
 */
function pickRandom(arr, n) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(n, arr.length));
}

/**
 * Analyzes answer quality and returns a realistic score
 */
function analyzeAnswerQuality(answer, question) {
  const noResponse = !answer || 
    answer === 'No spoken or typed response was recorded.' ||
    answer.trim().length === 0;
  
  if (noResponse) {
    return { tier: 'empty', score: Math.floor(Math.random() * 5) }; // 0-4
  }

  const wordCount = answer.trim().split(/\s+/).filter(w => w.length > 0).length;
  const questionWords = question.toLowerCase().split(/\s+/);
  
  // Check for keyword relevance (very basic heuristic)
  const technicalKeywords = ['react', 'dom', 'hook', 'state', 'render', 'component', 'api', 'database', 
    'server', 'client', 'algorithm', 'design', 'system', 'scale', 'cache', 'queue', 'load',
    'performance', 'optimize', 'architecture', 'pattern', 'test', 'deploy', 'container',
    'kubernetes', 'docker', 'microservice', 'rest', 'graphql', 'sql', 'nosql', 'redis',
    'team', 'project', 'deadline', 'conflict', 'challenge', 'solution', 'learn', 'improve',
    'experience', 'approach', 'strategy', 'result', 'impact', 'collaboration'];
  
  const answerLower = answer.toLowerCase();
  let relevanceHits = 0;
  technicalKeywords.forEach(kw => {
    if (answerLower.includes(kw)) relevanceHits++;
  });

  // Also check if answer contains words from the question itself
  let questionOverlap = 0;
  questionWords.forEach(qw => {
    if (qw.length > 3 && answerLower.includes(qw)) questionOverlap++;
  });

  if (wordCount < 8) {
    // Very short answer
    return { tier: 'short', score: 5 + Math.floor(Math.random() * 15) }; // 5-19
  }

  if (wordCount < 20) {
    // Short answer
    const base = relevanceHits > 1 ? 20 : 10;
    return { tier: 'short', score: base + Math.floor(Math.random() * 15) }; // 10-34
  }

  if (wordCount < 40) {
    // Below average length
    const base = relevanceHits > 2 ? 30 : 20;
    return { tier: 'moderate', score: base + Math.floor(Math.random() * 20) }; // 20-49
  }

  if (wordCount < 80) {
    // Moderate length
    const base = relevanceHits > 3 ? 50 : 35;
    return { tier: 'moderate', score: base + Math.floor(Math.random() * 20) }; // 35-69
  }

  if (wordCount < 150) {
    // Decent length
    const relevanceBonus = Math.min(15, relevanceHits * 3);
    const base = 55 + relevanceBonus;
    return { tier: 'good', score: Math.min(85, base + Math.floor(Math.random() * 10)) }; // 55-85
  }

  // Long, detailed answer
  const relevanceBonus = Math.min(15, relevanceHits * 2);
  const base = 65 + relevanceBonus;
  return { tier: 'good', score: Math.min(92, base + Math.floor(Math.random() * 10)) }; // 65-92
}

function getMockReport(role, difficulty, type, questionsAndAnswers) {
  // Analyze each question individually
  const questionResults = questionsAndAnswers.map((q, idx) => {
    const qText = q.text || q.question || `Question ${idx + 1}`;
    const aText = q.answer || '';
    const inputMethod = q.inputMethod || 'unknown';
    
    const analysis = analyzeAnswerQuality(aText, qText);
    
    // Generate per-question specific feedback based on tier
    let strengths = [];
    let weaknesses = [];
    let improvement = '';

    switch (analysis.tier) {
      case 'empty':
        strengths = [];
        weaknesses = pickRandom(WEAKNESS_POOLS.empty, 2);
        improvement = pickRandom(IMPROVEMENT_TEMPLATES.empty, 1)[0];
        break;
      case 'short':
        strengths = pickRandom(STRENGTH_POOLS.moderate, 1);
        weaknesses = pickRandom(WEAKNESS_POOLS.poor, 2).concat(pickRandom(WEAKNESS_POOLS.moderate, 1));
        improvement = pickRandom(IMPROVEMENT_TEMPLATES.short, 1)[0];
        break;
      case 'moderate':
        strengths = pickRandom(STRENGTH_POOLS.moderate, 2);
        weaknesses = pickRandom(WEAKNESS_POOLS.moderate, 2);
        improvement = pickRandom(IMPROVEMENT_TEMPLATES.moderate, 1)[0];
        break;
      case 'good':
        strengths = pickRandom(STRENGTH_POOLS.good, 3);
        weaknesses = pickRandom(WEAKNESS_POOLS.good, 2);
        improvement = pickRandom(IMPROVEMENT_TEMPLATES.good, 1)[0];
        break;
    }
    
    return {
      question: qText,
      answer: aText || 'No spoken or typed response was recorded.',
      score: analysis.score,
      strengths,
      weaknesses,
      improvement,
      inputMethod
    };
  });

  // Calculate aggregate scores based on actual performance
  const questionScores = questionResults.map(q => q.score);
  const avgQuestionScore = questionScores.length 
    ? Math.round(questionScores.reduce((a, b) => a + b, 0) / questionScores.length) 
    : 0;
  
  // Check how many questions had actual spoken responses
  const spokenAnswers = questionsAndAnswers.filter(q => q.inputMethod === 'spoken');
  const wpmList = spokenAnswers.map(q => q.wpm).filter(w => w > 0);
  const avgWpm = wpmList.length ? Math.round(wpmList.reduce((a, b) => a + b, 0) / wpmList.length) : 0;
  const totalFillers = questionsAndAnswers.reduce((sum, q) => sum + (q.fillerCount || 0), 0);
  
  // Pacing score — only relevant if there were spoken answers
  let paceScore = 50; // default for no spoken data
  if (wpmList.length > 0) {
    paceScore = avgWpm >= 110 && avgWpm <= 150 ? 90 : avgWpm > 150 ? 65 : avgWpm > 0 ? 55 : 30;
  }
  
  const confidenceScore = wpmList.length > 0 
    ? Math.max(30, 100 - (totalFillers * 5))
    : 50; // default if no speech data

  // Technical depth is strongly tied to answer quality
  const technicalDepth = Math.max(5, avgQuestionScore + Math.floor(Math.random() * 6) - 3);
  
  // Communication depends on whether they actually spoke
  const answeredCount = questionsAndAnswers.filter(q => 
    q.answer && q.answer !== 'No spoken or typed response was recorded.' && q.answer.trim().length > 0
  ).length;
  const answerRate = answeredCount / Math.max(1, questionsAndAnswers.length);
  const communication = Math.max(5, Math.round(answerRate * 70 + (wpmList.length > 0 ? 20 : 0) + Math.random() * 10));
  
  // Structure tied to answer quality
  const structure = Math.max(5, avgQuestionScore + Math.floor(Math.random() * 10) - 5);

  // Overall score: weighted average with heavy emphasis on actual answer quality
  const overallScore = Math.max(0, Math.min(100, Math.round(
    (technicalDepth * 0.40) + 
    (communication * 0.25) + 
    (structure * 0.20) + 
    (confidenceScore * 0.10) + 
    (paceScore * 0.05)
  )));

  // Generate appropriate summary
  let summaryText;
  if (overallScore < 20) {
    summaryText = `The candidate struggled significantly during the ${difficulty} ${role} interview (${type}). Most questions were either unanswered or received very brief responses that did not demonstrate the expected technical competency. Substantial preparation is needed before the next attempt.`;
  } else if (overallScore < 40) {
    summaryText = `The candidate showed limited readiness for the ${difficulty} ${role} position (${type}). While some questions received responses, the depth and specificity were below expectations. Focus on strengthening core technical knowledge and practicing structured answers.`;
  } else if (overallScore < 60) {
    summaryText = `The candidate demonstrated partial understanding during the ${difficulty} ${role} interview (${type}). Some answers showed promise but lacked the depth and structure expected at this level. More practice with timed responses and deeper technical study would be beneficial.`;
  } else if (overallScore < 80) {
    summaryText = `The candidate showed a solid performance interviewing for the ${difficulty} ${role} role (${type}). They demonstrated clear domain understanding, though some technical explanations could be structured more tightly. Overall a promising interview with room for improvement.`;
  } else {
    summaryText = `The candidate performed excellently in the ${difficulty} ${role} interview (${type}). Responses were detailed, well-structured, and demonstrated strong technical expertise. Minor refinements in specific areas would make the candidate even more competitive.`;
  }

  // Communication feedback
  let commFeedback;
  if (wpmList.length === 0) {
    const typedCount = questionsAndAnswers.filter(q => q.inputMethod === 'typed').length;
    if (typedCount > 0) {
      commFeedback = `All responses were typed rather than spoken, so speech pacing metrics are not available. In a real interview, practicing verbal responses is crucial — try switching to microphone mode to build comfort with speaking your answers. You used a total of ${totalFillers} filler words throughout the session.`;
    } else {
      commFeedback = `No speech data was recorded during this session. To get meaningful communication feedback, try answering questions verbally using the microphone. Verbal communication skills are a critical component of interview performance.`;
    }
  } else {
    commFeedback = `Your average speaking pace was ${avgWpm} WPM, which is ${avgWpm >= 110 && avgWpm <= 150 ? 'right in the sweet spot for professional communication (110-150 WPM).' : avgWpm > 150 ? 'a bit fast. Try to pause for emphasis to help the interviewer follow.' : 'a bit slow. Try to speak with slightly more energy.'} You used a total of ${totalFillers} filler words (like 'um', 'uh', 'like') throughout the session. Working on minimizing these hesitations will significantly improve your overall executive presence.`;
  }

  return {
    overallScore,
    scores: {
      technicalDepth: Math.min(100, technicalDepth),
      communication: Math.min(100, communication),
      structure: Math.min(100, structure),
      confidence: Math.min(100, confidenceScore),
      pacing: Math.min(100, paceScore)
    },
    summary: summaryText,
    communicationFeedback: commFeedback,
    questions: questionResults
  };
}

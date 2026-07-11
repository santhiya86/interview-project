// Groq AI Service
// Model: llama3-8b-8192 (free, fast)
// FIXED: json_object mode requires "JSON" in prompt — added to system message
// FIXED: better error handling for rate limits and auth errors

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL   = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

async function callGroq(prompt, { json = true, timeoutMs = 60000 } = {}) {
  if (!GROQ_API_KEY) {
    const e = new Error("GROQ_API_KEY not set in environment variables.");
    e.isAIError = true;
    throw e;
  }

  // FIX: When using json_object response format, the system message MUST
  // contain the word "JSON" — otherwise Groq returns a 400 error.
  const systemMessage = json
    ? "You are a helpful AI assistant. You must respond with valid JSON only. No markdown fences, no explanation text outside the JSON object."
    : "You are a helpful AI interview coach. Be specific, concise, and practical.";

  let res;
  try {
    const body = {
      model:       GROQ_MODEL,
      messages:    [
        { role: "system", content: systemMessage },
        { role: "user",   content: prompt }
      ],
      temperature: 0.3,
      max_tokens:  1024
    };

    // Only add response_format when json mode requested
    // This forces Groq to output valid JSON
    if (json) {
      body.response_format = { type: "json_object" };
    }

    res = await fetch(GROQ_URL, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body:   JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    const e = new Error(
      err.name === "TimeoutError"
        ? "AI request timed out. Please try again."
        : "Cannot reach Groq API. Check internet connection."
    );
    e.isAIError = true;
    throw e;
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg     = errBody?.error?.message || `Groq error ${res.status}`;
    console.error("[groq] API error:", res.status, msg);

    if (res.status === 401) {
      const e = new Error("Invalid GROQ_API_KEY. Check your Render environment variable.");
      e.isAIError = true;
      throw e;
    }
    if (res.status === 429) {
      const e = new Error("Groq rate limit reached. Wait a moment and try again.");
      e.isAIError = true;
      throw e;
    }
    if (res.status === 400) {
      const e = new Error("Groq bad request: " + msg);
      e.isAIError = true;
      throw e;
    }
    const e = new Error(msg);
    e.isAIError = true;
    throw e;
  }

  const data = await res.json();
  const raw  = data?.choices?.[0]?.message?.content || "";

  console.log("[groq] response received, length:", raw.length);

  if (!json) return raw;

  // Parse JSON response
  const clean = raw.replace(/^```(?:json)?|```$/gm, "").trim();
  try { return JSON.parse(clean); } catch { /* try next */ }
  const match = clean.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* fall through */ } }

  console.error("[groq] Failed to parse JSON from response:", raw.slice(0, 300));
  const e = new Error("AI returned invalid JSON. Please try again.");
  e.isAIError = true;
  throw e;
}

async function checkHealth() {
  if (!GROQ_API_KEY) return { ok: false, message: "GROQ_API_KEY not configured" };
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { "Authorization": `Bearer ${GROQ_API_KEY}` },
      signal:  AbortSignal.timeout(8000)
    });
    if (res.status === 401) return { ok: false, message: "Invalid GROQ_API_KEY" };
    if (!res.ok) return { ok: false, message: `Groq API status ${res.status}` };
    const data   = await res.json();
    const models = (data.data || []).map(m => m.id);
    return { ok: true, modelAvailable: true, model: GROQ_MODEL, models, message: `Groq ready (${GROQ_MODEL})` };
  } catch (err) {
    return { ok: false, message: "Cannot reach Groq: " + err.message };
  }
}

module.exports = { callGroq, checkHealth };

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../utils/api";

// Timer durations per mode
const TIMER = { text: 300, voice: 180 }; // 5min text, 3min voice

function getTime(mode) {
  return mode === "voice" ? TIMER.voice : TIMER.text;
}

export default function InterviewScreen({ config, interviewId, onComplete, onExit }) {
  const { type, subject, difficulty, inputMode, questions } = config;
  const [qIdx,        setQIdx]        = useState(0);
  const [textAnswer,  setTextAnswer]  = useState("");
  const [recording,   setRecording]   = useState(false);
  const [analyzing,   setAnalyzing]   = useState(false);
  const [currentMode, setCurrentMode] = useState(inputMode === "hybrid" ? "text" : inputMode);
  const [timeLeft,    setTimeLeft]    = useState(() => getTime(inputMode === "hybrid" ? "text" : inputMode));
  const [timeUp,      setTimeUp]      = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [voiceNote,   setVoiceNote]   = useState("");
  const [liveText,    setLiveText]    = useState("");
  const [completing,  setCompleting]  = useState(false);
  const [chatOpen,    setChatOpen]    = useState(true);
  const [chatMsgs, setChatMsgs] = useState([
  {
    role: "bot",
    content:
      "Hi! I am your AI interview coach. I can help you improve your interview answers."
  }
]);
  const [chatInput,   setChatInput]   = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [micPermission, setMicPermission] = useState("unknown"); // unknown | granted | denied

  const recognitionRef     = useRef(null);
  const timerRef           = useRef(null);
  const startTimeRef       = useRef(Date.now());
  const finalTranscriptRef = useRef("");
  const finalResultsRef    = useRef([]);
  const timeUpHandledRef   = useRef(false); // prevent double submit on timeout

  const question = questions[qIdx];
  const isLast   = qIdx === questions.length - 1;
  const progress = Math.round((qIdx / questions.length) * 100);

  const SpeechRecognition = typeof window !== "undefined"
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null;
  const speechSupported = !!SpeechRecognition;

  // ── Complete interview ─────────────────────────────────────────────────
  const completeInterview = useCallback(async () => {
    if (completing) return;
    setCompleting(true);
    try {
      const data = await api(`/interview/${interviewId}/complete`, { method: "POST" });
      onComplete({ report: data.report, answers: data.answers, config });
    } catch (err) {
      console.error("Complete failed:", err.message);
      onExit();
    }
  }, [completing, interviewId, onComplete, config, onExit]);

  // ── Move to next question ──────────────────────────────────────────────
  const goNext = useCallback(() => {
    // Stop any active recording before moving on
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    setTextAnswer("");
    setVoiceNote("");
    setLiveText("");
    setTimeUp(false);
    setRecording(false);
    setAnalyzing(false);
    finalTranscriptRef.current = "";
    timeUpHandledRef.current   = false;
    if (qIdx < questions.length - 1) {
      setQIdx(q => q + 1);
    } else {
      completeInterview();
    }
  }, [qIdx, questions.length, completeInterview]);

  // ── Timer — resets on every new question AND when mode changes ─────────
  useEffect(() => {
    clearInterval(timerRef.current);
    const duration = getTime(currentMode);
    setTimeLeft(duration);
    setTimeUp(false);
    timeUpHandledRef.current = false;
    startTimeRef.current = Date.now();

    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [qIdx, currentMode]); // reset on new question OR mode switch

  // ── Handle time up — separated so we don't capture stale state ────────
  useEffect(() => {
    if (timeLeft === 0 && !timeUpHandledRef.current) {
      timeUpHandledRef.current = true;
      setTimeUp(true);

      // Stop recording if active
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
        recognitionRef.current = null;
        setRecording(false);
      }

      // Auto-submit after 2 seconds of showing "Time Up!"
      const t = setTimeout(async () => {
        if (currentMode === "text") {
          // Get current text from state via DOM since we're in a closure
          const textarea = document.querySelector(".answer-text textarea");
          const ans = textarea?.value || "(time expired)";
          try {
            await api(`/interview/${interviewId}/answer/text`, {
              method: "POST",
              body: JSON.stringify({
                questionIndex: qIdx,
                answer: ans,
                timeTakenSec: getTime(currentMode)
              })
            });
          } catch (err) {
            console.error("Auto-submit failed:", err.message);
          }
        } else {
          // Voice — submit whatever was captured
          const transcript = finalTranscriptRef.current.trim();
          if (transcript) {
            try {
              await api(`/interview/${interviewId}/answer/voice`, {
                method: "POST",
                body: JSON.stringify({
                  questionIndex: qIdx,
                  transcript,
                  timeTakenSec: getTime(currentMode),
                  speechMetricsData: null
                })
              });
            } catch (err) {
              console.error("Auto-submit voice failed:", err.message);
            }
          }
        }
        goNext();
      }, 2000);

      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  const stopTimer = () => clearInterval(timerRef.current);

  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const timerClass = timeLeft > 60 ? "" : timeLeft > 30 ? " warning" : " danger";

  // ── Submit text answer ─────────────────────────────────────────────────
  const submitText = async () => {
    if (submitting || timeUp) return;
    stopTimer();
    setSubmitting(true);
    const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000);
    try {
      await api(`/interview/${interviewId}/answer/text`, {
        method: "POST",
        body: JSON.stringify({
          questionIndex: qIdx,
          answer: textAnswer.trim() || "(no answer)",
          timeTakenSec: timeTaken
        })
      });
    } catch (err) {
      console.error("Save text answer:", err.message);
    } finally {
      setSubmitting(false);
      goNext();
    }
  };

  // ── Request microphone permission explicitly (fixes mobile) ────────────
  const requestMicPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Immediately stop the stream — we just needed the permission grant
      stream.getTracks().forEach(t => t.stop());
      setMicPermission("granted");
      setVoiceNote("");
      return true;
    } catch (err) {
      console.error("Mic permission error:", err.name, err.message);
      setMicPermission("denied");
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setVoiceNote("Microphone access denied. On mobile: tap the lock/info icon in your browser address bar → Site Settings → Microphone → Allow. Then refresh and try again.");
      } else if (err.name === "NotFoundError") {
        setVoiceNote("No microphone found on this device. Please use Text mode instead.");
      } else {
        setVoiceNote("Microphone error: " + err.message + ". Please switch to Text mode.");
      }
      return false;
    }
  };

  // ── Start voice recording ──────────────────────────────────────────────
  const startRecording = async () => {
    setVoiceNote("");
    setLiveText("");
    finalTranscriptRef.current = "";
     finalResultsRef.current = []; 

    if (!speechSupported) {
      setVoiceNote("Speech recognition is not supported in your browser. Please use Chrome or Edge on desktop, or switch to Text mode.");
      return;
    }

    // On mobile, we must explicitly request mic permission first
    if (micPermission !== "granted") {
      const ok = await requestMicPermission();
      if (!ok) return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous      = true;
    recognition.interimResults  = true;
    recognition.lang            = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setRecording(true);

    recognition.onresult = (event) => {
  recognition.onresult = (event) => {
  let interim = "";
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const result = event.results[i];
    const t = result[0].transcript;
    if (result.isFinal) {
      // Store by index instead of appending — re-fires of the same
      // index (which happens on Android Chrome) simply overwrite,
      // instead of duplicating the text.
      finalResultsRef.current[i] = t.trim();
    } else {
      interim += t;
    }
  }
  finalTranscriptRef.current = finalResultsRef.current.filter(Boolean).join(" ") + " ";
  setLiveText((finalTranscriptRef.current + interim).trim());
};

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        setMicPermission("denied");
        setVoiceNote("Microphone access denied. Please allow microphone access in your browser settings, then tap the mic button again.");
      } else if (event.error === "network") {
        setVoiceNote("Network error with speech recognition. Check your internet connection.");
      } else if (event.error === "no-speech") {
        setVoiceNote("No speech detected. Please speak clearly and try again.");
      } else if (event.error !== "aborted") {
        setVoiceNote("Speech error: " + event.error + ". Try Text mode instead.");
      }
      setRecording(false);
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) setRecording(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      setVoiceNote("Could not start speech recognition: " + err.message);
    }
  };

  // ── Stop voice recording and submit ───────────────────────────────────
  const stopRecording = async () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    setRecording(false);
    setAnalyzing(true);
    stopTimer();

    const transcript = finalTranscriptRef.current.trim() || liveText.trim();
    if (!transcript) {
      setVoiceNote("No speech detected. Please try again or switch to Text mode.");
      setAnalyzing(false);
      return;
    }

    const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000);
    try {
      await api(`/interview/${interviewId}/answer/voice`, {
        method: "POST",
        body: JSON.stringify({
          questionIndex: qIdx,
          transcript,
          timeTakenSec: timeTaken,
          speechMetricsData: null
        })
      });
    } catch (err) {
      console.error("Save voice answer:", err.message);
      setVoiceNote("Answer recorded. Continuing...");
    } finally {
      setAnalyzing(false);
      setTimeout(goNext, 400);
    }
  };

  // ── Chatbot ────────────────────────────────────────────────────────────
  const sendChat = async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatMsgs(m => [...m, { role: "user", content: msg }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const data = await api(`/interview/${interviewId}/chat`, {
        method: "POST",
        body: JSON.stringify({
          question,
          answer: currentMode === "text" ? textAnswer : liveText,
          userMessage: msg,
          history: chatMsgs.slice(-6)
        })
      });
      setChatMsgs(m => [...m, {
        role: "bot",
        content: data.reply + (data.tip ? "\n\n💡 " + data.tip : "")
      }]);
      if (data.improvedAnswer && currentMode === "text") setTextAnswer(data.improvedAnswer);
    } catch (err) {
      setChatMsgs(m => [...m, {
        role: "bot",
       content:
  "AI coach is temporarily unavailable. Please continue your interview."
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  // ── Completing screen ──────────────────────────────────────────────────
  if (completing) {
    return (
      <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:48, marginBottom:16 }}>⏳</div>
          <div style={{ fontSize:18, fontWeight:600, color:"var(--text)" }}>Generating your performance report...</div>
          <div style={{ fontSize:14, color:"var(--muted)", marginTop:8 }}>AI is analyzing all your answers</div>
        </div>
      </div>
    );
  }

  return (
    <div className="interview-layout">
      <div className="interview-main">

        {/* Header */}
        <div className="interview-header">
          <div>
            <div className="title">
              {type}{subject ? ` — ${subject}` : ""}{difficulty ? ` (${difficulty})` : ""}
            </div>
            <div className="meta">Q{qIdx + 1} of {questions.length} · {inputMode} mode</div>
          </div>
          <div className="flex gap-2">
            {inputMode === "hybrid" && (
              <select
                value={currentMode}
                onChange={e => setCurrentMode(e.target.value)}
                style={{ background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text)", padding:"6px 10px", borderRadius:8, fontSize:13 }}
              >
                <option value="text">⌨ Text</option>
                <option value="voice">🎙 Voice</option>
              </select>
            )}
            {/* Timer — shows TIME UP! in red when expired */}
            {timeUp ? (
              <span style={{ padding:"6px 16px", borderRadius:20, fontSize:14, fontWeight:700, background:"rgba(239,68,68,0.15)", border:"1px solid #ef4444", color:"#ef4444" }}>
                Time Up!
              </span>
            ) : (
              <span className={"timer-badge" + timerClass}>
                {fmt(timeLeft)}
              </span>
            )}
            <button
              className="btn btn-outline"
              style={{ padding:"6px 14px", fontSize:13 }}
              onClick={() => { stopTimer(); onExit(); }}
            >
              Exit
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="progress-wrap">
          <div className="progress-fill" style={{ width: progress + "%" }} />
        </div>

        {/* Question area */}
        <div className="question-area">
          <div className="q-counter">Question {qIdx + 1} of {questions.length}</div>
          <div className="q-text">{question}</div>

          {/* Time up overlay message */}
          {timeUp && (
            <div style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.4)", borderRadius:8, padding:"10px 14px", fontSize:14, fontWeight:600, color:"#ef4444", marginBottom:16 }}>
              ⏰ Time is up! Moving to the next question...
            </div>
          )}

          {voiceNote && !timeUp && (
            <div style={{ background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.2)", borderRadius:8, padding:"8px 12px", fontSize:13, color:"var(--yellow)", marginBottom:16 }}>
              {voiceNote}
            </div>
          )}

          {/* TEXT mode */}
          {currentMode === "text" && (
            <div className="answer-text">
              <textarea
                value={textAnswer}
                onChange={e => setTextAnswer(e.target.value)}
                placeholder="Type your answer here... (5 minutes)"
                rows={7}
                disabled={timeUp}
              />
            </div>
          )}

          {/* VOICE mode */}
          {currentMode === "voice" && (
            <div className="voice-recorder">
              {!speechSupported && (
                <div style={{ color:"var(--yellow)", fontSize:13, marginBottom:16 }}>
                  ⚠ Speech recognition not supported. Please use Chrome or Edge on desktop, or switch to Text mode.
                </div>
              )}

              {/* Mic permission button for mobile */}
              {micPermission === "unknown" && speechSupported && !recording && (
                <div style={{ marginBottom:16 }}>
                  <button
                    onClick={requestMicPermission}
                    style={{ padding:"10px 20px", borderRadius:8, background:"var(--accent)", color:"white", border:"none", cursor:"pointer", fontSize:13, fontWeight:600 }}
                  >
                    🎤 Allow Microphone Access
                  </button>
                  <div style={{ fontSize:12, color:"var(--muted)", marginTop:8 }}>
                    Click to allow microphone, then tap the mic button to record
                  </div>
                </div>
              )}

              <button
                className={"record-btn" + (recording ? " recording" : analyzing ? " analyzing" : "")}
                onClick={recording ? stopRecording : analyzing ? undefined : startRecording}
                disabled={analyzing || !speechSupported || timeUp}
              >
                {analyzing ? "⏳" : recording ? "⏹" : "🎙"}
              </button>

              <div className="voice-status">
                {timeUp      ? "Time is up! Moving on..." :
                 analyzing   ? "Saving your answer..." :
                 recording   ? "Listening... Click ⏹ to stop and submit" :
                               "Click 🎙 to start speaking (3 minutes)"}
              </div>

              {/* Live transcript */}
              {(recording || liveText) && !timeUp && (
                <div style={{
                  marginTop:16, background:"var(--surface2)", border:"1px solid var(--border)",
                  borderRadius:10, padding:"12px 14px", fontSize:14, color:"var(--text)",
                  minHeight:60, textAlign:"left", lineHeight:1.6
                }}>
                  {liveText || <span style={{ color:"var(--muted)" }}>Listening...</span>}
                </div>
              )}

              {recording && (
                <div style={{ marginTop:12, color:"var(--red)", fontSize:13, fontWeight:600 }}>
                  ● Recording in progress
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="interview-footer">
          <button
            className="btn-skip"
            disabled={submitting || analyzing || recording || timeUp}
            onClick={() => { stopTimer(); goNext(); }}
          >
            Skip
          </button>
          {currentMode === "text" && (
            <button
              className="btn-next"
              onClick={submitText}
              disabled={!textAnswer.trim() || submitting || timeUp}
            >
              {submitting ? "Saving..." : isLast ? "Finish ✓" : "Next →"}
            </button>
          )}
        </div>
      </div>

      {/* AI Chatbot panel */}
      {chatOpen && (
        <div className="chatbot-panel">
          <div className="chatbot-header">
            🤖 AI Coach
            <button
              onClick={() => setChatOpen(false)}
              style={{ float:"right", background:"none", color:"var(--muted)", fontSize:18, border:"none", cursor:"pointer" }}
            >
              ✕
            </button>
          </div>
          <div className="chatbot-messages">
            {chatMsgs.map((m, i) => (
              <div key={i} className={"chat-msg " + m.role} style={{ whiteSpace:"pre-wrap" }}>
                {m.content}
              </div>
            ))}
            {chatLoading && <div className="chat-msg bot">Thinking...</div>}
          </div>
          <div className="chatbot-input">
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="Ask for help..."
              onKeyDown={e => e.key === "Enter" && sendChat()}
            />
            <button onClick={sendChat} disabled={chatLoading}>→</button>
          </div>
        </div>
      )}

      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          style={{
            position:"fixed", bottom:24, right:24, width:52, height:52,
            borderRadius:"50%", background:"var(--accent)", color:"white",
            fontSize:24, border:"none", cursor:"pointer",
            boxShadow:"0 4px 20px rgba(99,102,241,0.5)", zIndex:100
          }}
        >
          🤖
        </button>
      )}
    </div>
  );
}

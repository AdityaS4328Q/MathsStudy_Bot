import { useState, useRef, useCallback } from "react";

const API = "http://localhost:8000";

export default function MathSolver() {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [drag, setDrag] = useState(false);
  const [loadingStep, setLoadingStep] = useState("Reading your problem...");
  const fileRef = useRef();
  const cameraRef = useRef();

  const handleFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setImage(file);
    setPreview(URL.createObjectURL(file));
    setResult(null);
    setError(null);
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDrag(false);
    handleFile(e.dataTransfer.files[0]);
  }, []);

  const solve = async () => {
    if (!image) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setLoadingStep("Step 1: LLaVA reading the image...");
    try {
      const form = new FormData();
      form.append("file", image);
      // Show step 2 message after a few seconds
      const stepTimer = setTimeout(() => setLoadingStep("Step 2: Llama3 solving the math..."), 8000);
      const res = await fetch(`${API}/api/solve`, { method: "POST", body: form });
      clearTimeout(stepTimer);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Server error");
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setImage(null);
    setPreview(null);
    setResult(null);
    setError(null);
  };

  return (
    <div style={styles.root}>
      {/* Background grid */}
      <div style={styles.grid} />

      <div style={styles.container}>
        {/* Header */}
        <header style={styles.header}>
          <div style={styles.logoWrap}>
            <span style={styles.logoSymbol}>∑</span>
            <div>
              <h1 style={styles.title}>MathLens</h1>
              <p style={styles.subtitle}>Snap · Extract · Solve</p>
            </div>
          </div>
          <div style={styles.badge}>100% Local · No Cloud</div>
        </header>

        <div style={styles.main}>
          {/* Left panel */}
          <div style={styles.leftPanel}>
            <div
              style={{ ...styles.dropzone, ...(drag ? styles.dropzoneActive : {}) }}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              onClick={() => !preview && fileRef.current.click()}
            >
              {preview ? (
                <div style={styles.previewWrap}>
                  <img src={preview} alt="problem" style={styles.previewImg} />
                  <button style={styles.clearBtn} onClick={(e) => { e.stopPropagation(); reset(); }}>✕</button>
                </div>
              ) : (
                <div style={styles.dropContent}>
                  <div style={styles.dropIcon}>📐</div>
                  <p style={styles.dropText}>Drop your math problem here</p>
                  <p style={styles.dropSub}>or click to browse</p>
                  <div style={styles.divider}><span>or</span></div>
                  <button style={styles.cameraBtn} onClick={(e) => { e.stopPropagation(); cameraRef.current.click(); }}>
                    📷 Use Camera
                  </button>
                </div>
              )}
            </div>

            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />

            {preview && (
              <button style={{ ...styles.solveBtn, ...(loading ? styles.solveBtnLoading : {}) }} onClick={solve} disabled={loading}>
                {loading ? (
                  <span style={styles.loadingInner}>
                    <span style={styles.spinner} /> Solving...
                  </span>
                ) : "⚡ Solve Problem"}
              </button>
            )}

            {error && (
              <div style={styles.errorBox}>
                <strong>⚠ Error</strong>
                <p>{error}</p>
                {error.includes("Ollama") && (
                  <code style={styles.code}>ollama serve &amp;&amp; ollama pull llava</code>
                )}
              </div>
            )}
          </div>

          {/* Right panel */}
          <div style={styles.rightPanel}>
            {!result && !loading && (
              <div style={styles.emptyState}>
                <div style={styles.emptyIcon}>🧮</div>
                <p style={styles.emptyText}>Your solution will appear here</p>
                <div style={styles.featureList}>
                  {["Algebra & Equations", "Geometry", "Calculus", "Word Problems", "Multiple Choice"].map(f => (
                    <span key={f} style={styles.featureTag}>{f}</span>
                  ))}
                </div>
              </div>
            )}

            {loading && (
              <div style={styles.loadingState}>
                <div style={styles.pulseRing} />
                <p style={styles.loadingText}>{loadingStep}</p>
                <p style={styles.loadingSubtext}>Running locally on your Mac</p>
              </div>
            )}

            {result && (
              <div style={styles.solution}>
                {result.extracted_text && (
                  <div style={styles.sectionBlock}>
                    <div style={styles.sectionLabel}>👁 Step 1 — LLaVA Extracted</div>
                    <p style={styles.extractedText}>{result.extracted_text}</p>
                  </div>
                )}
                {result.problem && (
                  <div style={styles.sectionBlock}>
                    <div style={styles.sectionLabel}>📋 Step 2 — Llama3 Understood</div>
                    <p style={styles.problemText}>{result.problem}</p>
                  </div>
                )}

                {result.steps && result.steps.length > 0 && (
                  <div style={styles.sectionBlock}>
                    <div style={styles.sectionLabel}>🔢 Solution</div>
                    <div style={styles.stepsWrap}>
                      {result.steps.map((step, i) => (
                        <div key={i} style={styles.step}>
                          <div style={styles.stepNum}>{i + 1}</div>
                          <p style={styles.stepText}>{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.answer && (
                  <div style={styles.answerBlock}>
                    <div style={styles.answerLabel}>✅ Answer</div>
                    <div style={styles.answerText}>{result.answer}</div>
                  </div>
                )}

                {/* Fallback: show raw if parsing was minimal */}
                {(!result.steps || result.steps.length === 0) && result.raw && (
                  <div style={styles.sectionBlock}>
                    <div style={styles.sectionLabel}>📝 Full Solution</div>
                    <pre style={styles.rawText}>{result.raw}</pre>
                  </div>
                )}

                <button style={styles.newBtn} onClick={reset}>Solve Another →</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  root: {
    minHeight: "100vh",
    background: "#0a0a0f",
    fontFamily: "'Georgia', serif",
    color: "#e8e6e0",
    position: "relative",
    overflow: "hidden",
  },
  grid: {
    position: "fixed",
    inset: 0,
    backgroundImage: "linear-gradient(rgba(255,200,50,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,200,50,0.03) 1px, transparent 1px)",
    backgroundSize: "60px 60px",
    pointerEvents: "none",
  },
  container: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "32px 24px",
    position: "relative",
    zIndex: 1,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 40,
    paddingBottom: 24,
    borderBottom: "1px solid rgba(255,200,50,0.15)",
  },
  logoWrap: {
    display: "flex",
    alignItems: "center",
    gap: 16,
  },
  logoSymbol: {
    fontSize: 48,
    color: "#ffc832",
    lineHeight: 1,
    textShadow: "0 0 30px rgba(255,200,50,0.4)",
  },
  title: {
    margin: 0,
    fontSize: 32,
    fontWeight: "bold",
    letterSpacing: "-0.5px",
    color: "#fff",
  },
  subtitle: {
    margin: "2px 0 0",
    fontSize: 13,
    color: "#888",
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    fontFamily: "monospace",
  },
  badge: {
    background: "rgba(255,200,50,0.08)",
    border: "1px solid rgba(255,200,50,0.25)",
    color: "#ffc832",
    padding: "6px 14px",
    borderRadius: 20,
    fontSize: 12,
    fontFamily: "monospace",
    letterSpacing: "0.05em",
  },
  main: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 28,
    alignItems: "start",
  },
  leftPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  dropzone: {
    border: "2px dashed rgba(255,200,50,0.2)",
    borderRadius: 16,
    minHeight: 320,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "all 0.2s",
    background: "rgba(255,255,255,0.02)",
    overflow: "hidden",
    position: "relative",
  },
  dropzoneActive: {
    border: "2px dashed #ffc832",
    background: "rgba(255,200,50,0.05)",
  },
  dropContent: {
    textAlign: "center",
    padding: 32,
  },
  dropIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  dropText: {
    margin: "0 0 6px",
    fontSize: 16,
    color: "#ccc",
  },
  dropSub: {
    margin: 0,
    fontSize: 13,
    color: "#555",
  },
  divider: {
    margin: "20px 0",
    color: "#444",
    fontSize: 12,
    display: "flex",
    alignItems: "center",
    gap: 12,
    "::before": { content: '""', flex: 1, height: 1, background: "#333" },
  },
  cameraBtn: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#ccc",
    padding: "10px 20px",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 14,
    marginTop: 8,
  },
  previewWrap: {
    position: "relative",
    width: "100%",
    height: "100%",
    minHeight: 320,
  },
  previewImg: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    borderRadius: 14,
    maxHeight: 400,
  },
  clearBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    background: "rgba(0,0,0,0.7)",
    border: "none",
    color: "#fff",
    width: 28,
    height: 28,
    borderRadius: "50%",
    cursor: "pointer",
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  solveBtn: {
    background: "linear-gradient(135deg, #ffc832, #ff9500)",
    border: "none",
    color: "#000",
    padding: "16px 32px",
    borderRadius: 12,
    fontSize: 16,
    fontWeight: "bold",
    cursor: "pointer",
    width: "100%",
    letterSpacing: "0.02em",
    transition: "opacity 0.2s, transform 0.1s",
  },
  solveBtnLoading: {
    opacity: 0.7,
    cursor: "not-allowed",
  },
  loadingInner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  spinner: {
    display: "inline-block",
    width: 16,
    height: 16,
    border: "2px solid rgba(0,0,0,0.2)",
    borderTop: "2px solid #000",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  errorBox: {
    background: "rgba(255,60,60,0.08)",
    border: "1px solid rgba(255,60,60,0.25)",
    borderRadius: 10,
    padding: "14px 16px",
    fontSize: 14,
    color: "#ff8080",
  },
  code: {
    display: "block",
    marginTop: 8,
    background: "rgba(0,0,0,0.4)",
    padding: "8px 12px",
    borderRadius: 6,
    fontSize: 12,
    fontFamily: "monospace",
    color: "#ffc832",
  },
  rightPanel: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 16,
    minHeight: 400,
    display: "flex",
    flexDirection: "column",
  },
  emptyState: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    textAlign: "center",
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 16,
    opacity: 0.4,
  },
  emptyText: {
    color: "#555",
    fontSize: 15,
    marginBottom: 24,
  },
  featureList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  featureTag: {
    background: "rgba(255,200,50,0.06)",
    border: "1px solid rgba(255,200,50,0.12)",
    color: "#666",
    padding: "4px 12px",
    borderRadius: 20,
    fontSize: 12,
  },
  loadingState: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  pulseRing: {
    width: 64,
    height: 64,
    borderRadius: "50%",
    border: "3px solid rgba(255,200,50,0.3)",
    borderTop: "3px solid #ffc832",
    animation: "spin 1s linear infinite",
    marginBottom: 24,
  },
  loadingText: {
    color: "#ccc",
    fontSize: 16,
    margin: "0 0 6px",
  },
  loadingSubtext: {
    color: "#555",
    fontSize: 13,
    fontFamily: "monospace",
  },
  solution: {
    padding: 28,
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  sectionBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "monospace",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#666",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    paddingBottom: 8,
  },
  extractedText: {
    margin: 0,
    fontSize: 13,
    color: "#888",
    lineHeight: 1.6,
    fontFamily: "monospace",
    background: "rgba(255,255,255,0.03)",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.06)",
  },
  problemText: {
    margin: 0,
    fontSize: 15,
    color: "#ddd",
    lineHeight: 1.6,
    fontStyle: "italic",
  },
  stepsWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  step: {
    display: "flex",
    gap: 14,
    alignItems: "flex-start",
  },
  stepNum: {
    minWidth: 26,
    height: 26,
    background: "rgba(255,200,50,0.1)",
    border: "1px solid rgba(255,200,50,0.2)",
    color: "#ffc832",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontFamily: "monospace",
    fontWeight: "bold",
    flexShrink: 0,
    marginTop: 2,
  },
  stepText: {
    margin: 0,
    fontSize: 14,
    color: "#ccc",
    lineHeight: 1.7,
  },
  answerBlock: {
    background: "linear-gradient(135deg, rgba(255,200,50,0.08), rgba(255,149,0,0.06))",
    border: "1px solid rgba(255,200,50,0.2)",
    borderRadius: 12,
    padding: "16px 20px",
  },
  answerLabel: {
    fontSize: 11,
    fontFamily: "monospace",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#888",
    marginBottom: 8,
  },
  answerText: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#ffc832",
    letterSpacing: "-0.3px",
  },
  rawText: {
    margin: 0,
    fontSize: 13,
    color: "#bbb",
    lineHeight: 1.7,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: "monospace",
  },
  newBtn: {
    alignSelf: "flex-end",
    background: "transparent",
    border: "1px solid rgba(255,200,50,0.2)",
    color: "#ffc832",
    padding: "10px 20px",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13,
    letterSpacing: "0.05em",
    marginTop: 4,
  },
};

// inject keyframes
const styleTag = document.createElement("style");
styleTag.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(styleTag);

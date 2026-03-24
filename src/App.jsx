import { useState, useRef, useEffect } from 'react'
import { useWorker } from './hooks/useWorker'
import { useVectorDB } from './hooks/useVectorDB'
import MermaidRenderer from './components/MermaidRenderer'
import { YOUTUBE_API_KEY } from './prompts'

export default function App() {
  // ─── App State ───────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [currentImage, setCurrentImage] = useState(null)
  const [youtubeResults, setYoutubeResults] = useState([])
  const [sessionActive, setSessionActive] = useState(false)
  const [toast, setToast] = useState('')
  const chatEndRef = useRef(null)

  // ─── Hooks ───────────────────────────────────────────────────────────────────
  const { saveSession, searchSimilar, buildContextPrompt, sessionCount } = useVectorDB()

  const { status, progress, streamingText, error, sendMessage, summarizeSession } = useWorker({
    onComplete: (fullText) => {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { 
          role: 'assistant', 
          content: fullText 
        }
        return updated
      })
    },
    onSummaryComplete: async (summaryText) => {
      try {
        const parsed = JSON.parse(summaryText)
        await saveSession(parsed)
        showToast('Session saved to memory ✓')
      } catch(e) {
        showToast('Session ended')
      }
      setMessages([])
      setSessionActive(false)
    }
  })

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function showToast(message) {
    setToast(message)
    setTimeout(() => setToast(''), 3000)
  }

  async function handleSend() {
    if (!inputText.trim() && !currentImage) return
    if (status !== 'ready') return

    // Build user message content — annotate if image is attached
    let messageContent = inputText
    if (currentImage) {
      messageContent = '[Image of math problem attached] ' + inputText
    }

    const userMessage = { 
      role: 'user', 
      content: messageContent, 
      imageBase64: currentImage?.base64 
    }
    
    // Add both user message and empty assistant message at once
    setMessages(prev => [...prev, userMessage, { role: 'assistant', content: '' }])
    
    setInputText('')
    setCurrentImage(null)
    setSessionActive(true)

    // RAG: search for relevant past sessions
    const similar = await searchSimilar(inputText)
    const contextPrompt = buildContextPrompt(similar)

    // Build conversation history (exclude last assistant placeholder)
    const history = [...messages, userMessage].map(m => ({
      role: m.role,
      content: m.content
    }))

    // Inference runs on main thread via sendMessage loop
    sendMessage(null, messageContent, history, contextPrompt)
  }

  async function handleEndSession() {
    if (!sessionActive || messages.length === 0) return
    const conversationText = messages
      .map(m => m.role.toUpperCase() + ': ' + m.content)
      .join('\n\n')
    summarizeSession(conversationText)
    showToast('Saving session...')
  }

  async function handleVideoSearch(query) {
    if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY === 'your_youtube_api_key_here') {
      showToast('Add VITE_YOUTUBE_API_KEY to .env to enable videos')
      return
    }
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=4&q=${encodeURIComponent(query)}&key=${YOUTUBE_API_KEY}`
      )
      const data = await res.json()
      setYoutubeResults(data.items.map(item => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.medium.url
      })))
    } catch(e) {
      showToast('Could not fetch videos')
    }
  }

  function handleImageUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setCurrentImage({
        base64: ev.target.result.split(',')[1],
        preview: ev.target.result
      })
    }
    reader.readAsDataURL(file)
  }

  // Auto scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  // Update last assistant message with streaming text
  useEffect(() => {
    if (!streamingText) return
    setMessages(prev => {
      if (prev.length === 0) return prev
      const updated = [...prev]
      const last = updated[updated.length - 1]
      if (last.role === 'assistant') {
        updated[updated.length - 1] = { ...last, content: streamingText }
      }
      return updated
    })
  }, [streamingText])

  // ─── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a0f 0%, #0d0d1a 50%, #0a0f0a 100%)',
      color: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Segoe UI', monospace"
    }}>

      {/* HEADER */}
      <div style={{
        padding: '1rem 2rem',
        borderBottom: '1px solid rgba(255,215,0,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 style={{ 
            color: '#ffd700', 
            margin: 0, 
            fontSize: '1.5rem',
            fontWeight: 'bold',
            letterSpacing: '2px'
          }}>⚡ MATHLENS</h1>
          <span style={{
            fontSize: '0.7rem',
            color: '#888',
            border: '1px solid #333',
            padding: '2px 8px',
            borderRadius: '12px'
          }}>Local AI • Privacy First</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {sessionCount > 0 && (
            <span style={{ fontSize: '0.75rem', color: '#888' }}>
              🧠 {sessionCount} sessions in memory
            </span>
          )}
          {sessionActive && (
            <button onClick={handleEndSession} style={{
              background: 'rgba(255,100,100,0.15)',
              border: '1px solid rgba(255,100,100,0.4)',
              color: '#ff6464',
              padding: '6px 14px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.8rem'
            }}>End Session</button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: status === 'ready' ? '#00ff88' : 
                          status === 'downloading' ? '#ffd700' : 
                          status === 'error' ? '#ff4444' : '#888',
              boxShadow: status === 'ready' ? '0 0 8px #00ff88' : 'none'
            }}/>
            <span style={{ fontSize: '0.75rem', color: '#888' }}>
              {status === 'ready' ? 'Ready' :
               status === 'downloading' ? `${Math.round(progress)}%` :
               status === 'thinking' ? 'Thinking...' :
               status === 'error' ? 'Error' : 'Loading'}
            </span>
          </div>
        </div>
      </div>

      {/* DOWNLOAD PROGRESS BAR */}
      {status === 'downloading' && (
        <div style={{ padding: '1rem 2rem', background: 'rgba(255,215,0,0.05)' }}>
          <div style={{ 
            display: 'flex', justifyContent: 'space-between', 
            marginBottom: '6px', fontSize: '0.8rem', color: '#ffd700' 
          }}>
            <span>Downloading AI model (first time only, cached after this)</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div style={{ width: '100%', height: '4px', background: '#333', borderRadius: '2px' }}>
            <div style={{
              width: progress + '%', height: '100%',
              background: 'linear-gradient(90deg, #ffd700, #ffaa00)',
              borderRadius: '2px', transition: 'width 0.3s'
            }}/>
          </div>
        </div>
      )}

      {/* CHAT AREA */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '2rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        maxWidth: '900px',
        width: '100%',
        margin: '0 auto'
      }}>
        
        {messages.length === 0 && status === 'ready' && (
          <div style={{ 
            textAlign: 'center', 
            color: '#444', 
            marginTop: '4rem' 
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📐</div>
            <p style={{ fontSize: '1.1rem', color: '#666' }}>
              Upload a math problem or ask a question
            </p>
            <p style={{ fontSize: '0.8rem', color: '#444' }}>
              I'll guide you to the answer — not give it away
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start'
          }}>
            {msg.imageBase64 && (
              <img 
                src={'data:image/jpeg;base64,' + msg.imageBase64}
                style={{ 
                  maxWidth: '200px', borderRadius: '8px', 
                  marginBottom: '4px', border: '1px solid #333' 
                }}
                alt="uploaded problem"
              />
            )}
            <div style={{
              maxWidth: '70%',
              padding: '12px 16px',
              borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              background: msg.role === 'user' 
                ? 'rgba(255,215,0,0.15)' 
                : 'rgba(255,255,255,0.05)',
              border: msg.role === 'user'
                ? '1px solid rgba(255,215,0,0.3)'
                : '1px solid rgba(255,255,255,0.1)',
              fontSize: '0.9rem',
              lineHeight: '1.6'
            }}>
              {msg.role === 'assistant' ? (
                <MermaidRenderer 
                  text={msg.content} 
                  onRepairNeeded={(err) => {
                    sendMessage(null, `Fix this mermaid error: ${err}`, messages)
                  }}
                  onVideoSearch={handleVideoSearch}
                />
              ) : (
                <span>{msg.content}</span>
              )}
              {msg.role === 'assistant' && status === 'thinking' && i === messages.length - 1 && (
                <span style={{ 
                  display: 'inline-block', 
                  width: '6px', height: '14px',
                  background: '#ffd700', 
                  marginLeft: '2px',
                  animation: 'blink 1s infinite'
                }}/>
              )}
            </div>
          </div>
        ))}
        <div ref={chatEndRef}/>
      </div>

      {/* YOUTUBE RESULTS */}
      {youtubeResults.length > 0 && (
        <div style={{
          padding: '1rem 2rem',
          borderTop: '1px solid rgba(255,255,255,0.05)'
        }}>
          <div style={{ 
            display: 'flex', gap: '1rem', 
            overflowX: 'auto', paddingBottom: '0.5rem' 
          }}>
            {youtubeResults.map(v => (
              <div key={v.videoId}
                onClick={() => window.open('https://www.youtube.com/watch?v=' + v.videoId, '_blank')}
                style={{
                  flexShrink: 0, width: '200px', cursor: 'pointer',
                  borderRadius: '8px', overflow: 'hidden',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.03)',
                  transition: 'border-color 0.2s'
                }}>
                <img src={v.thumbnail} alt={v.title} style={{ width: '100%' }}/>
                <p style={{ 
                  padding: '8px', margin: 0, 
                  fontSize: '0.75rem', color: '#ccc',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}>{v.title}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* IMAGE PREVIEW */}
      {currentImage && (
        <div style={{ 
          padding: '0.5rem 2rem',
          maxWidth: '900px', width: '100%', margin: '0 auto'
        }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <img src={currentImage.preview} 
              style={{ height: '60px', borderRadius: '8px', border: '1px solid #ffd700' }}
              alt="preview"
            />
            <button onClick={() => setCurrentImage(null)} style={{
              position: 'absolute', top: '-8px', right: '-8px',
              background: '#ff4444', border: 'none', borderRadius: '50%',
              width: '20px', height: '20px', cursor: 'pointer',
              color: 'white', fontSize: '12px', lineHeight: '20px',
              textAlign: 'center', padding: 0
            }}>×</button>
          </div>
        </div>
      )}

      {/* INPUT AREA */}
      <div style={{
        padding: '1rem 2rem',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.02)',
        backdropFilter: 'blur(10px)',
        maxWidth: '900px', width: '100%', margin: '0 auto'
      }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
          
          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '44px', height: '44px', borderRadius: '12px',
            background: 'rgba(255,215,0,0.1)',
            border: '1px solid rgba(255,215,0,0.3)',
            cursor: 'pointer', fontSize: '1.2rem', flexShrink: 0
          }}>
            📷
            <input 
              type="file" 
              accept="image/*" 
              capture="environment"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
          </label>

          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder={
              status === 'ready' 
                ? "Ask about the problem or type your answer..." 
                : "Loading AI model..."
            }
            disabled={status !== 'ready'}
            rows={1}
            style={{
              flex: 1, padding: '12px 16px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px', color: '#fff',
              fontSize: '0.9rem', resize: 'none',
              outline: 'none', lineHeight: '1.5',
              fontFamily: 'inherit'
            }}
          />

          <button
            onClick={handleSend}
            disabled={status !== 'ready' || (!inputText.trim() && !currentImage)}
            style={{
              width: '44px', height: '44px', borderRadius: '12px',
              background: status === 'ready' ? '#ffd700' : '#333',
              border: 'none', cursor: status === 'ready' ? 'pointer' : 'default',
              fontSize: '1.2rem', flexShrink: 0,
              transition: 'background 0.2s'
            }}
          >→</button>
        </div>
      </div>

      {/* TOAST */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '2rem', left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,255,136,0.15)',
          border: '1px solid rgba(0,255,136,0.4)',
          color: '#00ff88', padding: '10px 20px',
          borderRadius: '12px', fontSize: '0.85rem',
          backdropFilter: 'blur(10px)', zIndex: 1000
        }}>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }
        ::-webkit-scrollbar { width: 4px }
        ::-webkit-scrollbar-track { background: transparent }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px }
        * { box-sizing: border-box }
      `}</style>
    </div>
  )
}

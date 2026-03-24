import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

// Initialize mermaid once outside the component lifecycle constraints
mermaid.initialize({ startOnLoad: false, theme: 'dark' });

function parseContent(text) {
  const chunks = [];
  let currentIndex = 0;
  
  // Regex requested by specifications
  const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
  
  let match;
  while ((match = mermaidRegex.exec(text)) !== null) {
    if (match.index > currentIndex) {
      chunks.push({ type: 'text', content: text.substring(currentIndex, match.index) });
    }
    
    chunks.push({ type: 'mermaid', content: match[1].trim() });
    currentIndex = mermaidRegex.lastIndex;
  }
  
  if (currentIndex < text.length) {
    chunks.push({ type: 'text', content: text.substring(currentIndex) });
  }
  
  return chunks;
}

function parseTextChunk(textContent) {
  const parts = [];
  // Token parsing protocol for related videos
  const videoRegex = /\[VIDEO_NEEDED:\s*(.*?)\]/g;
  let currentIndex = 0;
  
  let match;
  while ((match = videoRegex.exec(textContent)) !== null) {
    if (match.index > currentIndex) {
      parts.push({ type: 'plain', content: textContent.substring(currentIndex, match.index) });
    }
    parts.push({ type: 'video', query: match[1].trim() });
    currentIndex = videoRegex.lastIndex;
  }
  
  if (currentIndex < textContent.length) {
    parts.push({ type: 'plain', content: textContent.substring(currentIndex) });
  }
  
  return parts;
}

function MermaidBlock({ content, onRepairNeeded }) {
  const [svgStr, setSvgStr] = useState('');
  const [hasError, setHasError] = useState(false);
  const idRef = useRef('diagram-' + Math.random().toString(36).substring(2, 9));
  const lastAttemptedContent = useRef('');

  useEffect(() => {
    let isMounted = true;

    async function renderDiagram() {
      // Prevent repeating render parses for the exact same partial or full content 
      if (!content || lastAttemptedContent.current === content) return;
      lastAttemptedContent.current = content;

      setHasError(false);
      try {
        // Validation check required by specifications
        await mermaid.parse(content);
        
        const result = await mermaid.render(idRef.current, content);
        
        if (isMounted) {
          setSvgStr(result.svg);
        }
      } catch (err) {
        if (isMounted) {
          setHasError(true);
        }
        
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (onRepairNeeded) {
          onRepairNeeded(errorMsg);
        }
      }
    }

    renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [content, onRepairNeeded]);

  if (hasError || !svgStr) {
    return (
      <div style={{
        padding: '24px', 
        backgroundColor: '#1a1a24', 
        borderRadius: '12px', 
        textAlign: 'center', 
        margin: '16px 0', 
        border: '1px solid #333'
      }}>
        <span style={{ color: '#888', fontStyle: 'italic', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <span style={{ 
            display: 'inline-block', 
            width: '16px', 
            height: '16px', 
            border: '2px solid rgba(255,200,50,0.2)', 
            borderTop: '2px solid #ffc832', 
            borderRadius: '50%', 
            animation: 'spin 1s linear infinite' 
          }} />
          Crafting diagram...
        </span>
      </div>
    );
  }

  return (
    <div 
      style={{ 
        backgroundColor: '#1a1a24', 
        padding: '16px', 
        borderRadius: '12px', 
        overflowX: 'auto', 
        border: '1px solid #333', 
        margin: '16px 0',
        display: 'flex',
        justifyContent: 'center'
      }}
      dangerouslySetInnerHTML={{ __html: svgStr }} 
    />
  );
}

export default function MermaidRenderer({ text = '', onRepairNeeded, onVideoSearch }) {
  const chunks = parseContent(text);

  return (
    <div className="mermaid-renderer-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {chunks.map((chunk, index) => {
        if (chunk.type === 'mermaid') {
          return <MermaidBlock key={index} content={chunk.content} onRepairNeeded={onRepairNeeded} />;
        }

        const textParts = parseTextChunk(chunk.content);
        return (
          <div key={index} style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', color: '#e8e6e0' }}>
            {textParts.map((part, pIdx) => {
              if (part.type === 'video') {
                return (
                  <button 
                    key={pIdx} 
                    onClick={() => onVideoSearch && onVideoSearch(part.query)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: 'linear-gradient(135deg, #ffc832, #ff9500)',
                      color: '#000',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '6px 14px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '0.9em',
                      margin: '4px 0',
                      letterSpacing: '0.02em',
                      boxShadow: '0 2px 8px rgba(255, 200, 50, 0.2)'
                    }}
                  >
                    ▶ Find Video Tutorial: {part.query}
                  </button>
                );
              }
              return <span key={pIdx}>{part.content}</span>;
            })}
          </div>
        );
      })}
    </div>
  );
}

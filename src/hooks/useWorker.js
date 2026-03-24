import { useState, useEffect, useRef, useCallback } from 'react'
import { TextGeneration, LlamaCPP } from '@runanywhere/web-llamacpp'
import { RunAnywhere, SDKEnvironment, ModelManager, ModelCategory, LLMFramework } from '@runanywhere/web'
import { SOCRATIC_PROMPT, SESSION_SUMMARY_PROMPT } from '../prompts.js'

export function useWorker({ onComplete, onSummaryComplete } = {}) {
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState(0)
  const [streamingText, setStreamingText] = useState('')
  const [summaryText, setSummaryText] = useState('')
  const [error, setError] = useState(null)
  
  const worker = useRef(null)
  const streamingRef = useRef('')
  const summaryRef = useRef('')
  const cancelRef = useRef(null)

  useEffect(() => {
    worker.current = new Worker(
      new URL('../worker.js', import.meta.url),
      { type: 'module' }
    )

    worker.current.onmessage = (e) => {
      const { type, value, message } = e.data
      console.log('Worker message:', type, e.data)
      
      switch (type) {
        case 'STATUS':
          // Status like 'Initializing...'
          break
        case 'PROGRESS':
          setStatus('downloading')
          setProgress(value || 0)
          break
        case 'READY':
          // Initialize SDK on main thread for TextGeneration to work
          RunAnywhere.initialize({ environment: SDKEnvironment.Development, debug: false })
            .then(() => LlamaCPP.register())
            .then(() => {
              RunAnywhere.registerModels([{
                id: 'lfm2-350m-q4_k_m',
                name: 'LFM2 350M',
                repo: 'LiquidAI/LFM2-350M-GGUF',
                files: ['LFM2-350M-Q4_K_M.gguf'],
                framework: LLMFramework.LlamaCpp,
                modality: ModelCategory.Language,
                memoryRequirement: 250_000_000,
              }])
              // Model is already downloaded by worker, just load it into RAM on main thread
              return ModelManager.loadModel('lfm2-350m-q4_k_m')
            })
            .then(() => setStatus('ready'))
            .catch(err => {
              console.error('Main thread init error:', err)
              setStatus('error')
              setError(err.message)
            })
          break
        case 'ERROR':
          setStatus('error')
          setError(message)
          break
      }
    }

    // Always start init on mount
    worker.current.postMessage({ type: 'INIT' })

    return () => {
      worker.current?.terminate()
      if (cancelRef.current) cancelRef.current()
    }
  }, [])

  const sendMessage = useCallback(async (imageBase64, userMessage, conversationHistory, contextPrompt) => {
    if (status !== 'ready' && status !== 'thinking') {
      // Allow 'thinking' to retry if it hung, or 'ready' for fresh start
      if (status !== 'ready') return
    }
    
    setStatus('thinking')
    streamingRef.current = ''
    setStreamingText('')
    setError(null)

    try {
      const fullSystemPrompt = contextPrompt
        ? SOCRATIC_PROMPT + '\n\n' + contextPrompt
        : SOCRATIC_PROMPT

      // Build prompt string manually for TextGeneration
      let prompt = fullSystemPrompt + '\n\n'
      if (conversationHistory && conversationHistory.length > 0) {
        for (const msg of conversationHistory) {
          prompt += (msg.role === 'user' ? 'Student' : 'Tutor') + ': ' + msg.content + '\n'
        }
      }
      prompt += 'Student: ' + (userMessage || '') + '\nTutor:'

      // Run generation on main thread
      const { stream, result: resultPromise, cancel } = await TextGeneration.generateStream(
        prompt,
        { maxTokens: 512, temperature: 0.7 }
      )

      cancelRef.current = cancel

      // Consume stream
      for await (const token of stream) {
        let tokenText = ''
        if (typeof token === 'string') {
          tokenText = token
        } else if (token && typeof token === 'object') {
          tokenText = token.text ?? token.content ?? token.delta ?? token.token ?? token.value ?? token.piece ?? ''
        }

        if (tokenText) {
          streamingRef.current += tokenText
          setStreamingText(streamingRef.current)
        }
      }

      const metrics = await resultPromise
      const finalFullText = streamingRef.current || (metrics && metrics.text) || ''

      setStatus('ready')
      setStreamingText('')
      if (onComplete) onComplete(finalFullText)

    } catch (err) {
      console.error('Inference error:', err)
      setStatus('error')
      setError(err.message)
    }
  }, [status, onComplete])

  const summarizeSession = useCallback(async (conversationText) => {
    summaryRef.current = ''
    setSummaryText('')

    try {
      const prompt = `Analyze this tutoring session. Output ONLY raw JSON, no markdown:
{"topic":"math topic","struggle":"concept student found hard","misconception":"misunderstanding or null","keywords":["word1","word2","word3"]}

Conversation:
${conversationText}

JSON:`

      const { stream, result: resultPromise } = await TextGeneration.generateStream(
        prompt,
        { maxTokens: 200, temperature: 0.2 }
      )

      for await (const token of stream) {
        let tokenText = typeof token === 'string' ? token : (token?.text ?? token?.content ?? '')
        if (tokenText) {
          summaryRef.current += tokenText
          setSummaryText(summaryRef.current)
        }
      }

      await resultPromise
      if (onSummaryComplete) onSummaryComplete(summaryRef.current)

    } catch (err) {
      console.error('Summary error:', err)
    }
  }, [onSummaryComplete])

  return {
    status,
    progress,
    streamingText,
    summaryText,
    error,
    sendMessage,
    summarizeSession
  }
}

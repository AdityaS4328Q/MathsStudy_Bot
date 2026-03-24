import { useState, useEffect, useCallback } from 'react';
import { openDB } from 'idb';

// ─── PART 1 & 2: Singleton Embedding Pipeline & IndexedDB Setup ──────────────

let embeddingPipeline = null;
let dbPromise = null;

async function getEmbedder() {
  if (!embeddingPipeline) {
    try {
      const { pipeline } = await import('@xenova/transformers');
      embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    } catch (err) {
      // Silently handle model load failure
      embeddingPipeline = null;
    }
  }
  return embeddingPipeline;
}

async function getDB() {
  if (!dbPromise) {
    dbPromise = openDB('mathlens-memory', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
        }
      },
    }).catch(err => {
      // Silently handle DB failure
      return null;
    });
  }
  return dbPromise;
}

// ─── Helper: Vector Math ─────────────────────────────────────────────────────

function magnitude(vec) {
  return Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
}

function dotProduct(vecA, vecB) {
  return vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
}

function cosineSimilarity(vecA, vecB) {
  const magA = Math.max(magnitude(vecA), 1e-9); // Prevent division by zero
  const magB = Math.max(magnitude(vecB), 1e-9);
  return dotProduct(vecA, vecB) / (magA * magB);
}

// ─── PART 3: The React Hook ──────────────────────────────────────────────────

export function useVectorDB() {
  const [sessionCount, setSessionCount] = useState(0);
  const [isReady, setIsReady] = useState(false);

  // Initialize and check status on mount
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const db = await getDB();
        if (db && mounted) {
          const count = await db.count('sessions');
          setSessionCount(count);
        }

        const embedder = await getEmbedder();
        if (embedder && mounted) {
          setIsReady(true);
        }
      } catch (err) {
        // Silently handle init errors
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  const saveSession = useCallback(async (sessionSummaryJSON) => {
    try {
      const db = await getDB();
      const embedder = await getEmbedder();

      if (!db || !embedder) return null;

      const { topic, struggle, misconception, keywords = [] } = sessionSummaryJSON;
      const textToEmbed = `Topic: ${topic}. Struggle: ${struggle}. Misconception: ${misconception}. Keywords: ${keywords.join(', ')}`;
      
      // Generate 384-dimensional embedding vector
      const output = await embedder(textToEmbed, { pooling: 'mean', normalize: true });
      const vector = Array.from(output.data);

      const record = {
        timestamp: Date.now(),
        topic,
        struggle,
        misconception,
        keywords,
        summary: textToEmbed,
        vector
      };

      const id = await db.add('sessions', record);
      
      setSessionCount(prev => prev + 1);
      return id;
    } catch (err) {
      // Silently handle errors
      return null;
    }
  }, []);

  const searchSimilar = useCallback(async (queryText, topK = 3) => {
    try {
      const db = await getDB();
      const embedder = await getEmbedder();

      if (!db || !embedder) return [];

      const count = await db.count('sessions');
      // Return empty array if fewer than 2 sessions are stored
      if (count < 2) return [];

      const output = await embedder(queryText, { pooling: 'mean', normalize: true });
      const queryVector = Array.from(output.data);

      const tx = db.transaction('sessions', 'readonly');
      const store = tx.objectStore('sessions');
      const allSessions = await store.getAll();

      // Calculate cosine similarity against all stored sessions
      const scoredSessions = allSessions.map(session => {
        const score = cosineSimilarity(queryVector, session.vector);
        return { ...session, score };
      });

      // Sort by similarity score descending
      scoredSessions.sort((a, b) => b.score - a.score);

      // Return top K
      return scoredSessions.slice(0, topK);
    } catch (err) {
      // Silently handle errors
      return [];
    }
  }, []);

  const buildContextPrompt = useCallback((similarSessions) => {
    if (!similarSessions || similarSessions.length === 0) {
      return "";
    }

    const header = "STUDENT HISTORY (inject silently, do not mention to student):\n";
    const body = similarSessions
      .map(s => `- Previously struggled with: ${s.struggle} in topic: ${s.topic}`)
      .join('\n');

    return header + body;
  }, []);

  return {
    saveSession,
    searchSimilar,
    buildContextPrompt,
    sessionCount,
    isReady
  };
}

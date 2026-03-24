# MathsStudy_Bot (MathLens)

A privacy-first math tutoring project with two implementations in the same repository:

1. **Root app (`/`)**: a browser-based Socratic tutor that runs a local LLM in the frontend using RunAnywhere + Web Worker.
2. **Fullstack app (`/math-solver`)**: a FastAPI backend + React frontend that solves math from uploaded images using local Ollama models.

Both variants are designed to run locally (no cloud inference required for core solving).

---

## Project Structure

```text
.
├─ src/                      # Root MathLens frontend (main app currently at repo root)
├─ index.html
├─ package.json
├─ vite.config.js
├─ math-solver/              # Secondary fullstack implementation
│  ├─ backend/               # FastAPI API for image -> extract -> solve
│  └─ frontend/              # React UI for backend
└─ README.md
```

---

## 1) Root App (`/`) - Local Socratic Math Tutor

### What it does

- Loads a small local language model (`LFM2-350M` via `@runanywhere/web-llamacpp`).
- Lets the student ask math questions and optionally attach an image.
- Responds in a **Socratic style** (guiding questions, hints, stepwise help).
- Supports Mermaid diagrams in tutor replies for concept/flow explanation.
- Can trigger YouTube suggestions when the model emits a special token.
- Stores session summaries in IndexedDB and uses embedding-based memory retrieval for context-aware tutoring.

### Key components

- `src/App.jsx`  
  Main chat UI, image input, streaming response rendering, session lifecycle, and video recommendations.

- `src/hooks/useWorker.js`  
  Worker boot + model lifecycle + token streaming + session summary generation.

- `src/worker.js`  
  Initializes RunAnywhere in a Web Worker and downloads the local GGUF model.

- `src/hooks/useVectorDB.js`  
  Local memory system using:
  - `idb` for persisted sessions
  - `@xenova/transformers` embeddings (`all-MiniLM-L6-v2`)
  - cosine similarity retrieval for relevant past struggles

- `src/prompts.js`  
  Tutor behavior rules (Socratic constraints, Mermaid rules, video token contract).

### Run the root app

#### Prerequisites

- Node.js 18+ (recommended)
- npm

#### Steps

```bash
npm install
npm run dev
```

Open: `http://localhost:5173`

### Optional environment variables

Create `.env` with:

```env
VITE_YOUTUBE_API_KEY=your_api_key_here
```

Without this key, tutoring still works; only YouTube recommendations are disabled.

### Notes on first run

- First load downloads the local model and may take time.
- Subsequent runs are faster due to local caching.
- `vite.config.js` includes a plugin that copies required WASM runtime files into build output.

---

## 2) Fullstack Variant (`/math-solver`)

This version separates UI and solver API.

### Backend (`/math-solver/backend`)

- Framework: FastAPI
- Pipeline:
  1. Accept uploaded math image
  2. Convert image to base64
  3. Use **Ollama + LLaVA** to extract problem text
  4. Use **Ollama + Llama3** to generate structured step-by-step solution
  5. Parse into `problem`, `steps`, `answer`

#### Backend endpoints

- `GET /` - basic service info
- `GET /health` - checks Ollama and model availability
- `POST /api/solve` - multipart image upload
- `POST /api/solve/base64` - JSON base64 image input

### Frontend (`/math-solver/frontend`)

- React + Vite interface for drag/drop or camera capture.
- Calls `http://localhost:8000/api/solve`.
- Displays:
  - extracted text
  - interpreted problem
  - step-by-step solution
  - final answer

### Run fullstack variant

#### Prerequisites

- Python 3.10+
- Node.js 18+
- [Ollama](https://ollama.com/)

#### Setup Ollama models

```bash
ollama serve
ollama pull llava
ollama pull llama3
```

#### Run backend

```bash
cd math-solver/backend
pip install -r requirements.txt
python main.py
```

Backend runs on `http://localhost:8000`.

#### Run frontend

```bash
cd math-solver/frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`.

---

## How "working" is currently designed

- **Local-first behavior**:
  - Root app: local browser model inference + local memory.
  - Fullstack app: local Ollama-hosted models.
- **No required cloud LLM API key** for core solving/tutoring.
- **Image support** in both variants.
- **Stepwise tutoring/solving** outputs rather than opaque one-line responses.

---

## Troubleshooting

- **`Cannot connect to Ollama`**  
  Start Ollama:
  ```bash
  ollama serve
  ```

- **Model not available**  
  Pull missing models:
  ```bash
  ollama pull llava
  ollama pull llama3
  ```

- **Slow first launch in root app**  
  Expected: model download + local initialization.

- **No YouTube suggestions**  
  Set `VITE_YOUTUBE_API_KEY` in `.env`.

---

## Tech Stack

- React, Vite
- Web Workers
- RunAnywhere (`@runanywhere/web`, `@runanywhere/web-llamacpp`)
- `@xenova/transformers` embeddings
- IndexedDB (`idb`)
- FastAPI, Uvicorn, httpx, Pillow
- Ollama (`llava`, `llama3`)

---

## Important Repo Notes

- `.env` is ignored via `.gitignore` and should never be committed with secrets.
- `node_modules` and build output are ignored.


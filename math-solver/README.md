# MathLens — Local Math Solver
### No cloud. No OCR pipeline. Just upload → solve.

---

## How it works
- You upload/snap a photo of a math problem
- **LLaVA** (multimodal AI) runs locally via Ollama
- It reads the image AND solves the math in one shot
- No separate OCR step needed

---

## Setup (do this once)

### 1. Install Ollama
```bash
brew install ollama
```

### 2. Pull LLaVA model (~4GB)
```bash
ollama pull llava
```

### 3. Backend
```bash
cd backend
pip install -r requirements.txt
python main.py
# Runs on http://localhost:8000
```

### 4. Frontend
```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173
```

---

## Usage
1. Make sure Ollama is running: `ollama serve`
2. Start backend: `python backend/main.py`
3. Start frontend: `npm run dev` in frontend/
4. Open http://localhost:5173
5. Upload or snap a photo of any math problem
6. Hit **Solve** — solution appears in ~10-30 seconds

---

## Troubleshooting

**"Cannot connect to Ollama"**
```bash
ollama serve
```

**Model not found**
```bash
ollama pull llava
```

**Slow first run**
Normal — model loads into memory. Subsequent runs are faster.

**Want better accuracy?**
```bash
ollama pull llava:13b   # larger, more accurate, needs ~16GB RAM
```
Then change `MODEL_NAME = "llava:13b"` in `backend/main.py`

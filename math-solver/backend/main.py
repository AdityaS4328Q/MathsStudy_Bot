import os
import base64
import logging
import httpx
import io

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Math Solver API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OLLAMA_BASE_URL = "http://localhost:11434"
VISION_MODEL = "llava"        # Step 1: reads the image
SOLVER_MODEL = "llama3"       # Step 2: solves the math

EXTRACT_PROMPT = """Look at this image carefully.
Extract ONLY the mathematical problem text exactly as written.
Include ALL numbers, variables, operators, fractions, exponents, and equations.
Do NOT solve it. Just transcribe what you see as accurately as possible.
If there are multiple choice options, include them too."""

SOLVE_PROMPT = """You are an expert math tutor. Solve this problem step by step.

PROBLEM:
{problem}

Format your response EXACTLY like this:
PROBLEM: [restate the problem clearly]

SOLUTION:
Step 1: [first step with explanation]
Step 2: [next step]
... (as many steps as needed)

ANSWER: [final answer, be specific]

Be thorough and show all working."""


async def ollama_generate(model: str, prompt: str, image_b64: str = None) -> str:
    """Call Ollama generate endpoint."""
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.1,
            "num_predict": 1024,
        }
    }
    if image_b64:
        payload["images"] = [image_b64]

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json=payload
        )

    if response.status_code != 200:
        raise HTTPException(status_code=500, detail=f"Ollama error ({model}): {response.text}")

    return response.json().get("response", "").strip()


def image_to_base64(image_bytes: bytes) -> str:
    """Convert image bytes to base64."""
    image = Image.open(io.BytesIO(image_bytes))
    if image.mode != "RGB":
        image = image.convert("RGB")
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=95)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


async def extract_and_solve(img_b64: str) -> dict:
    """
    2-step pipeline:
    1. LLaVA reads the image and extracts the problem text
    2. Llama3 solves the extracted problem
    """

    # Step 1 — Vision: extract problem text from image
    logger.info(f"Step 1: Extracting problem with {VISION_MODEL}...")
    extracted = await ollama_generate(
        model=VISION_MODEL,
        prompt=EXTRACT_PROMPT,
        image_b64=img_b64
    )
    logger.info(f"Extracted problem: {extracted}")

    if not extracted:
        raise HTTPException(status_code=500, detail="Could not extract text from image")

    # Step 2 — Solver: solve the extracted problem
    logger.info(f"Step 2: Solving with {SOLVER_MODEL}...")
    solution = await ollama_generate(
        model=SOLVER_MODEL,
        prompt=SOLVE_PROMPT.format(problem=extracted),
    )
    logger.info("Solution generated")

    parsed = parse_solution(solution)
    parsed["extracted_text"] = extracted  # include what LLaVA saw
    return parsed


def parse_solution(text: str) -> dict:
    """Parse structured response into problem/steps/answer."""
    problem = ""
    steps = []
    answer = ""
    current_section = None

    for line in text.strip().split("\n"):
        line = line.strip()
        if not line:
            continue

        if line.startswith("PROBLEM:"):
            problem = line.replace("PROBLEM:", "").strip()
            current_section = "problem"
        elif line.startswith("SOLUTION:"):
            current_section = "solution"
        elif line.startswith("ANSWER:"):
            answer = line.replace("ANSWER:", "").strip()
            current_section = "answer"
        elif current_section == "solution":
            if line.lower().startswith("step "):
                steps.append(line)
            elif steps:
                steps[-1] += " " + line
            else:
                steps.append(line)
        elif current_section == "problem":
            problem += " " + line
        elif current_section == "answer":
            answer += " " + line

    if not problem and not steps and not answer:
        return {"problem": "See solution below", "steps": [text], "answer": ""}

    return {
        "problem": problem.strip(),
        "steps": steps,
        "answer": answer.strip()
    }


@app.get("/")
async def root():
    return {"message": "Math Solver API", "vision_model": VISION_MODEL, "solver_model": SOLVER_MODEL}


@app.get("/health")
async def health():
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            models = [m["name"] for m in r.json().get("models", [])]
            vision_ready = any(VISION_MODEL in m for m in models)
            solver_ready = any(SOLVER_MODEL in m for m in models)
            return {
                "status": "healthy",
                "ollama_running": True,
                "vision_model": {"name": VISION_MODEL, "ready": vision_ready},
                "solver_model": {"name": SOLVER_MODEL, "ready": solver_ready},
                "available_models": models,
            }
    except Exception:
        return {"status": "ollama_not_running", "ollama_running": False}


@app.post("/api/solve")
async def solve_math(file: UploadFile = File(...)):
    """Accept image file, extract problem, solve it."""
    try:
        contents = await file.read()
        img_b64 = image_to_base64(contents)
        result = await extract_and_solve(img_b64)
        return {"success": True, **result}

    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Cannot connect to Ollama. Run: `ollama serve`")
    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/solve/base64")
async def solve_math_base64(data: dict):
    """Accept base64 image, extract problem, solve it."""
    try:
        image_data = data.get("image", "")
        if not image_data:
            raise HTTPException(status_code=400, detail="No image provided")
        if "," in image_data:
            image_data = image_data.split(",")[1]

        result = await extract_and_solve(image_data)
        return {"success": True, **result}

    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Cannot connect to Ollama. Run: `ollama serve`")
    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")

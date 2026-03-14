"""
MindMap Backend - FastAPI server with Gemini image generation.
Same pattern as seo-academy project.
"""
import os
import base64
import json
import io
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

ENV_PATH = Path(__file__).parent / ".env"
load_dotenv(ENV_PATH)

app = FastAPI(title="MindMap API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Data persistence ---
DATA_FILE = Path(__file__).parent / "mindmap_data.json"

def load_data():
    if DATA_FILE.exists():
        with open(DATA_FILE, "r") as f:
            return json.load(f)
    return get_default_data()

def save_data(data):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)

def get_default_data():
    return {
        "nodes": [
            {"id": "root", "label": "My Life", "type": "root", "x": 0, "y": 0, "image": None},
            {"id": "freelance", "label": "Freelancing", "type": "category", "x": -300, "y": -150, "image": None, "color": "#6C63FF"},
            {"id": "projects", "label": "Personal Projects", "type": "category", "x": 300, "y": -150, "image": None, "color": "#FF6584"},
            {"id": "learning", "label": "Learning", "type": "category", "x": 0, "y": 250, "image": None, "color": "#00C9A7"},
            {"id": "f1", "label": "Web Development", "type": "item", "x": -500, "y": -300, "image": None, "parent": "freelance"},
            {"id": "f2", "label": "Design", "type": "item", "x": -450, "y": -50, "image": None, "parent": "freelance"},
            {"id": "f3", "label": "Consulting", "type": "item", "x": -200, "y": -350, "image": None, "parent": "freelance"},
            {"id": "p1", "label": "App Ideas", "type": "item", "x": 450, "y": -300, "image": None, "parent": "projects"},
            {"id": "p2", "label": "Open Source", "type": "item", "x": 500, "y": -50, "image": None, "parent": "projects"},
            {"id": "l1", "label": "New Skills", "type": "item", "x": -150, "y": 400, "image": None, "parent": "learning"},
            {"id": "l2", "label": "Certifications", "type": "item", "x": 150, "y": 400, "image": None, "parent": "learning"},
        ],
        "edges": [
            {"from": "root", "to": "freelance"},
            {"from": "root", "to": "projects"},
            {"from": "root", "to": "learning"},
            {"from": "freelance", "to": "f1"},
            {"from": "freelance", "to": "f2"},
            {"from": "freelance", "to": "f3"},
            {"from": "projects", "to": "p1"},
            {"from": "projects", "to": "p2"},
            {"from": "learning", "to": "l1"},
            {"from": "learning", "to": "l2"},
        ]
    }

# --- Gemini integration (same pattern as seo-academy) ---
def get_gemini_model(model_name="gemini-2.0-flash"):
    """Initialize Google Gemini model."""
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None
    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        return genai.GenerativeModel(model_name)
    except Exception as e:
        print(f"Failed to initialize Gemini: {e}")
        return None

# --- Image cache ---
IMAGES_DIR = Path(__file__).parent / "generated_images"
IMAGES_DIR.mkdir(exist_ok=True)

# --- Pydantic models ---
class NodeUpdate(BaseModel):
    id: str
    label: str | None = None
    x: float | None = None
    y: float | None = None
    type: str | None = None
    color: str | None = None
    parent: str | None = None

class NodeCreate(BaseModel):
    label: str
    type: str = "item"
    parent: str | None = None
    x: float = 0
    y: float = 0
    color: str | None = None

class EdgeCreate(BaseModel):
    source: str
    target: str

class ImageGenRequest(BaseModel):
    node_id: str
    prompt: str | None = None

class MindmapData(BaseModel):
    nodes: list
    edges: list

# --- API Routes ---

@app.get("/api/mindmap")
async def get_mindmap():
    return load_data()

@app.post("/api/mindmap")
async def save_mindmap(data: MindmapData):
    save_data({"nodes": data.nodes, "edges": data.edges})
    return {"status": "ok"}

@app.post("/api/node")
async def create_node(node: NodeCreate):
    data = load_data()
    import uuid
    new_id = f"node_{uuid.uuid4().hex[:8]}"
    new_node = {
        "id": new_id,
        "label": node.label,
        "type": node.type,
        "x": node.x,
        "y": node.y,
        "image": None,
        "parent": node.parent,
        "color": node.color,
    }
    data["nodes"].append(new_node)
    if node.parent:
        data["edges"].append({"from": node.parent, "to": new_id})
    save_data(data)
    return new_node

@app.put("/api/node")
async def update_node(node: NodeUpdate):
    data = load_data()
    for n in data["nodes"]:
        if n["id"] == node.id:
            if node.label is not None: n["label"] = node.label
            if node.x is not None: n["x"] = node.x
            if node.y is not None: n["y"] = node.y
            if node.type is not None: n["type"] = node.type
            if node.color is not None: n["color"] = node.color
            break
    save_data(data)
    return {"status": "ok"}

@app.delete("/api/node/{node_id}")
async def delete_node(node_id: str):
    data = load_data()
    # Remove node and all child nodes
    ids_to_remove = {node_id}
    changed = True
    while changed:
        changed = False
        for e in data["edges"]:
            if e["from"] in ids_to_remove and e["to"] not in ids_to_remove:
                ids_to_remove.add(e["to"])
                changed = True
    data["nodes"] = [n for n in data["nodes"] if n["id"] not in ids_to_remove]
    data["edges"] = [e for e in data["edges"] if e["from"] not in ids_to_remove and e["to"] not in ids_to_remove]
    save_data(data)
    return {"status": "ok"}

@app.post("/api/generate-image")
async def generate_image(req: ImageGenRequest):
    """Generate an illustration for a node using Gemini Flash Preview."""
    data = load_data()
    node = next((n for n in data["nodes"] if n["id"] == req.node_id), None)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    label = node["label"]
    prompt = req.prompt or f"Create a beautiful, minimal, flat-design icon illustration for the concept: '{label}'. Use soft gradients, modern colors, clean shapes. No text. Square format, white background."

    model = get_gemini_model("gemini-2.0-flash-preview-image-generation")
    if not model:
        raise HTTPException(status_code=500, detail="Gemini not configured. Set GOOGLE_API_KEY in backend/.env")

    try:
        response = model.generate_content(
            prompt,
            generation_config={"response_mime_type": "image/png"}
        )

        # Extract image from response
        image_data = None
        if response.candidates:
            for part in response.candidates[0].content.parts:
                if hasattr(part, 'inline_data') and part.inline_data:
                    image_data = part.inline_data.data
                    break

        if not image_data:
            raise HTTPException(status_code=500, detail="No image generated")

        # Save to disk
        img_path = IMAGES_DIR / f"{req.node_id}.png"
        if isinstance(image_data, str):
            img_bytes = base64.b64decode(image_data)
        else:
            img_bytes = image_data
        with open(img_path, "wb") as f:
            f.write(img_bytes)

        # Update node
        for n in data["nodes"]:
            if n["id"] == req.node_id:
                n["image"] = f"/api/images/{req.node_id}.png"
                break
        save_data(data)

        b64 = base64.b64encode(img_bytes).decode()
        return {"status": "ok", "image_url": f"/api/images/{req.node_id}.png", "image_base64": b64}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image generation failed: {str(e)}")

@app.get("/api/images/{filename}")
async def serve_image(filename: str):
    img_path = IMAGES_DIR / filename
    if not img_path.exists():
        raise HTTPException(status_code=404)
    return FileResponse(img_path, media_type="image/png")

# Serve frontend
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

@app.get("/")
async def serve_index():
    return FileResponse(FRONTEND_DIR / "index.html")

app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

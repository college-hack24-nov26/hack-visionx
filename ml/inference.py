"""
inference.py - Food Waste Saver (HA040) local food-photo inference service.

Serves three vision models on port 8001:
  - primary:    dima806/indian_food_image_detection (public ViT, 80 dishes)
  - specialist: therealcyberlord/vit-indian-food (public ViT, 15 dishes),
    consulted only when the primary is unsure, featured only at >= 0.90
  - gap:        our own classifier trained in-window (ml/train_gap.py) for
    idli / samosa / misal pav - dishes neither public model knows. It runs
    on every photo and wins at >= 0.90 for its own dishes only, because a
    confident answer from a closed-vocabulary model about a dish outside
    its vocabulary is a forced guess, not evidence.

Scores from different models are never blended; each model is trusted
only inside the rule above.
"""
import io
import os

import torch
import uvicorn
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForImageClassification

PRIMARY_ID = "dima806/indian_food_image_detection"
SPECIALIST_ID = "therealcyberlord/vit-indian-food"
GAP_PATH = os.environ.get("GAP_MODEL", r"D:\Chrome_Downloads\fws-train\gap_model_event")
GAP_LABELS = {"idli", "samosa", "misal_pav"}
GAP_BAR = 0.90
SPECIALIST_BAR = 0.90
UNCERTAIN = 0.50
# Below this, the primary's top pick is a forced guess from a food-only
# vocabulary - that is how non-food photos got dish names. We return no
# featured answer instead, and the app asks the donor to type the name.
FLOOR = 0.35

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

app = FastAPI(title="Food Waste Saver inference")
MODELS = {}


def load_model(key, source):
    try:
        try:
            processor = AutoImageProcessor.from_pretrained(source)
        except Exception:
            # Some public checkpoints ship a broken preprocessor config
            # (therealcyberlord/vit-indian-food has no image_processor_type).
            # Fall back to the primary model's processor - same ViT input
            # pipeline (224px, same normalisation), so it is a safe stand-in.
            if MODELS.get("primary"):
                processor = MODELS["primary"][0]
                print(f"[inference] {key}: reusing the primary image processor")
            else:
                raise
        model = AutoModelForImageClassification.from_pretrained(source)
        model.to(DEVICE)
        model.eval()
        MODELS[key] = (processor, model)
        print(f"[inference] loaded {key} from {source}")
    except Exception as e:
        MODELS[key] = None
        print(f"[inference] FAILED to load {key} ({source}): {e}")


@app.on_event("startup")
def startup():
    load_model("primary", PRIMARY_ID)
    load_model("specialist", SPECIALIST_ID)
    if GAP_PATH and os.path.isdir(GAP_PATH):
        load_model("gap", GAP_PATH)
    else:
        MODELS["gap"] = None
        print(f"[inference] gap model not found at {GAP_PATH} - continuing without it")


def predict_top(processor, model, image, k=3):
    inputs = processor(images=image, return_tensors="pt").to(DEVICE)
    with torch.no_grad():
        logits = model(**inputs).logits
    probs = torch.softmax(logits, dim=1)[0]
    top = torch.topk(probs, min(k, probs.shape[0]))
    return [
        {"label": model.config.id2label[idx], "confidence": round(score, 4)}
        for score, idx in zip(top.values.tolist(), top.indices.tolist())
    ]


@app.get("/health")
def health():
    loaded = {k: v is not None for k, v in MODELS.items()}
    return {"ok": any(loaded.values()), "device": DEVICE, "models": loaded}


@app.post("/predict")
def predict(file: UploadFile = File(...)):
    if not any(v is not None for v in MODELS.values()):
        return JSONResponse(status_code=503, content={"error": "No models available"})
    try:
        raw = file.file.read()
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception:
        return JSONResponse(status_code=400, content={"error": "That file is not a readable image"})

    # 1) Gap model first - it runs on every photo.
    if MODELS.get("gap"):
        gap_top = predict_top(*MODELS["gap"], image, k=1)[0]
        if gap_top["label"] in GAP_LABELS and gap_top["confidence"] >= GAP_BAR:
            alts = []
            if MODELS.get("primary"):
                alts = [{**a, "source": "primary"} for a in predict_top(*MODELS["primary"], image, k=2)]
            return {"featured": {**gap_top, "source": "gap"}, "alternatives": alts}

    # 2) Primary model.
    if not MODELS.get("primary"):
        return JSONResponse(status_code=503, content={"error": "Primary model unavailable"})
    primary_top = predict_top(*MODELS["primary"], image, k=3)
    best = primary_top[0]

    # 3) Specialist only when the primary is unsure.
    if best["confidence"] < UNCERTAIN and MODELS.get("specialist"):
        spec_top = predict_top(*MODELS["specialist"], image, k=1)[0]
        if spec_top["confidence"] >= SPECIALIST_BAR:
            return {
                "featured": {**spec_top, "source": "specialist"},
                "alternatives": [{**a, "source": "primary"} for a in primary_top],
            }

    # 4) Confidence floor: never present a low-confidence guess as the
    # answer. The client shows "couldn't recognize" and the donor types
    # the name - an honest miss beats a confident wrong dish.
    if best["confidence"] < FLOOR:
        return {
            "featured": None,
            "uncertain": True,
            "alternatives": [{**a, "source": "primary"} for a in primary_top],
        }

    return {
        "featured": {**best, "source": "primary"},
        "alternatives": [{**a, "source": "primary"} for a in primary_top[1:]],
    }


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8001)


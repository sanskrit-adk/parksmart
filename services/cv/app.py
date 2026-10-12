"""ParkSmart spot-detection service (YOLOv8 + FastAPI).

POST /detect  multipart:
  image            JPEG/PNG/WebP (required)
  expected_spaces  int, optional  - total bays in view; used when no layout is given
  layout           JSON, optional - [[x, y, w, h], ...] normalized bay rectangles
Returns: { boxes, free_count, occupied_count, width, height, model }
"""

from __future__ import annotations

import io
import json
import os
import secrets

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from spots import Box, count_spaces

MODEL_NAME = os.getenv("YOLO_MODEL", "yolov8n.pt")
TOKEN = os.getenv("CV_SERVICE_TOKEN", "")
CONF = float(os.getenv("YOLO_CONFIDENCE", "0.3"))
MAX_BYTES = 10 * 1024 * 1024
# COCO classes that occupy a parking space.
VEHICLE_CLASSES = {2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}

app = FastAPI(title="ParkSmart CV", version="1.0.0")
_model = None


def model():
    global _model
    if _model is None:
        from ultralytics import YOLO  # imported lazily so /health is instant

        _model = YOLO(MODEL_NAME)
    return _model


def auth(authorization: str | None = Header(default=None)) -> None:
    if not TOKEN:
        return
    expected = f"Bearer {TOKEN}"
    if not authorization or not secrets.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Invalid token")


@app.get("/health")
def health() -> dict:
    return {"ok": True, "model": MODEL_NAME}


@app.post("/detect", dependencies=[Depends(auth)])
async def detect(
    image: UploadFile = File(...),
    expected_spaces: int | None = Form(default=None),
    layout: str | None = Form(default=None),
) -> dict:
    data = await image.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image must be under 10 MB")
    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
    except UnidentifiedImageError:
        raise HTTPException(status_code=415, detail="Unsupported image")

    bays = None
    if layout:
        try:
            bays = [tuple(float(v) for v in b[:4]) for b in json.loads(layout)]
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="layout must be JSON [[x,y,w,h], ...]")

    width, height = img.size
    result = model().predict(img, conf=CONF, verbose=False)[0]
    vehicles: list[Box] = []
    for xyxy, cls, conf in zip(result.boxes.xyxy.tolist(), result.boxes.cls.tolist(), result.boxes.conf.tolist()):
        if int(cls) not in VEHICLE_CLASSES:
            continue
        x1, y1, x2, y2 = xyxy
        vehicles.append(Box(x1 / width, y1 / height, (x2 - x1) / width, (y2 - y1) / height, "occupied", float(conf)))

    counts = count_spaces(vehicles, layout=bays, expected_spaces=expected_spaces)
    return {**counts, "width": width, "height": height, "model": MODEL_NAME.replace(".pt", "")}

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# CPU-only PyTorch keeps the image ~1.5 GB smaller than the CUDA build.
RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app.py spots.py ./
# Bake the YOLOv8n weights into the image so cold starts don't download them.
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"

RUN useradd --create-home appuser && chown -R appuser /app
USER appuser

EXPOSE 8000
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]

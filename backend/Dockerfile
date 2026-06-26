FROM python:3.12-slim

WORKDIR /app

# Minimal build deps (most wheels are prebuilt; gcc is a safety net).
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install CPU-only PyTorch FIRST from the dedicated index. The default PyPI
# torch wheel bundles ~2.5GB of CUDA libraries we never use on a shared CPU VM,
# which would blow past the image/memory budget. torch==2.5.1 is then already
# satisfied when the rest of requirements.txt is resolved.
RUN pip install --no-cache-dir torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt

# Copy application code (includes models/ctgan_final.pth and data/ reference).
COPY . .

RUN mkdir -p /app/models

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

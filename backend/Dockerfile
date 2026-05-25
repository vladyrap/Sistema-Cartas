FROM python:3.13-slim

WORKDIR /app

# Dependencias del sistema necesarias para psycopg2-binary + healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Layer-cache friendly: copiar requirements primero
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

# Usuario no-root para ejecución
RUN useradd -m -u 1000 elite && chown -R elite:elite /app
USER elite

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

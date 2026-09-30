FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source and static build
COPY src/ /app/src/
COPY static/ /app/static/

ENV PYTHONPATH=/app/src
ENV PORT=8000

EXPOSE 8000

CMD ["uvicorn", "hkbu_gateway.app:app", "--host", "0.0.0.0", "--port", "8000"]

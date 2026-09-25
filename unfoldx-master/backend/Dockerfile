FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY app ./app
COPY schema ./schema
RUN useradd -m uaw && mkdir -p /srv/data && chown -R uaw /srv
USER uaw
EXPOSE 8000
# Provider CLIs (bob, claude, codex, gemini) are NOT baked in: extend this image or mount them, else simulation is used.
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]

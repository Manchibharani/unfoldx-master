FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv

# Node.js 24+ is required by IBM Bob Shell. Codex CLI is installed via npm.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && curl -fsSL https://bob.ibm.com/download/bobshell.sh | bash \
    && npm install -g @openai/codex \
    && command -v bob \
    && command -v codex \
    && bob --version \
    && codex --version \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt
COPY app ./app
COPY schema ./schema
RUN useradd -m uaw && mkdir -p /srv/data && chown -R uaw /srv
USER uaw
EXPOSE 8000
# Bob Shell and OpenAI Codex CLI are installed in the image. Other provider CLIs
# still fall back to simulation when ALLOW_SIMULATION=1.
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]

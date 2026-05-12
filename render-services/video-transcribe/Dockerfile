# Dockerfile for cooked video-transcribe Render service.
#
# Purpose: receives a TikTok/Instagram URL, downloads the video via
# yt-dlp, extracts audio with ffmpeg, sends to OpenAI Whisper, and
# returns the transcript text. Used by the Cloudflare Worker's
# /extract-from-social route as Phase 2 of the social-import feature
# when caption/POI fallback returns no usable signal.
#
# Why a Dockerfile (not Render's native Python runtime): yt-dlp
# requires ffmpeg to extract audio, and Render's Python runtime
# doesn't include ffmpeg by default. Installing it via apt during
# build is the cleanest path.

FROM python:3.11-slim

# ffmpeg is required by yt-dlp for the -x (extract-audio) step.
# ca-certificates so yt-dlp's HTTPS to TikTok works inside the slim image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

# Render injects PORT at runtime. --timeout 180 because video download
# + Whisper transcription can take 30-60s for longer clips; 30s default
# would kill the worker mid-transcribe.
CMD gunicorn -w 2 -b 0.0.0.0:$PORT app:app --timeout 180 --access-logfile -

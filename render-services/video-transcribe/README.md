# cooked-video-transcribe

Tiny Render service that powers Phase 2 of the social-import feature.
Takes a TikTok/Instagram URL, downloads the video with yt-dlp, extracts
audio with ffmpeg, sends it to OpenAI Whisper, and returns the
transcript. The Cloudflare Worker calls this when the caption/POI
fallback in `/extract-from-social` returns no usable signal.

## API

`POST /transcribe`

```
Headers:
  Content-Type: application/json
  X-Shared-Secret: <SHARED_SECRET env value>

Body:
  { "url": "https://www.tiktok.com/@user/video/123..." }

Response 200:
  {
    "transcript": "This is Sushi by Bou in midtown...",
    "duration_s": 23,
    "title": "best omakase in nyc",
    "uploader": "foodietok",
    "description": "...",
    "thumbnail": "https://...",
    "elapsed_s": 12.4
  }
```

`GET /health` → liveness check, also reports whether env vars are wired.

## Deploy to Render

1. Push the `render-services/video-transcribe/` folder to GitHub (already
   in the cooked repo).
2. In Render dashboard → **New +** → **Web Service**.
3. Connect the `Luginator33/cooked` repo.
4. Settings:
   - **Name**: `cooked-video-transcribe`
   - **Region**: same as your other Render services
   - **Branch**: `main`
   - **Root Directory**: `render-services/video-transcribe`
   - **Runtime**: Docker (auto-detected from Dockerfile)
   - **Plan**: Starter ($7/mo) — Free tier sleeps after 15 min idle
     which adds a 30s cold-start to every first-of-day extract.
5. Environment variables:
   - `OPENAI_API_KEY` → your key from platform.openai.com
   - `SHARED_SECRET` → any long random string. Generate with
     `openssl rand -hex 32`. Save this — you'll paste it into
     Cloudflare too.
6. Click **Create Web Service**. First build takes ~3-5 minutes
   (installing ffmpeg + yt-dlp).
7. After deploy, hit `https://cooked-video-transcribe.onrender.com/health`
   to confirm `openai_configured: true` and `secret_configured: true`.

## Wire up the Worker

In Cloudflare dashboard → cooked-proxy → Settings → Environment Variables:
- `TRANSCRIBE_SERVICE_URL` → `https://cooked-video-transcribe.onrender.com`
- `TRANSCRIBE_SHARED_SECRET` → same value as `SHARED_SECRET` on Render

Then redeploy the Worker code.

## Cost expectations

- Render Starter: $7/mo flat
- OpenAI Whisper: ~$0.006 per minute of audio. Typical TikTok = $0.003.
- At 100 user finds/month: total ~$7.30
- At 1000 user finds/month: total ~$10

## Why a separate service (and not in the Worker)?

Cloudflare Workers:
- Can't run subprocesses → no yt-dlp
- 50MB request body limit → can't reliably proxy video bytes
- 30s wall-clock limit on free plan → Whisper alone can take that long
- No native multipart-form file upload helper

Splitting them keeps the Worker fast and stateless for the hot
metadata-extraction path, and shifts the heavy work to a dyno that's
spec'd for it.

"""
cooked-video-transcribe — Render web service.

Endpoint: POST /transcribe
Input:  { "url": "https://www.tiktok.com/@user/video/123..." }
Output: { "transcript": "...", "duration_s": 23.4, "title": "...", "uploader": "..." }
Auth:   X-Shared-Secret header must match the SHARED_SECRET env var.

Architecture (revised after first end-to-end test):
  TikTok blocks Render's data center IPs from accessing posts directly
  via yt-dlp. So we use TikWM (https://www.tikwm.com) — a free public
  scraper API with its own proxy network — to resolve the post into a
  direct CDN URL for the MP4 video (or photo-carousel music track),
  then download THAT (CDN serves any IP), extract audio with ffmpeg,
  send to OpenAI Whisper, return the transcript.

  yt-dlp is kept around purely as a fallback for non-TikTok URLs
  (Instagram, YouTube Shorts) where TikWM doesn't help.

Cost notes:
  - Render Starter dyno: $7/mo flat
  - OpenAI Whisper API (whisper-1): $0.006 per minute of audio.
    Typical 30s TikTok = $0.003. 100 finds/month = $0.30.
  - TikWM: free (rate limits vague; degrade to yt-dlp on failure)

Failure modes we handle:
  - TikWM unreachable / rate-limited → fall back to yt-dlp
  - yt-dlp blocked by TikTok IP filter → surface clean error
  - MP4 download failure                → surface HTTP status
  - Audio > 25MB Whisper ceiling        → ffmpeg downsamples first
  - Whisper rate limit / 5xx            → passthrough error
"""

import os
import re
import json
import subprocess
import tempfile
import time
import traceback
from urllib.parse import urlparse, urlencode
from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
SHARED_SECRET = os.environ.get("SHARED_SECRET", "").strip()

WHISPER_MAX_BYTES = 25 * 1024 * 1024
MAX_DURATION_SECONDS = 360
TIKWM_API = "https://www.tikwm.com/api/"


# Belt-and-suspenders: any uncaught exception (subprocess crash, OOM
# kill mid-Whisper-upload, etc.) gets turned into a JSON 500 with the
# actual message so the caller sees what blew up. Without this,
# gunicorn returns a generic HTML 502 that swallows the cause.
@app.errorhandler(Exception)
def _handle_uncaught(e):
    print(f"[uncaught] {type(e).__name__}: {e}\n{traceback.format_exc()}", flush=True)
    return jsonify({"error": f"{type(e).__name__}: {e}"}), 500


def _auth_ok(req):
    """Constant-time-ish compare on the shared secret header."""
    provided = req.headers.get("X-Shared-Secret", "").strip()
    if not SHARED_SECRET or not provided:
        return False
    return provided == SHARED_SECRET


# ── Source resolvers ────────────────────────────────────────

def _tikwm_resolve(url):
    """Hit TikWM's public API. Returns dict on success, raises on
    failure (caller decides whether to fall back to yt-dlp).

    Returned shape (subset of TikWM's response):
      {
        "media_url":    string (direct CDN URL — MP4 for videos,
                                 MP3-ish for photos),
        "is_video":     bool,
        "duration":     int (seconds; 0 for photos),
        "title":        string (full caption with hashtags),
        "uploader":     string (TikTok handle),
        "thumbnail":    string (cover URL),
        "image_urls":   list (photo carousel images, in display order;
                              empty for videos),
      }
    """
    try:
        r = requests.get(
            TIKWM_API,
            params={"url": url},
            timeout=25,
            headers={"User-Agent": "Mozilla/5.0 (cooked-bot)"},
        )
    except requests.RequestException as e:
        raise RuntimeError(f"tikwm request failed: {e}")
    if not r.ok:
        raise RuntimeError(f"tikwm HTTP {r.status_code}: {r.text[:200]}")
    payload = r.json()
    if payload.get("code") != 0:
        raise RuntimeError(f"tikwm error: {payload.get('msg', 'unknown')}")
    d = payload.get("data") or {}
    is_video = bool(d.get("play"))  # photo carousels have play=null, music=URL
    media_url = d.get("play") or d.get("music") or ""
    if not media_url:
        raise RuntimeError("tikwm returned no playable media URL")
    # Photo carousels — TikWM returns the slideshow images as URLs.
    # These are the same CDN URLs the TikTok app uses, so they work
    # from any IP. Claude can fetch them directly via the vision API.
    images = d.get("images") or []
    if isinstance(images, list):
        image_urls = [u for u in images if isinstance(u, str) and u.startswith("http")]
    else:
        image_urls = []
    return {
        "media_url": media_url,
        "is_video": is_video,
        "duration": d.get("duration") or 0,
        "title": d.get("title") or "",
        "uploader": (d.get("author") or {}).get("unique_id")
                    or (d.get("author") or {}).get("nickname")
                    or "",
        "thumbnail": d.get("cover") or d.get("origin_cover") or "",
        "image_urls": image_urls,
    }


def _ytdlp_resolve(url):
    """Fallback for non-TikTok URLs (Instagram, etc.). Yes, this hits
    the same IP-blocking wall on TikTok, but for IG it works."""
    proc = subprocess.run(
        ["yt-dlp", "--dump-json", "--no-warnings", "--no-playlist",
         "--socket-timeout", "20", url],
        capture_output=True, text=True, timeout=30,
    )
    if proc.returncode != 0:
        tail = "\n".join((proc.stderr or "").splitlines()[-3:])
        raise RuntimeError(f"yt-dlp failed: {tail}")
    m = json.loads(proc.stdout)
    return {
        "media_url": m.get("url") or "",
        "is_video": True,
        "duration": m.get("duration") or 0,
        "title": m.get("title") or m.get("description") or "",
        "uploader": m.get("uploader") or m.get("uploader_id") or "",
        "thumbnail": m.get("thumbnail") or "",
        "image_urls": [],
    }


def _resolve_post(url):
    """Pick the best resolver for this URL. TikTok → TikWM. Anything
    else → yt-dlp. If TikWM fails on a TikTok URL, fall back to yt-dlp
    (which will probably also fail, but the error message is useful)."""
    is_tiktok = "tiktok.com" in url.lower()
    if is_tiktok:
        try:
            return _tikwm_resolve(url), "tikwm"
        except RuntimeError as e:
            print(f"[resolve] tikwm fail, falling back to yt-dlp: {e}", flush=True)
            try:
                return _ytdlp_resolve(url), "yt-dlp"
            except Exception as e2:
                # Re-raise the TikWM error since it ran first.
                raise RuntimeError(f"tikwm: {e} | yt-dlp: {e2}")
    else:
        return _ytdlp_resolve(url), "yt-dlp"


# ── Audio pipeline ──────────────────────────────────────────

def _download_to_temp(media_url, dest_path):
    """Stream the CDN media file to disk. Doesn't try to be clever
    about format — ffmpeg will figure it out next."""
    try:
        with requests.get(media_url, stream=True, timeout=60,
                          headers={"User-Agent": "Mozilla/5.0 (cooked-bot)"}) as r:
            r.raise_for_status()
            with open(dest_path, "wb") as f:
                for chunk in r.iter_content(1024 * 256):
                    if chunk:
                        f.write(chunk)
    except requests.RequestException as e:
        raise RuntimeError(f"media download failed: {e}")
    if not os.path.exists(dest_path) or os.path.getsize(dest_path) == 0:
        raise RuntimeError("downloaded media is empty")


def _ffmpeg_extract_frames(src, dst_dir, n_frames=5, max_w=720):
    """Sample `n_frames` evenly-spaced JPG frames from a video. Used
    to OCR on-screen text / restaurant signs / overlay captions when
    the voiceover alone isn't enough.

    - 720px max width keeps each frame ~50-100KB (Claude vision happily
      reads at this res; bigger = more tokens, no quality win).
    - JPEG quality 5 is ffmpeg's "decent web" level — readable text,
      not bloated.
    - Returns list of file paths in chronological order.
    """
    # Probe duration so we can pick timestamps.
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", src],
        capture_output=True, text=True, timeout=15,
    )
    try:
        duration = float((probe.stdout or "").strip())
    except (ValueError, TypeError):
        duration = 0.0
    if duration <= 0:
        # Can't probe duration — just sample one frame at the start.
        timestamps = [0.5]
    else:
        # Skip the first half-second and last half-second (often dark
        # frames or transitions). Distribute evenly in between.
        if duration <= 2:
            timestamps = [duration / 2]
        else:
            start, end = 0.5, max(duration - 0.5, 1.0)
            if n_frames == 1:
                timestamps = [(start + end) / 2]
            else:
                step = (end - start) / (n_frames - 1)
                timestamps = [start + step * i for i in range(n_frames)]

    paths = []
    for i, ts in enumerate(timestamps):
        out = os.path.join(dst_dir, f"frame_{i:02d}.jpg")
        proc = subprocess.run(
            [
                "ffmpeg", "-y",
                "-ss", f"{ts:.2f}",      # seek before -i = fast seek
                "-i", src,
                "-vframes", "1",
                "-vf", f"scale='min({max_w},iw)':-2",
                "-q:v", "5",
                "-loglevel", "error",
                out,
            ],
            capture_output=True, text=True, timeout=20,
        )
        if proc.returncode == 0 and os.path.exists(out) and os.path.getsize(out) > 0:
            paths.append(out)
        # Soft-fail any single frame — partial coverage is still useful.
    return paths


def _file_to_base64(path):
    """Read a small binary file and return its base64 content. Used
    to inline frames into the JSON response since Render's filesystem
    is ephemeral and we have no upload destination."""
    import base64
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("ascii")


def _ffmpeg_to_mp3(src, dst, max_bytes=WHISPER_MAX_BYTES):
    """Re-encode anything to a Whisper-friendly mp3. -ac 1 mono,
    -ar 16000 (Whisper's native sample rate, smaller files), bitrate
    32k (plenty for speech). Output stays well under Whisper's 25MB
    cap for any reasonable clip length."""
    proc = subprocess.run(
        [
            "ffmpeg",
            "-y",                # overwrite
            "-i", src,
            "-vn",               # drop video stream
            "-ac", "1",          # mono
            "-ar", "16000",      # 16 kHz
            "-b:a", "32k",       # 32 kbps
            "-loglevel", "error",
            dst,
        ],
        capture_output=True, text=True, timeout=60,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {proc.stderr[:300]}")
    if not os.path.exists(dst):
        raise RuntimeError("ffmpeg produced no output")
    size = os.path.getsize(dst)
    if size > max_bytes:
        raise RuntimeError(f"audio too large after re-encode: {size} > {max_bytes}")


def _whisper_transcribe(audio_path):
    """Send mp3 to OpenAI Whisper."""
    with open(audio_path, "rb") as f:
        resp = requests.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
            files={"file": ("audio.mp3", f, "audio/mpeg")},
            data={
                "model": "whisper-1",
                "language": "en",
                "response_format": "json",
                # Prompt biases Whisper toward food vocab — helps it
                # spell restaurant names correctly. Last ~224 tokens
                # used as context.
                "prompt": (
                    "Restaurant name, address, neighborhood, cuisine, "
                    "food, menu. Examples: Sushi by Bou, Carbone, "
                    "L'Antica Pizzeria, Gjelina, Nobu, Eleven Madison "
                    "Park, Tartine."
                ),
            },
            timeout=120,
        )
    if not resp.ok:
        raise RuntimeError(f"whisper HTTP {resp.status_code}: {resp.text[:200]}")
    return resp.json().get("text", "").strip()


# ── Routes ──────────────────────────────────────────────────

@app.route("/transcribe", methods=["POST"])
def transcribe():
    t0 = time.time()
    if not OPENAI_API_KEY:
        return jsonify({"error": "OPENAI_API_KEY not configured on server"}), 500
    if not _auth_ok(request):
        return jsonify({"error": "unauthorized"}), 401

    body = request.get_json(silent=True) or {}
    url = (body.get("url") or "").strip()
    if not url:
        return jsonify({"error": "url required"}), 400

    # 1. Resolve post → direct CDN URL + metadata
    try:
        info, source = _resolve_post(url)
    except Exception as e:
        return jsonify({"error": f"could not read post: {e}"}), 502

    if info["duration"] and info["duration"] > MAX_DURATION_SECONDS:
        return jsonify({
            "error": f"video too long ({info['duration']}s > {MAX_DURATION_SECONDS}s)",
            "title": info["title"],
        }), 413

    # 2. Download → ffmpeg → Whisper → frames
    transcript = ""
    transcribe_err = None
    frames_b64 = []  # video: extracted via ffmpeg, base64 inline
    image_urls = info.get("image_urls") or []  # photo carousel: pass-through CDN URLs
    with tempfile.TemporaryDirectory() as tmpdir:
        src_path = os.path.join(tmpdir, "src.bin")
        mp3_path = os.path.join(tmpdir, "audio.mp3")
        try:
            _download_to_temp(info["media_url"], src_path)
        except Exception as e:
            return jsonify({"error": f"download failed: {e}"}), 502

        # Audio path — soft-fail if no speech, we still want vision data.
        try:
            _ffmpeg_to_mp3(src_path, mp3_path)
            transcript = _whisper_transcribe(mp3_path)
        except Exception as e:
            transcribe_err = str(e)
            print(f"[transcribe] audio path failed (continuing): {e}", flush=True)

        # Vision path — extract frames ONLY for videos. Photo carousels
        # already have image_urls populated from TikWM.
        if info.get("is_video") and not image_urls:
            try:
                frame_paths = _ffmpeg_extract_frames(src_path, tmpdir, n_frames=5)
                frames_b64 = [
                    {"media_type": "image/jpeg", "data": _file_to_base64(p)}
                    for p in frame_paths
                ]
                print(f"[transcribe] extracted {len(frames_b64)} frames", flush=True)
            except Exception as e:
                print(f"[transcribe] frame extraction failed: {e}", flush=True)
                # Soft-fail — we still have the transcript.

    # If both audio AND vision failed completely, the post is unreadable.
    if transcribe_err and not frames_b64 and not image_urls:
        return jsonify({
            "error": f"could not extract anything usable: {transcribe_err}",
        }), 502

    elapsed = round(time.time() - t0, 2)
    return jsonify({
        "transcript": transcript or "",
        "transcribe_error": transcribe_err,  # null on success
        "frames": frames_b64,                # video: base64 frames
        "image_urls": image_urls,            # photo carousel: TikTok CDN URLs
        "duration_s": info["duration"],
        "title": info["title"],
        "uploader": info["uploader"],
        # yt-dlp/tikwm "description" — usually same as title on TikTok.
        "description": info["title"],
        "thumbnail": info["thumbnail"],
        "is_video": info.get("is_video", True),
        "source": source,
        "elapsed_s": elapsed,
    })


@app.route("/", methods=["GET"])
@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "ok": True,
        "service": "cooked-video-transcribe",
        "openai_configured": bool(OPENAI_API_KEY),
        "secret_configured": bool(SHARED_SECRET),
    })


@app.route("/debug-pipeline", methods=["POST"])
def debug_pipeline():
    """End-to-end pipeline trace, SKIPPING Whisper (to keep it free).
    Returns timing + intermediate state for each step so we can see
    where a /transcribe call drops data on the floor.

    Auth required — we don't want randos burning our Render dyno
    downloading videos. Use the SHARED_SECRET set in env."""
    if not _auth_ok(request):
        return jsonify({"error": "unauthorized"}), 401
    body = request.get_json(silent=True) or {}
    url = (body.get("url") or "").strip()
    if not url:
        return jsonify({"error": "url required"}), 400

    steps = []
    def step(name, **kw):
        steps.append({"step": name, "t": round(time.time() - t0, 3), **kw})

    t0 = time.time()
    try:
        info, source = _resolve_post(url)
        step("resolve",
             source=source,
             is_video=info["is_video"],
             duration=info["duration"],
             title=info["title"][:120],
             has_media_url=bool(info["media_url"]),
             media_host=urlparse(info["media_url"]).netloc if info["media_url"] else None,
             image_urls_count=len(info.get("image_urls") or []))
    except Exception as e:
        step("resolve_error", err=str(e))
        return jsonify({"steps": steps})

    with tempfile.TemporaryDirectory() as tmpdir:
        src_path = os.path.join(tmpdir, "src.bin")
        try:
            _download_to_temp(info["media_url"], src_path)
            sz = os.path.getsize(src_path)
            step("download", bytes=sz)
        except Exception as e:
            step("download_error", err=str(e))
            return jsonify({"steps": steps})

        # Audio path (ffmpeg only, skip Whisper)
        mp3_path = os.path.join(tmpdir, "audio.mp3")
        try:
            _ffmpeg_to_mp3(src_path, mp3_path)
            step("ffmpeg_audio", bytes=os.path.getsize(mp3_path))
        except Exception as e:
            step("ffmpeg_audio_error", err=str(e))

        # Frame extraction (videos only)
        if info.get("is_video") and not info.get("image_urls"):
            try:
                paths = _ffmpeg_extract_frames(src_path, tmpdir, n_frames=5)
                step("ffmpeg_frames", count=len(paths),
                     sizes=[os.path.getsize(p) for p in paths])
            except Exception as e:
                step("ffmpeg_frames_error", err=str(e))
    step("done")
    return jsonify({"steps": steps, "total_s": round(time.time() - t0, 2)})


@app.route("/debug-probe", methods=["POST"])
def debug_probe():
    """Read-only diagnostic. Tries to resolve a URL via TikWM (and
    falls back to yt-dlp). Returns whichever signals we got. Doesn't
    actually download or transcribe — just tells you whether the
    resolve step would have worked. Auth required."""
    if not _auth_ok(request):
        return jsonify({"error": "unauthorized"}), 401
    body = request.get_json(silent=True) or {}
    url = (body.get("url") or "").strip()
    if not url:
        return jsonify({"error": "url required"}), 400
    out = {
        "url": url,
        "ffmpeg": subprocess.run(["which", "ffmpeg"], capture_output=True, text=True).stdout.strip() or "MISSING",
        "ytdlp_version": subprocess.run(["yt-dlp", "--version"], capture_output=True, text=True).stdout.strip(),
    }
    try:
        info, source = _resolve_post(url)
        out["resolved_via"] = source
        out["info"] = {
            "is_video": info["is_video"],
            "duration": info["duration"],
            "title": info["title"][:200],
            "uploader": info["uploader"],
            "has_media_url": bool(info["media_url"]),
            "media_host": urlparse(info["media_url"]).netloc if info["media_url"] else None,
        }
    except Exception as e:
        out["resolve_error"] = str(e)
    return jsonify(out)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), debug=True)

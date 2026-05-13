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
# RapidAPI key for the Instagram Scraper Stable API. Unset on the
# original deploy — the _instagram_resolve path simply errors back to
# the caller when missing, which is fine: caller will see a clean
# "Instagram not configured" message.
RAPIDAPI_KEY = os.environ.get("RAPIDAPI_KEY", "").strip()

WHISPER_MAX_BYTES = 25 * 1024 * 1024
MAX_DURATION_SECONDS = 360
TIKWM_API = "https://www.tikwm.com/api/"
# Host header required by RapidAPI's gateway — pinned to the specific
# API subscription. If we swap providers we change this string here.
RAPIDAPI_IG_HOST = "instagram-scraper-stable-api.p.rapidapi.com"
RAPIDAPI_IG_ENDPOINT = f"https://{RAPIDAPI_IG_HOST}/get_media_data_v2.php"


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


def _ig_shortcode(url):
    """Extract the Instagram shortcode from a post/reel URL.
      instagram.com/p/DXtxcM5lQbE/      → DXtxcM5lQbE
      instagram.com/reel/DXKftlxj5mv/   → DXKftlxj5mv
      instagram.com/reels/DXKftlxj5mv/  → DXKftlxj5mv (some variants)
    Returns None if the URL doesn't look like a post or reel."""
    m = re.search(r"instagram\.com/(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)", url)
    return m.group(1) if m else None


def _instagram_resolve(url):
    """Hit RapidAPI's Instagram Scraper Stable endpoint. Returns the
    same dict shape as _tikwm_resolve so the caller doesn't care which
    platform a URL came from.

    Returns:
      {
        "media_url":    string — direct CDN URL for the playable media
                        (video_url for reels/video posts, display_url
                        for single-image posts; first image otherwise),
        "is_video":     bool,
        "duration":     int (seconds; 0 for non-video),
        "title":        string (caption text, hashtags included),
        "uploader":     string (owner.username),
        "thumbnail":    string (thumbnail_src or display_url),
        "image_urls":   list (carousel image URLs in display order;
                        empty for single posts and videos),
      }
    """
    if not RAPIDAPI_KEY:
        raise RuntimeError("RAPIDAPI_KEY env var not set on server")
    code = _ig_shortcode(url)
    if not code:
        raise RuntimeError(f"could not parse Instagram shortcode from URL: {url}")

    try:
        r = requests.get(
            RAPIDAPI_IG_ENDPOINT,
            params={"media_code": code},
            headers={
                "x-rapidapi-host": RAPIDAPI_IG_HOST,
                "x-rapidapi-key": RAPIDAPI_KEY,
                "Content-Type": "application/json",
            },
            timeout=25,
        )
    except requests.RequestException as e:
        raise RuntimeError(f"rapidapi request failed: {e}")
    if r.status_code == 429:
        raise RuntimeError("rapidapi quota exhausted (HTTP 429) — upgrade plan or wait")
    if not r.ok:
        raise RuntimeError(f"rapidapi HTTP {r.status_code}: {r.text[:200]}")
    try:
        d = r.json()
    except ValueError as e:
        raise RuntimeError(f"rapidapi returned non-JSON: {e}")
    if not isinstance(d, dict):
        raise RuntimeError(f"rapidapi unexpected payload type: {type(d).__name__}")

    # Caption lives under edge_media_to_caption.edges[0].node.text.
    # Empty for posts where the creator didn't write anything (common).
    caption = ""
    try:
        edges = (d.get("edge_media_to_caption") or {}).get("edges") or []
        if edges:
            caption = (edges[0].get("node") or {}).get("text") or ""
    except Exception:
        caption = ""

    is_video = bool(d.get("is_video"))
    duration = int(round(d.get("video_duration") or 0))

    # Pick the best playable media URL.
    # - Reels / videos:        video_url   (mp4)
    # - Single-image posts:    display_url (jpg/png)
    # - Carousel posts:        first carousel child's url (handled below)
    media_url = ""
    if is_video and d.get("video_url"):
        media_url = d["video_url"]
    elif d.get("display_url"):
        media_url = d["display_url"]

    # Carousel images. Different IG scraper APIs name this field
    # inconsistently; we check the common variants. Each child node
    # typically has its own `display_url` (for images) or `video_url`
    # (if the carousel slide is a video).
    image_urls = []
    carousel_sources = (
        (d.get("edge_sidecar_to_children") or {}).get("edges")
        or (d.get("sidecar_children") or [])
        or d.get("carousel_media")
        or []
    )
    for entry in carousel_sources:
        node = entry.get("node") if isinstance(entry, dict) and "node" in entry else entry
        if not isinstance(node, dict):
            continue
        # Prefer the highest-resolution image — Claude vision benefits
        # from the extra detail when reading overlay text.
        resources = node.get("display_resources") or []
        if resources:
            # Last entry is usually largest. Use src field.
            largest = resources[-1] if isinstance(resources[-1], dict) else None
            if largest and largest.get("src"):
                image_urls.append(largest["src"])
                continue
        if node.get("display_url"):
            image_urls.append(node["display_url"])

    # If this is a carousel-of-images and we somehow didn't get a
    # primary media_url, fall back to the first image so the downstream
    # download step still has something to chew on.
    if not media_url and image_urls:
        media_url = image_urls[0]

    if not media_url and not image_urls:
        raise RuntimeError("no playable media on this IG post (private? deleted?)")

    owner = d.get("owner") or {}
    return {
        "media_url": media_url,
        "is_video": is_video,
        "duration": duration,
        "title": caption,
        "uploader": owner.get("username") or owner.get("full_name") or "",
        "thumbnail": d.get("thumbnail_src") or d.get("display_url") or "",
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
    """Pick the best resolver for this URL:
       TikTok    → TikWM (free, proxy-backed)
       Instagram → RapidAPI Instagram Scraper Stable
       anything else → yt-dlp (works for YouTube Shorts, Vimeo, etc.)

    On TikTok / IG, if the primary resolver fails (rate limit, deleted
    post), fall back to yt-dlp — usually doesn't help on either
    platform because of cloud-IP blocks, but the resulting error
    message is more actionable than a bare 500."""
    lower = url.lower()
    is_tiktok = "tiktok.com" in lower
    is_instagram = "instagram.com" in lower

    if is_tiktok:
        try:
            return _tikwm_resolve(url), "tikwm"
        except RuntimeError as e:
            print(f"[resolve] tikwm fail, falling back to yt-dlp: {e}", flush=True)
            try:
                return _ytdlp_resolve(url), "yt-dlp"
            except Exception as e2:
                raise RuntimeError(f"tikwm: {e} | yt-dlp: {e2}")

    if is_instagram:
        try:
            return _instagram_resolve(url), "rapidapi-ig"
        except RuntimeError as e:
            print(f"[resolve] rapidapi-ig fail, falling back to yt-dlp: {e}", flush=True)
            try:
                return _ytdlp_resolve(url), "yt-dlp"
            except Exception as e2:
                raise RuntimeError(f"rapidapi-ig: {e} | yt-dlp: {e2}")

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

    # 2. Pipeline — choose path based on what kind of post this is.
    transcript = ""
    transcribe_err = None
    frames_b64 = []                              # base64 video frames
    image_urls = info.get("image_urls") or []    # carousel CDN URLs
    is_video = info.get("is_video", False)

    # Single-image posts: nothing to download, nothing to transcribe.
    # Make sure image_urls contains the display_url so Claude has
    # something to vision-OCR. Carousels already populated it.
    if not is_video and not image_urls and info.get("media_url"):
        image_urls = [info["media_url"]]

    if is_video:
        # Video / reel path — download MP4, extract audio + frames.
        with tempfile.TemporaryDirectory() as tmpdir:
            src_path = os.path.join(tmpdir, "src.bin")
            mp3_path = os.path.join(tmpdir, "audio.mp3")
            try:
                _download_to_temp(info["media_url"], src_path)
            except Exception as e:
                # Even on download fail we may still have image_urls
                # (rare but possible). Soft-fail and keep going.
                transcribe_err = f"download failed: {e}"
                print(f"[transcribe] download failed (continuing): {e}", flush=True)
            else:
                # Audio: soft-fail if no speech (silent clips, music only).
                try:
                    _ffmpeg_to_mp3(src_path, mp3_path)
                    transcript = _whisper_transcribe(mp3_path)
                except Exception as e:
                    transcribe_err = str(e)
                    print(f"[transcribe] audio path failed (continuing): {e}", flush=True)

                # Frames: extract sampled JPGs for vision OCR.
                try:
                    frame_paths = _ffmpeg_extract_frames(src_path, tmpdir, n_frames=5)
                    frames_b64 = [
                        {"media_type": "image/jpeg", "data": _file_to_base64(p)}
                        for p in frame_paths
                    ]
                    print(f"[transcribe] extracted {len(frames_b64)} frames", flush=True)
                except Exception as e:
                    print(f"[transcribe] frame extraction failed: {e}", flush=True)
    else:
        # Photo / carousel path — image_urls is everything Claude needs.
        # No download, no ffmpeg, no Whisper. Saves a lot of time AND
        # avoids the ffmpeg-on-jpg failure that was 502'ing carousels.
        print(f"[transcribe] photo-only post: {len(image_urls)} images, skipping download", flush=True)

    # If we ended up with literally nothing usable, 502.
    if not transcript and not frames_b64 and not image_urls:
        return jsonify({
            "error": f"could not extract anything usable: {transcribe_err or 'no media'}",
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
        "rapidapi_configured": bool(RAPIDAPI_KEY),
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

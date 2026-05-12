"""
cooked-video-transcribe — Render web service.

Single endpoint: POST /transcribe
Input:  { "url": "https://www.tiktok.com/@user/video/123..." }
Output: { "transcript": "...", "duration_s": 23.4, "title": "...", "uploader": "..." }
Auth:   X-Shared-Secret header must match the SHARED_SECRET env var.

Why this exists: the Cloudflare Worker can't run yt-dlp or call multipart
Whisper endpoints reliably (50MB request limit, no subprocesses). So we
offload the heavy parts (download, audio extract, transcribe) to this
small Render service. The Worker hits /transcribe, gets back text, then
sends transcript + caption + POI to Claude as a richer signal bundle.

Cost notes (2026-05):
  - Render Starter dyno: $7/mo flat (always-on, ~512MB RAM, fine for
    yt-dlp + a few seconds of audio in /tmp).
  - OpenAI Whisper API (whisper-1): $0.006 per minute of audio. A
    typical 30s TikTok = $0.003. At 100 finds/month = $0.30.

Failure modes we handle:
  - yt-dlp 404 (post deleted / private)        → 502 with detail
  - yt-dlp generic error (geo block, sig fail) → 502 with stderr tail
  - ffmpeg can't extract audio (silent video)  → 502, message
  - Whisper rate limit / 5xx                   → 502 passthrough
  - Audio > 25MB (Whisper max)                 → 413 with size info
"""

import os
import re
import json
import subprocess
import tempfile
import time
from flask import Flask, request, jsonify
import requests

app = Flask(__name__)


# Belt-and-suspenders: any uncaught exception (subprocess crash, OOM
# kill, malformed JSON from yt-dlp) gets turned into a JSON 500 with
# the actual message so the caller — and our Render logs — can see
# what blew up. Without this, gunicorn returns a generic HTML 502
# that swallows the cause.
@app.errorhandler(Exception)
def _handle_uncaught(e):
    import traceback
    print(f"[uncaught] {type(e).__name__}: {e}\n{traceback.format_exc()}", flush=True)
    return jsonify({
        "error": f"{type(e).__name__}: {e}",
    }), 500

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
SHARED_SECRET = os.environ.get("SHARED_SECRET", "").strip()

# Whisper's hard ceiling. yt-dlp's -x extract-audio at default quality
# stays well under this for any sane TikTok/Reel length, but a 5-minute
# IG Reel could theoretically exceed it.
WHISPER_MAX_BYTES = 25 * 1024 * 1024

# Conservative ceiling on what we'll even attempt to download. Anything
# longer than ~5 minutes is almost certainly NOT a "user found a place"
# video — it's a vlog or compilation. We don't want to burn a 60s yt-dlp
# timeout on a 20-minute live recording.
MAX_DURATION_SECONDS = 360


def _auth_ok(req):
    """Constant-time-ish compare on the shared secret header."""
    provided = req.headers.get("X-Shared-Secret", "").strip()
    if not SHARED_SECRET or not provided:
        return False
    return provided == SHARED_SECRET


def _ytdlp_metadata(url):
    """Probe metadata without downloading. Lets us bail early on
    too-long videos or already-deleted posts before paying the
    actual download cost."""
    try:
        proc = subprocess.run(
            [
                "yt-dlp",
                "--dump-json",
                "--no-warnings",
                "--no-playlist",
                "--socket-timeout", "20",
                url,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except subprocess.TimeoutExpired:
        return None, "yt-dlp metadata probe timed out"
    if proc.returncode != 0:
        # Surface just the last useful line of stderr — yt-dlp dumps a
        # lot, but the actionable bit is usually the final ERROR line.
        tail = (proc.stderr or "").strip().splitlines()[-3:]
        return None, " | ".join(tail) or f"yt-dlp returncode {proc.returncode}"
    try:
        meta = json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        return None, f"yt-dlp returned non-JSON: {e}"
    return meta, None


def _download_audio(url, out_path):
    """Run yt-dlp to extract audio only (mp3, q=5 ~32kbps mono — Whisper
    doesn't need anything richer to transcribe a human voice)."""
    try:
        proc = subprocess.run(
            [
                "yt-dlp",
                "-x",
                "--audio-format", "mp3",
                "--audio-quality", "5",
                "-o", out_path,
                "--no-playlist",
                "--no-warnings",
                "--socket-timeout", "30",
                "--quiet",
                url,
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        return "yt-dlp download timed out (120s)"
    if proc.returncode != 0:
        tail = (proc.stderr or "").strip().splitlines()[-3:]
        return " | ".join(tail) or f"yt-dlp returncode {proc.returncode}"
    if not os.path.exists(out_path):
        return "yt-dlp succeeded but produced no audio file"
    return None


def _whisper_transcribe(audio_path):
    """Send mp3 to OpenAI Whisper. Returns (text, error)."""
    size = os.path.getsize(audio_path)
    if size > WHISPER_MAX_BYTES:
        return None, f"audio too large for Whisper ({size} bytes > {WHISPER_MAX_BYTES})"
    try:
        with open(audio_path, "rb") as f:
            resp = requests.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                files={"file": ("audio.mp3", f, "audio/mpeg")},
                data={
                    "model": "whisper-1",
                    # English-only restaurant videos for now; setting
                    # this drops latency and gives slightly better
                    # proper-noun accuracy. Worth revisiting once we
                    # see non-English creator submissions.
                    "language": "en",
                    "response_format": "json",
                    # Prompt biases Whisper toward food vocab — helps
                    # it spell restaurant names correctly. Whisper uses
                    # the last 224 tokens of the prompt as context.
                    "prompt": (
                        "Restaurant name, address, neighborhood, "
                        "cuisine, food, menu. Examples: Sushi by Bou, "
                        "Carbone, L'Antica Pizzeria, Gjelina, Nobu, "
                        "Eleven Madison Park."
                    ),
                },
                timeout=120,
            )
    except requests.RequestException as e:
        return None, f"Whisper request failed: {e}"
    if not resp.ok:
        return None, f"Whisper HTTP {resp.status_code}: {resp.text[:200]}"
    try:
        return resp.json().get("text", "").strip(), None
    except ValueError:
        return None, "Whisper returned non-JSON"


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

    # Cheap probe first — bail on giant or deleted videos before paying
    # the download cost.
    meta, meta_err = _ytdlp_metadata(url)
    if meta_err:
        return jsonify({"error": f"could not read video: {meta_err}"}), 502

    duration = meta.get("duration") or 0
    if duration and duration > MAX_DURATION_SECONDS:
        return jsonify({
            "error": f"video too long ({duration}s > {MAX_DURATION_SECONDS}s)"
        }), 413

    title = meta.get("title") or meta.get("description") or ""
    uploader = meta.get("uploader") or meta.get("uploader_id") or ""
    description = meta.get("description") or ""
    thumbnail = meta.get("thumbnail") or ""

    # Download audio, transcribe, return.
    with tempfile.TemporaryDirectory() as tmpdir:
        audio_path = os.path.join(tmpdir, "audio.%(ext)s")
        dl_err = _download_audio(url, audio_path)
        if dl_err:
            return jsonify({"error": f"download failed: {dl_err}"}), 502

        # yt-dlp resolves the %(ext)s template — find the actual file.
        actual_audio = None
        for f in os.listdir(tmpdir):
            if f.endswith(".mp3"):
                actual_audio = os.path.join(tmpdir, f)
                break
        if not actual_audio:
            return jsonify({"error": "no mp3 produced by yt-dlp"}), 502

        transcript, w_err = _whisper_transcribe(actual_audio)
        if w_err:
            return jsonify({"error": f"transcribe failed: {w_err}"}), 502

    elapsed = round(time.time() - t0, 2)
    return jsonify({
        "transcript": transcript or "",
        "duration_s": duration,
        "title": title,
        "uploader": uploader,
        # The yt-dlp description field for TikTok is usually identical
        # to the on-page caption — handy as a redundant signal if the
        # Worker's HTML-scraped caption came back empty.
        "description": description,
        "thumbnail": thumbnail,
        "elapsed_s": elapsed,
    })


@app.route("/", methods=["GET"])
@app.route("/health", methods=["GET"])
def health():
    """Render hits this; also doubles as a smoke test."""
    return jsonify({
        "ok": True,
        "service": "cooked-video-transcribe",
        "openai_configured": bool(OPENAI_API_KEY),
        "secret_configured": bool(SHARED_SECRET),
    })


@app.route("/debug-probe", methods=["POST"])
def debug_probe():
    """Diagnostic endpoint — runs just the yt-dlp metadata probe and
    returns the raw stdout/stderr. Useful when /transcribe 502s and we
    need to know whether yt-dlp itself is failing, vs Whisper, vs
    ffmpeg. Same auth as /transcribe."""
    if not _auth_ok(request):
        return jsonify({"error": "unauthorized"}), 401
    body = request.get_json(silent=True) or {}
    url = (body.get("url") or "").strip()
    if not url:
        return jsonify({"error": "url required"}), 400

    # Probe metadata
    try:
        proc = subprocess.run(
            ["yt-dlp", "--dump-json", "--no-warnings", "--no-playlist",
             "--socket-timeout", "20", url],
            capture_output=True, text=True, timeout=30,
        )
        meta_ok = proc.returncode == 0
        meta_summary = None
        if meta_ok:
            try:
                m = json.loads(proc.stdout)
                meta_summary = {
                    "id": m.get("id"),
                    "title": (m.get("title") or "")[:120],
                    "duration": m.get("duration"),
                    "ext": m.get("ext"),
                    "extractor": m.get("extractor"),
                    "uploader": m.get("uploader"),
                    "description_len": len(m.get("description") or ""),
                    "has_audio": "audio" in (m.get("ext") or "").lower() or m.get("acodec") not in (None, "none"),
                }
            except Exception as e:
                meta_summary = {"parse_error": str(e)}
        return jsonify({
            "ytdlp_returncode": proc.returncode,
            "ytdlp_stderr_tail": "\n".join((proc.stderr or "").splitlines()[-15:]),
            "ytdlp_stdout_first_500": (proc.stdout or "")[:500],
            "metadata": meta_summary,
            "ffmpeg_check": subprocess.run(["which", "ffmpeg"], capture_output=True, text=True).stdout.strip() or "MISSING",
            "ytdlp_version": subprocess.run(["yt-dlp", "--version"], capture_output=True, text=True).stdout.strip(),
        })
    except subprocess.TimeoutExpired:
        return jsonify({"error": "yt-dlp probe timed out (30s)"}), 504
    except Exception as e:
        return jsonify({"error": f"probe crashed: {e}"}), 500


if __name__ == "__main__":
    # Local dev only — Render uses the gunicorn CMD in the Dockerfile.
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), debug=True)

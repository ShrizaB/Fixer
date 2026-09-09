import os
import sys
import time
import requests
from dotenv import load_dotenv

load_dotenv()

RIME_API_KEY = os.environ["RIME_API_KEY"]
# Defaults match this project's agreed config (.env.example / preflight_check.js).
RIME_MODEL_ID = os.environ.get("RIME_MODEL_ID", "coda")
RIME_SPEAKER = os.environ.get("RIME_SPEAKER", "astra")
RIME_LANGUAGE = os.environ.get("RIME_LANGUAGE", "eng")

# Confirmed against the official livekit-plugins-rime source (v1.8.0):
# this is the real chunked-synthesis endpoint it calls internally.
RIME_TTS_URL = "https://users.rime.ai/v1/rime-tts"


def synthesize(text: str, out_path: str = "output_test.pcm") -> None:
    # Rime's chunked endpoint returns raw PCM (audio/pcm), not a WAV
    # container -- confirmed from the official plugin's ChunkedStream,
    # which requests "audio/pcm" and streams raw bytes with no header.
    # A plain media player will NOT play the saved file directly; see the
    # note printed below for how to actually listen to it.
    headers = {
        "Authorization": f"Bearer {RIME_API_KEY}",
        "Accept": "audio/pcm",
        "Content-Type": "application/json",
    }
    payload = {
        "speaker": RIME_SPEAKER,
        "text": text,
        "modelId": RIME_MODEL_ID,
        "lang": RIME_LANGUAGE,
        "samplingRate": 22050,
    }

    print(f"[rime_tts_test] Sending request to Rime "
          f"(model={RIME_MODEL_ID}, speaker={RIME_SPEAKER}, lang={RIME_LANGUAGE})...")

    t0 = time.time()
    resp = requests.post(RIME_TTS_URL, headers=headers, json=payload, timeout=30)
    t1 = time.time()

    print(f"[rime_tts_test] HTTP {resp.status_code} in {t1 - t0:.2f}s")

    if resp.status_code != 200:
        print("[rime_tts_test] ERROR response body:")
        print(resp.text)
        sys.exit(1)

    os.makedirs("output", exist_ok=True)
    full_path = os.path.join("output", out_path)
    with open(full_path, "wb") as f:
        f.write(resp.content)

    print(f"[rime_tts_test] Saved audio to {full_path}")
    print(f"[rime_tts_test] File size: {len(resp.content)} bytes")
    print(f"[rime_tts_test] Content-Type returned: {resp.headers.get('Content-Type')}")
    print(
        "[rime_tts_test] This is raw PCM (16-bit, mono, 22050 Hz), not a "
        "playable file on its own. To listen, either:\n"
        "  ffplay -f s16le -ar 22050 -ac 1 " + full_path + "\n"
        "  or convert to WAV first:\n"
        "  ffmpeg -f s16le -ar 22050 -ac 1 -i " + full_path + " output/output_test.wav"
    )


if __name__ == "__main__":
    text = " ".join(sys.argv[1:]) or "Hello, this is a test of the incident voice agent."
    synthesize(text)
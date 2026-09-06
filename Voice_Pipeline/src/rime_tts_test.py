import os
import sys
import time
import requests
from dotenv import load_dotenv

load_dotenv()

RIME_API_KEY = os.environ["RIME_API_KEY"]
RIME_MODEL_ID = os.environ.get("RIME_MODEL_ID", "mistv2")
RIME_SPEAKER = os.environ["RIME_SPEAKER"]
RIME_LANGUAGE = os.environ.get("RIME_LANGUAGE", "eng")

# Confirm this endpoint against Rime's current docs before running --
# TTS API base URLs and paths do change. This is the standard synchronous
# synthesis endpoint as of Rime's public docs; verify the path and the
# expected audio format (e.g. wav/mp3/pcm) before assuming this is current.
RIME_TTS_URL = "https://users.rime.ai/v1/rime-tts"


def synthesize(text: str, out_path: str = "output_test.wav") -> None:
    headers = {
        "Authorization": f"Bearer {RIME_API_KEY}",
        "Accept": "audio/wav",
        "Content-Type": "application/json",
    }
    payload = {
        "speaker": RIME_SPEAKER,
        "text": text,
        "modelId": RIME_MODEL_ID,
        "lang": RIME_LANGUAGE,
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
    print("[rime_tts_test] Now play this file and confirm you hear real speech.")


if __name__ == "__main__":
    text = " ".join(sys.argv[1:]) or "Hello, this is a test of the incident voice agent."
    synthesize(text)

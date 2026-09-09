import os
from pathlib import Path
from dotenv import load_dotenv

# .env lives at the repo root (see .env.example there), not inside
# Voice_Pipeline/. Resolve relative to this file so it loads correctly
# no matter what directory you run `python src/agent.py` from.
_REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(dotenv_path=_REPO_ROOT / ".env")


class Config:
    LIVEKIT_URL = os.environ["LIVEKIT_URL"]
    LIVEKIT_API_KEY = os.environ["LIVEKIT_API_KEY"]
    LIVEKIT_API_SECRET = os.environ["LIVEKIT_API_SECRET"]


    DEEPGRAM_API_KEY = os.environ["DEEPGRAM_API_KEY"]

    # Must match scripts/preflight_check.js defaults and .env.example --
    # these three values are validated against Rime's live catalog before
    # every demo, per the "use a current production configuration" rule.
    RIME_API_KEY = os.environ["RIME_API_KEY"]
    RIME_MODEL_ID = os.environ.get("RIME_MODEL_ID", "coda")
    RIME_SPEAKER = os.environ.get("RIME_SPEAKER", "astra")
    RIME_LANGUAGE = os.environ.get("RIME_LANGUAGE", "eng")

    ENABLE_FALLBACK_TTS = os.environ.get("ENABLE_FALLBACK_TTS", "true").lower() == "true"
    LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")


config = Config()
import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    LIVEKIT_URL = os.environ["LIVEKIT_URL"]
    LIVEKIT_API_KEY = os.environ["LIVEKIT_API_KEY"]
    LIVEKIT_API_SECRET = os.environ["LIVEKIT_API_SECRET"]

    RIME_API_KEY = os.environ["RIME_API_KEY"]
    RIME_MODEL_ID = os.environ.get("RIME_MODEL_ID", "mistv2")
    RIME_SPEAKER = os.environ["RIME_SPEAKER"]
    RIME_LANGUAGE = os.environ.get("RIME_LANGUAGE", "eng")

    DEEPGRAM_API_KEY = os.environ["DEEPGRAM_API_KEY"]

    ENABLE_FALLBACK_TTS = os.environ.get("ENABLE_FALLBACK_TTS", "true").lower() == "true"
    LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")


config = Config()

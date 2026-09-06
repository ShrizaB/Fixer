#!/usr/bin/env bash
set -e

# Activate your venv before running this if you're using one:
#   source .venv/bin/activate

echo "Step 1: Rime standalone sanity check"
python src/rime_tts_test.py "This is a test of the incident response voice agent."
echo "----> Check output/output_test.wav plays real speech before continuing."
read -p "Press enter once you've confirmed audio plays correctly..."

echo "Step 2: Starting LiveKit agent in dev mode"
python src/agent.py dev

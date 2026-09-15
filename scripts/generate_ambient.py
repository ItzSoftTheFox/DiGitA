"""Generate the original DiGitA soft-noise loop; no external recordings.

Output is dedicated to CC0-1.0; see public/audio/LICENSE.txt.
Run from any directory: python3 scripts/generate_ambient.py
"""

import math
import random
import struct
import wave
from pathlib import Path

RATE = 16000
SECONDS = 30
rng = random.Random(20260915)
# Low-pass filtered noise, with a one-second equal-power loop crossfade.
values = []
previous = 0.0
for _ in range(RATE * (SECONDS + 1)):
    previous = 0.98 * previous + 0.02 * rng.uniform(-1, 1)
    values.append(previous)
for i in range(RATE):
    phase = i / RATE * math.pi / 2
    values[i] = values[RATE * SECONDS + i] * math.cos(phase) + values[i] * math.sin(phase)
values = values[: RATE * SECONDS]
scale = 0.45 / max(abs(value) for value in values)
output = Path(__file__).resolve().parents[1] / 'public/audio/soft-noise-v1.wav'
with wave.open(str(output), 'wb') as audio:
    audio.setnchannels(1)
    audio.setsampwidth(2)
    audio.setframerate(RATE)
    audio.writeframes(b''.join(struct.pack('<h', round(value * scale * 32767)) for value in values))
print(f'{output.name}: {SECONDS}s, mono PCM16, {RATE}Hz')

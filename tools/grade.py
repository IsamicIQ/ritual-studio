"""Shift each section image so its empty background matches the page colour exactly."""
import subprocess, sys, statistics
from pathlib import Path

TARGET = (0xEC, 0xD3, 0xC8)  # --fundo in estilo.css
src, dst = Path(sys.argv[1]), Path(sys.argv[2])
dst.mkdir(parents=True, exist_ok=True)
for name in ["studio", "classes", "timetable", "packages", "first-visit", "find-us"]:
    f = src / f"{name}.png"
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(f), "-vf", "scale=48:32",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    px = [tuple(raw[i:i + 3]) for i in range(0, len(raw), 3)]
    # background = low-saturation-ish bright pixels: take the brightest 40% and median them
    px.sort(key=sum)
    bright = px[int(len(px) * 0.45):int(len(px) * 0.85)]
    bg = tuple(statistics.median(p[c] for p in bright) for c in range(3))
    g = [TARGET[c] / max(bg[c], 1) for c in range(3)]
    out = dst / f"{name}.png"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(f), "-vf",
                    f"colorchannelmixer=rr={g[0]:.4f}:gg={g[1]:.4f}:bb={g[2]:.4f}", str(out)], check=True)
    print(f"{name}: bg #{''.join('%02X' % int(v) for v in bg)} gains {[round(x, 3) for x in g]}")

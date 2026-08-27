#!/usr/bin/env python3
"""Create transparent garment cut-outs from studio photos.

Only pixels connected to the image edge can become transparent. This keeps
light garments and white mannequin parts intact while removing a white or
neutral studio backdrop.
"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


def remove_edge_background(source: Path, destination: Path, threshold: float) -> None:
    image = Image.open(source).convert("RGBA")
    pixels = np.asarray(image, dtype=np.uint8).copy()
    rgb = pixels[:, :, :3].astype(np.float32)
    height, width = rgb.shape[:2]

    border = np.concatenate((rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]), axis=0)
    background = np.median(border, axis=0)
    distance = np.linalg.norm(rgb - background, axis=2)
    chroma = np.max(rgb, axis=2) - np.min(rgb, axis=2)
    background_chroma = float(np.max(background) - np.min(background))

    # Product photographs usually have a nearly neutral edge. A slightly
    # wider threshold also clears soft studio shadows without globally
    # deleting cream knitwear or white mannequin parts.
    chroma_threshold = max(18.0, background_chroma + 14.0)
    candidate = (distance < threshold) & (chroma < chroma_threshold)
    connected = np.zeros((height, width), dtype=np.bool_)
    queue: deque[tuple[int, int]] = deque()

    def seed(y: int, x: int) -> None:
        if candidate[y, x] and not connected[y, x]:
            connected[y, x] = True
            queue.append((y, x))

    for x in range(width):
        seed(0, x)
        seed(height - 1, x)
    for y in range(1, height - 1):
        seed(y, 0)
        seed(y, width - 1)

    while queue:
        y, x = queue.popleft()
        if y > 0:
            seed(y - 1, x)
        if y + 1 < height:
            seed(y + 1, x)
        if x > 0:
            seed(y, x - 1)
        if x + 1 < width:
            seed(y, x + 1)

    alpha = np.full((height, width), 255, dtype=np.uint8)
    feather_start = threshold * 0.68
    feather = np.clip(
        (distance - feather_start) / (threshold - feather_start), 0.0, 1.0
    )
    alpha[connected] = np.rint(feather[connected] * 255).astype(np.uint8)
    pixels[:, :, 3] = alpha

    destination.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(pixels, mode="RGBA").save(destination, optimize=True)
    removed = float(np.mean(alpha < 16)) * 100
    print(f"{source.name} -> {destination.name} ({removed:.1f}% transparent)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pairs", nargs="+", help="SOURCE=DESTINATION pairs")
    parser.add_argument("--threshold", type=float, default=68.0)
    args = parser.parse_args()
    for pair in args.pairs:
        source, separator, destination = pair.partition("=")
        if not separator:
            raise SystemExit(f"Expected SOURCE=DESTINATION, got: {pair}")
        remove_edge_background(Path(source), Path(destination), args.threshold)


if __name__ == "__main__":
    main()

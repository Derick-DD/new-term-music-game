from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter


OUTPUT_DIR = Path("public/assets/campus-season")
SPRITE_NAMES = (
    "vehicle-bicycle.png",
    "vehicle-motorcycle.png",
    "vehicle-car.png",
    "vehicle-school-bus.png",
)


def chroma_candidate(pixel: tuple[int, int, int]) -> bool:
    red, green, blue = pixel
    return green > 145 and green - max(red, blue) > 48


def connected_background(image: Image.Image) -> set[tuple[int, int]]:
    rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    queue: deque[tuple[int, int]] = deque()
    visited: set[tuple[int, int]] = set()

    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        if (x, y) in visited or not chroma_candidate(pixels[x, y]):
            continue
        visited.add((x, y))
        if x > 0:
            queue.append((x - 1, y))
        if x + 1 < width:
            queue.append((x + 1, y))
        if y > 0:
            queue.append((x, y - 1))
        if y + 1 < height:
            queue.append((x, y + 1))
    return visited


def remove_connected_chroma(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    background = connected_background(image)
    background_mask = Image.new("L", image.size, 0)
    mask_pixels = background_mask.load()
    for x, y in background:
        red, green, blue, _ = pixels[x, y]
        pixels[x, y] = (red, green, blue, 0)
        mask_pixels[x, y] = 255
    expanded_mask = background_mask.filter(ImageFilter.MaxFilter(3))
    expanded_pixels = expanded_mask.load()
    for y in range(image.height):
        for x in range(image.width):
            if expanded_pixels[x, y] == 0 or (x, y) in background:
                continue
            red, green, blue, _ = pixels[x, y]
            if green - max(red, blue) > 20:
                pixels[x, y] = (red, green, blue, 0)
    return rgba


def normalized_sprite(image: Image.Image, crop: tuple[int, int, int, int]) -> Image.Image:
    sprite = image.crop(crop)
    alpha_box = sprite.getchannel("A").getbbox()
    if alpha_box is None:
        raise RuntimeError(f"No sprite content found inside {crop}")
    sprite = sprite.crop(alpha_box)
    sprite.thumbnail((560, 560), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (640, 640), (0, 0, 0, 0))
    x = (canvas.width - sprite.width) // 2
    y = canvas.height - sprite.height - 36
    canvas.alpha_composite(sprite, (x, y))
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract the four vehicle sprites from an ImageGen 2x2 sheet."
    )
    parser.add_argument("source", type=Path)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    args = parser.parse_args()

    source = remove_connected_chroma(Image.open(args.source))
    mid_x = source.width // 2
    mid_y = source.height // 2
    regions = (
        (0, 0, mid_x, mid_y),
        (mid_x, 0, source.width, mid_y),
        (0, mid_y, mid_x, source.height),
        (mid_x, mid_y, source.width, source.height),
    )
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for filename, crop in zip(SPRITE_NAMES, regions, strict=True):
        normalized_sprite(source, crop).save(
            args.output_dir / filename,
            optimize=True,
        )


if __name__ == "__main__":
    main()

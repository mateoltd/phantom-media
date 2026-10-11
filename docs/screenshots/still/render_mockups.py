"""Render Still README artwork with its real Sora font and media tokens.

Requires Pillow and fonttools[woff], plus a Next dev/build font cache.
Run from the repository root: python3 docs/screenshots/still/render_mockups.py
"""
from pathlib import Path
from tempfile import TemporaryDirectory

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
BG = '#191b1e'
FRAME = '#101113'
BORDER = '#33363b'
TEXT = '#f4f4f8'


def sora_path():
    # Use the exact Latin font bundled by next/font for the running Still app.
    for path in (REPO / 'apps/still/.next').rglob('c41ca59f1c34ba31*.woff2'):
        return path
    raise FileNotFoundError('Start Still once to populate its Next Sora font cache')


def title(canvas, text, font_path):
    face = ImageFont.truetype(str(font_path), 112)
    face.set_variation_by_axes([600])
    draw = ImageDraw.Draw(canvas)
    length = draw.textlength(text, font=face)
    draw.text(((canvas.width - length) / 2, 122), text, fill=TEXT, font=face,
              stroke_width=0)


def rounded_paste(canvas, image, xy, radius):
    mask = Image.new('L', image.size)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, image.width - 1, image.height - 1),
                                          radius=radius, fill=255)
    canvas.paste(image, xy, mask)


def shadow(canvas, box, radius):
    layer = Image.new('RGBA', canvas.size)
    ImageDraw.Draw(layer).rounded_rectangle((box[0], box[1] + 40, box[2], box[3] + 40),
                                            radius=radius, fill=(0, 0, 0, 145))
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(55)))


def screen(canvas, source, x, y, width, crop_height=None):
    capture = Image.open(ROOT / 'raw' / source).convert('RGB')
    if crop_height:
        capture = capture.crop((0, 0, capture.width, crop_height))
    height = round(capture.height * width / capture.width)
    capture = capture.resize((width, height), Image.Resampling.LANCZOS)
    bezel = 8
    frame = Image.new('RGB', (width + bezel * 2, height + bezel * 2), FRAME)
    rounded_paste(frame, capture, (bezel, bezel), 28)
    box = (x, y, x + frame.width, y + frame.height)
    shadow(canvas, box, 36)
    rounded_paste(canvas, frame, (x, y), 36)
    ImageDraw.Draw(canvas).rounded_rectangle(box, radius=36, outline=BORDER, width=2)


def phone(canvas, x, y, width=580):
    capture = Image.open(ROOT / 'raw/home-mobile.png').convert('RGB')
    height = round(capture.height * width / capture.width)
    capture = capture.resize((width, height), Image.Resampling.LANCZOS)
    # A quiet black device bezel, without fake status bars or browser controls.
    frame = Image.new('RGB', (width + 36, height + 52), FRAME)
    rounded_paste(frame, capture, (18, 26), 44)
    box = (x, y, x + frame.width, y + frame.height)
    shadow(canvas, box, 64)
    rounded_paste(canvas, frame, (x, y), 64)
    ImageDraw.Draw(canvas).rounded_rectangle(box, radius=64, outline='#737984', width=3)
    ImageDraw.Draw(canvas).rounded_rectangle((x + 5, y + 5, box[2] - 5, box[3] - 5),
                                             radius=60, outline=BORDER, width=3)


def canvas(size):
    return Image.new('RGBA', size, BG)


def save(image, name):
    image.convert('RGB').save(ROOT / name, 'WEBP', quality=97, method=6)


def main():
    with TemporaryDirectory() as directory:
        path = Path(directory) / 'Sora.ttf'
        face = TTFont(sora_path())
        face.flavor = None
        face.save(path)

        hero = canvas((3200, 2100))
        title(hero, 'Watch on your terms', path)
        screen(hero, 'player-desktop.png', 192, 375, 2800)
        save(hero, 'still-player.webp')

        discovery = canvas((3600, 2200))
        title(discovery, 'Find your next stream', path)
        screen(discovery, 'home-desktop.png', 144, 520, 2740, crop_height=1430)
        phone(discovery, 2810, 430, 660)
        save(discovery, 'still-discovery.webp')

        categories = canvas((3200, 2380))
        title(categories, 'Explore what is live', path)
        screen(categories, 'categories-desktop.png', 192, 375, 2800)
        save(categories, 'still-categories.webp')


if __name__ == '__main__':
    main()

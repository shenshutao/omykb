from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
ICONSET = ASSETS / "icon.iconset"
ICNS = ASSETS / "icon.icns"
MASTER = ASSETS / "icon-1024.png"


def rounded_rectangle(draw, xy, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def build_master_icon() -> None:
    size = 1024
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    for y in range(size):
      t = y / (size - 1)
      r = int(3 + (21 * (1 - t)))
      g = int(8 + (26 * (1 - t)))
      b = int(20 + (48 * (1 - t)))
      draw.line((0, y, size, y), fill=(r, g, b, 255))

    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse((80, 60, 640, 620), fill=(79, 157, 255, 88))
    glow_draw.ellipse((430, 420, 930, 960), fill=(34, 197, 94, 52))
    glow = glow.filter(ImageFilter.GaussianBlur(84))
    image.alpha_composite(glow)

    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    rounded_rectangle(shadow_draw, (162, 164, 862, 864), radius=182, fill=(0, 0, 0, 120))
    shadow = shadow.filter(ImageFilter.GaussianBlur(36))
    image.alpha_composite(shadow)

    panel = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    panel_draw = ImageDraw.Draw(panel)
    rounded_rectangle(panel_draw, (150, 152, 874, 876), radius=184, fill=(15, 23, 42, 252))
    rounded_rectangle(panel_draw, (176, 178, 848, 850), radius=156, fill=(10, 16, 32, 255))
    image.alpha_composite(panel)

    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((238, 236, 784, 316), radius=40, fill=(21, 34, 59, 255))
    draw.ellipse((274, 264, 292, 282), fill=(125, 211, 252, 255))
    draw.ellipse((308, 264, 326, 282), fill=(79, 157, 255, 255))
    draw.ellipse((342, 264, 360, 282), fill=(34, 197, 94, 235))

    block = 92
    gap = 14
    left = 244
    top = 372
    radius = 22

    def cell(col: int, row: int):
        x = left + col * (block + gap)
        y = top + row * (block + gap)
        return (x, y, x + block, y + block)

    block_shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    block_shadow_draw = ImageDraw.Draw(block_shadow)
    for rect in [
        cell(0, 0), cell(1, 0), cell(0, 1), cell(1, 1),   # O
        cell(3, 0), cell(3, 1), cell(3, 2), cell(3, 3),   # I
        cell(4, 1), cell(5, 0), cell(5, 2), cell(6, 3),   # K arms
    ]:
        rounded_rectangle(block_shadow_draw, (rect[0] + 8, rect[1] + 10, rect[2] + 8, rect[3] + 10), radius=radius, fill=(0, 0, 0, 92))
    block_shadow = block_shadow.filter(ImageFilter.GaussianBlur(18))
    image.alpha_composite(block_shadow)

    def draw_cube(rect, face, accent):
        x1, y1, x2, y2 = rect
        rounded_rectangle(draw, rect, radius=radius, fill=face)
        draw.rounded_rectangle((x1 + 12, y1 + 12, x2 - 12, y1 + 26), radius=12, fill=accent)
        draw.rounded_rectangle((x1 + 10, y1 + 10, x2 - 10, y2 - 10), radius=18, outline=(255, 255, 255, 24), width=3)

    icy = (226, 236, 255, 255)
    icy_hi = (248, 251, 255, 180)
    blue = (79, 157, 255, 255)
    blue_hi = (168, 210, 255, 120)
    green = (34, 197, 94, 245)
    green_hi = (166, 247, 196, 120)

    for rect in [cell(0, 0), cell(1, 0), cell(0, 1), cell(1, 1)]:
        draw_cube(rect, icy, icy_hi)
    for rect in [cell(3, 0), cell(3, 1), cell(3, 2), cell(3, 3), cell(4, 1), cell(5, 0)]:
        draw_cube(rect, blue, blue_hi)
    for rect in [cell(5, 2), cell(6, 3)]:
        draw_cube(rect, green, green_hi)

    glow_blocks = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_blocks)
    for rect in [cell(3, 0), cell(3, 1), cell(3, 2), cell(3, 3), cell(4, 1), cell(5, 0)]:
        rounded_rectangle(glow_draw, rect, radius=radius, fill=(79, 157, 255, 36))
    for rect in [cell(5, 2), cell(6, 3)]:
        rounded_rectangle(glow_draw, rect, radius=radius, fill=(34, 197, 94, 28))
    glow_blocks = glow_blocks.filter(ImageFilter.GaussianBlur(18))
    image.alpha_composite(glow_blocks)

    ASSETS.mkdir(parents=True, exist_ok=True)
    image.save(MASTER)


def build_iconset() -> None:
    ICONSET.mkdir(parents=True, exist_ok=True)
    master = Image.open(MASTER).convert("RGBA")

    sizes = [16, 32, 64, 128, 256, 512, 1024]
    for base in sizes:
        output = master.resize((base, base), Image.Resampling.LANCZOS)
        if base == 1024:
            output.save(ICONSET / "icon_512x512@2x.png")
        elif base == 16:
            output.save(ICONSET / "icon_16x16.png")
            output.resize((32, 32), Image.Resampling.LANCZOS).save(ICONSET / "icon_16x16@2x.png")
        elif base == 32:
            output.save(ICONSET / "icon_32x32.png")
            output.resize((64, 64), Image.Resampling.LANCZOS).save(ICONSET / "icon_32x32@2x.png")
        elif base == 128:
            output.save(ICONSET / "icon_128x128.png")
            output.resize((256, 256), Image.Resampling.LANCZOS).save(ICONSET / "icon_128x128@2x.png")
        elif base == 256:
            output.save(ICONSET / "icon_256x256.png")
            output.resize((512, 512), Image.Resampling.LANCZOS).save(ICONSET / "icon_256x256@2x.png")
        elif base == 512:
            output.save(ICONSET / "icon_512x512.png")


if __name__ == "__main__":
    build_master_icon()
    build_iconset()
    print(MASTER)

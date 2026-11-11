"""Regenerates the three synthetic handwriting-style test photos used by the browser tests.
Run from the repository root:  python3 e2e/photos/make-photos.py   (needs Pillow and a Japanese font)."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import subprocess, random, os
out = os.path.dirname(os.path.abspath(__file__))
font_path = subprocess.run(['fc-match', '-f', '%{file}', 'Noto Sans CJK JP:bold'], capture_output=True, text=True).stdout
def page(w, h, lines, seed):
    random.seed(seed)
    img = Image.new('RGB', (w, h), (238, 232, 215)); d = ImageDraw.Draw(img)
    for y in range(int(h * 0.12), h, int(h * 0.075)): d.line([(w * 0.06, y), (w * 0.94, y)], fill=(190, 200, 225), width=5)
    f = ImageFont.truetype(font_path, int(h * 0.045)); y = int(h * 0.085)
    for l in lines:
        d.text((w * 0.1 + random.randint(-12, 12), y + random.randint(-6, 6)), l, font=f, fill=(30, 35, 80)); y += int(h * 0.075)
    return img.filter(ImageFilter.GaussianBlur(1.2))
# A: portrait 12 MP, upright, no EXIF
page(3024, 4032, ['電車   でんしゃ   train', '駅   えき   station', '切符   きっぷ   ticket', '学生   がくせい   student', '乗り換え   のりかえ'], 1).save(out + '/photoA.jpg', quality=88)
# B: stored sideways with EXIF orientation 6 (as an iPhone does); upright once oriented
stored = page(3024, 4032, ['空港   くうこう   airport', '飛行機   ひこうき   airplane'], 2).rotate(90, expand=True)
ex = stored.getexif(); ex[0x0112] = 6
stored.save(out + '/photoB.jpg', quality=88, exif=ex)
# C: small PNG
page(900, 1200, ['猫   ねこ   cat'], 3).save(out + '/photoC.png')

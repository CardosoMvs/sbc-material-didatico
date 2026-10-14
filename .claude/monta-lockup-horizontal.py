# Monta o lockup horizontal "selo + Embrapa + Empresas Apoiadoras" (proposta p1)
# a partir dos logos oficiais em logos-oficiais/. Gera: logos-oficiais/lockup-horizontal-2026.png
from PIL import Image, ImageDraw, ImageFont

BASE = 'logos-oficiais/'
H = 1500          # altura do selo (unidade de medida)
M = int(0.03 * H) # margem do canvas

def load(f):
    im = Image.open(BASE + f).convert('RGBA')
    bbox = im.getchannel('A').getbbox()
    return im.crop(bbox) if bbox else im

def bez(p0, p1, p2, n=80):
    pts = []
    for i in range(n + 1):
        t = i / n
        x = (1-t)**2*p0[0] + 2*(1-t)*t*p1[0] + t**2*p2[0]
        y = (1-t)**2*p0[1] + 2*(1-t)*t*p1[1] + t**2*p2[1]
        pts.append((x, y))
    return pts

# --- selo ---
seal = load('selo-2026-cor.png')
SW = int(H * seal.width / seal.height)
seal = seal.resize((SW, H), Image.LANCZOS)
sx, sy = M, M
sr = sx + SW
sb = sy + H

# --- Embrapa ---
eb = load('embrapa-ativo.png')
EB_W = int(0.50 * H)
eb = eb.resize((EB_W, int(EB_W * eb.height / eb.width)), Image.LANCZOS)
el = sr + int(0.21 * H)
et = sy + int(0.42 * H) - eb.height // 2

# --- arco decorativo (cinza), entre o selo e a Embrapa ---
arc_x0 = el - int(0.02 * H)
arc_y0 = sy + int(0.09 * H)
arc_x1 = el + int(0.09 * H)
arc_y1 = sb + int(0.02 * H)
ctrl = (arc_x0 - int(0.02 * H), sy + int(0.90 * H))

# --- grade das apoiadoras ---
W_GRID = int(0.39 * H)
H_GRID = int(0.30 * H)
grid_l = el + eb.width + int(0.045 * H)

canvas_w = grid_l + 3 * W_GRID + M
canvas_h = M + H + int(0.03 * H)
img = Image.new('RGBA', (canvas_w, canvas_h), (255, 255, 255, 0))
d = ImageDraw.Draw(img)

d.line(bez((arc_x0, arc_y0), ctrl, (arc_x1, arc_y1)), fill=(150, 150, 150, 255), width=int(0.005 * H))

img.paste(seal, (sx, sy), seal)
img.paste(eb, (el, et), eb)

lbl = 'Empresas Apoiadoras:'
fonte_label = ImageFont.truetype('.claude/ai-render/_roboto.ttf', int(0.062 * H))
d.text((grid_l, M - int(0.005 * H)), lbl, font=fonte_label, fill=(60, 60, 60, 255))

logos = {n: load(n + '.png') for n in ['bayer', 'bunge', 'cargill', 'cocamar', 'coamo', 'gdm', 'upl']}
cells = {  # nome -> (linha, coluna)
    'bayer': (0, 0), 'bunge': (0, 1), 'cargill': (0, 2),
    'cocamar': (1, 0), 'coamo': (1, 2),
    'gdm': (2, 0), 'upl': (2, 1),
}
max_w = {'cocamar': 1.6}  # logos maiores que a celula (vazam para a celula vizinha)
for name, (r, c) in cells.items():
    lg = logos[name]
    mw = int(W_GRID * max_w.get(name, 0.95))
    mh = int(H_GRID * 0.80)
    k = min(mw / lg.width, mh / lg.height)
    lg = lg.resize((int(lg.width * k), int(lg.height * k)), Image.LANCZOS)
    cell_x = grid_l + c * W_GRID + (W_GRID - lg.width) // 2
    cell_y = M + int(0.15 * H) + r * H_GRID + (H_GRID - lg.height) // 2
    img.paste(lg, (cell_x, cell_y), lg)

img = img.crop(img.getchannel('A').getbbox())
img.save(BASE + 'lockup-horizontal-2026.png')
print('ok', img.size)
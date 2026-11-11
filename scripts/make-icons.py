"""Regenerates the app icons from assets/app-icon-source.png (needs Pillow, numpy, scipy).
The source is a rounded icon on a black background. iPhone adds its own rounded corners, so the icons must be
full-bleed squares: this trims the soft rim shadow and extends the artwork into the corners."""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
src = Image.open('assets/app-icon-source.png').convert('RGB')
a = np.array(src).astype(int)
inside = ndi.binary_fill_holes(ndi.binary_closing(a.sum(axis=2) > 45, iterations=3))
lab, n = ndi.label(inside)
inside = lab == (1 + int(np.argmax(ndi.sum(inside, lab, range(1, n + 1)))))
inside = ndi.binary_erosion(inside, iterations=30)
box = (118, 116, 1137, 1135)  # a square inside the artwork, found for the supplied 1254-pixel source
crop = np.array(src.crop(box)).astype(float)
m = inside[box[1]:box[3], box[0]:box[2]]
idx = ndi.distance_transform_edt(~m, return_distances=False, return_indices=True)
filled = crop[idx[0], idx[1]]
soft = np.stack([ndi.gaussian_filter(filled[..., c], sigma=22) for c in range(3)], axis=-1)
w = np.clip(ndi.gaussian_filter((~m).astype(float), sigma=7) * 1.6, 0, 1)[..., None]
master = Image.fromarray(np.clip(crop * (1 - w) + soft * w, 0, 255).astype('uint8')).resize((1024, 1024), Image.LANCZOS)
for size, name in [(512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'icon-180.png'), (32, 'favicon-32.png')]:
    master.resize((size, size), Image.LANCZOS).save(f'public/{name}', optimize=True)

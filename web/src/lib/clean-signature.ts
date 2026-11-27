const TILE_SIZE = 32;

function luminance(pixels: Uint8ClampedArray, index: number): number {
  return Math.round(pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722);
}

function paperBrightness(histogram: Uint32Array, count: number, fallback: number): number {
  if (!count) return fallback;
  let seen = 0;
  for (let level = 255; level >= 0; level--) {
    seen += histogram[level];
    if (seen >= count * 0.18) return level;
  }
  return fallback;
}

export function cleanSignaturePixels(pixels: Uint8ClampedArray, width: number, height: number): void {
  const columns = Math.ceil(width / TILE_SIZE);
  const rows = Math.ceil(height / TILE_SIZE);
  const histogram = new Uint32Array(256);
  const tiles = Array.from({ length: columns * rows }, () => ({ histogram: new Uint32Array(256), count: 0 }));
  let count = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (pixels[i + 3] < 224) continue;
      const tone = luminance(pixels, i);
      const tile = tiles[Math.floor(y / TILE_SIZE) * columns + Math.floor(x / TILE_SIZE)];
      tile.histogram[tone]++;
      tile.count++;
      histogram[tone]++;
      count++;
    }
  }

  const brightestPaper = paperBrightness(histogram, count, 235);
  const globalPaper = brightestPaper >= 115 ? brightestPaper : 235;
  const background = tiles.map(tile => {
    const localPaper = paperBrightness(tile.histogram, tile.count, globalPaper);
    return tile.count >= 32 && localPaper >= globalPaper * 0.7 ? localPaper : globalPaper;
  });

  for (let y = 0; y < height; y++) {
    const tileY = Math.max(0, Math.min(rows - 1, y / TILE_SIZE - 0.5));
    const top = Math.floor(tileY);
    const bottom = Math.min(rows - 1, top + 1);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (!pixels[i + 3]) continue;
      const tileX = Math.max(0, Math.min(columns - 1, x / TILE_SIZE - 0.5));
      const left = Math.floor(tileX);
      const right = Math.min(columns - 1, left + 1);
      const upper = background[top * columns + left] * (1 - (tileX - left)) + background[top * columns + right] * (tileX - left);
      const lower = background[bottom * columns + left] * (1 - (tileX - left)) + background[bottom * columns + right] * (tileX - left);
      const paper = upper * (1 - (tileY - top)) + lower * (tileY - top);
      const darkness = 1 - luminance(pixels, i) / paper;
      const ink = Math.max(0, Math.min(1, (darkness - 0.17) / 0.4));
      pixels[i + 3] *= ink;
      if (!pixels[i + 3]) continue;
      for (let channel = 0; channel < 3; channel++) {
        pixels[i + channel] = Math.max(0, pixels[i + channel] - paper * 0.46);
      }
    }
  }
}

// Render the vector mark to Windows multi-resolution icon and PNG assets.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const sharp = createRequire(path.resolve(__dirname, '../web/package.json'))('sharp');
async function main() {
  const root = path.resolve(__dirname, '..');
  const svg = await fs.readFile(path.join(root, 'web/public/app-logo.svg'));
  const assetDir = path.join(root, 'src/DgpPass.Desktop/Assets');
  await fs.mkdir(assetDir, { recursive: true });
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = await Promise.all(sizes.map(size => sharp(svg).resize(size, size).png().toBuffer()));
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, i) => {
    const entry = 6 + i * 16;
    header[entry] = size === 256 ? 0 : size; header[entry + 1] = header[entry];
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(pngs[i].length, entry + 8); header.writeUInt32LE(offset, entry + 12);
    offset += pngs[i].length;
  });
  await fs.writeFile(path.join(assetDir, 'app.ico'), Buffer.concat([header, ...pngs]));
  await fs.writeFile(path.join(assetDir, 'app-logo.png'), pngs.at(-1));
  await sharp(svg).resize(192, 192).png().toFile(path.join(root, 'web/public/app-logo.png'));
  process.stdout.write('Generated custom app logo and seven Windows icon sizes.\n');
}
main().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });

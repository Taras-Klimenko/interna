// Собирает мебель Quaternius (Ultimate House Interior Pack, OBJ) в сжатые GLB для клиента:
// apps/client/public/models/furniture/*.glb, и пишет размеры в apps/client/src/catalog/furniture.generated.json.
//
// Запуск: pnpm assets:furniture
//
// Что делает с каждой моделью:
//  - OBJ → glTF (obj2gltf), матовые материалы вместо «металлических» из MTL;
//  - масштаб: в наборе 1 единица ≈ 0,5 м, то есть одна клетка сетки. Размер в клетках берётся из габаритов модели,
//    а если модель чуть больше своих клеток — она равномерно уменьшается, чтобы влезть (пропорции не искажаются);
//  - центр модели — по центру занятых клеток, низ — на полу (y = 0), «лицом» к +z (в комнату от задней стены);
//  - всё сливается в несколько мешей по материалам и сжимается meshopt.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import obj2gltf from 'obj2gltf';
import { Logger, NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { clearNodeTransform, dedup, flatten, join, meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'assets/source/furniture/_unpacked/OBJ');
const OUT = path.join(ROOT, 'apps/client/public/models/furniture');
const MANIFEST = path.join(ROOT, 'apps/client/src/catalog/furniture.generated.json');

/** Размер клетки в метрах — как CELL_SIZE в packages/shared. */
const CELL = 0.5;
/** Метров в одной единице набора. */
const UNIT = 0.5;
/** Модель занимает не больше этой доли своих клеток, чтобы соседние предметы не слипались. */
const FILL = 0.96;
/**
 * Blender 2.79 пишет в MTL Kd = diffuse_intensity × diffuse_color, а intensity по умолчанию 0.8.
 * Делим обратно, чтобы вернуть исходные цвета модели.
 */
const DIFFUSE_INTENSITY = 0.8;

/**
 * Какие модели берём. yaw — поворот (в градусах, против часовой сверху), чтобы модель смотрела «лицом» к +z.
 * footprint — если размер в клетках по габаритам не подходит.
 */
const MODELS = [
  { name: 'Bed_Single' },
  { name: 'Bed_King' },
  { name: 'Bookshelf' },
  { name: 'Drawer_1' },
  { name: 'NightStand_1' },
  { name: 'Table_RoundSmall' },
  { name: 'Chair_1' },
  { name: 'Stool' },
  { name: 'Couch_Small2' },
  { name: 'Couch_Medium2' },
  { name: 'Light_Stand1' },
  { name: 'Houseplant_4' },
  { name: 'Houseplant_7' },
  { name: 'Houseplant_8' },
  { name: 'Carpet_1' },
  // Круглый: габариты 2,49 × 2,53 округлились бы в 2×3.
  { name: 'Carpet_Round', footprint: { w: 3, h: 3 } },
  { name: 'Fireplace' },
];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).setLogger(new Logger(Logger.Verbosity.WARN));
await MeshoptEncoder.ready;
io.registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const round3 = (n) => Math.round(n * 1000) / 1000;

async function buildModel({ name, yaw = 0, footprint: fpOverride }) {
  const glb = await obj2gltf(path.join(SRC, `${name}.obj`), { binary: true });
  const doc = await io.readBinary(new Uint8Array(glb));
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];

  // В MTL у Quaternius Ks = 0.5, obj2gltf превращает это в полуметалл — мебель выглядит грязной. Делаем матовой.
  for (const material of root.listMaterials()) {
    const [r, g, b, alpha] = material.getBaseColorFactor();
    const fix = (c) => Math.min(1, c / DIFFUSE_INTENSITY);
    material.setBaseColorFactor([fix(r), fix(g), fix(b), alpha]).setMetallicFactor(0).setRoughnessFactor(0.85);
  }

  const { min, max } = getBounds(scene);
  const size = { x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2] };
  const turned = yaw === 90 || yaw === 270;
  // Размер «после поворота»: при 90° ширина и глубина меняются местами.
  const across = turned ? size.z : size.x;
  const deep = turned ? size.x : size.z;
  const footprint = fpOverride ?? {
    w: Math.max(1, Math.round((across * UNIT) / CELL)),
    h: Math.max(1, Math.round((deep * UNIT) / CELL)),
  };
  const scale = UNIT * Math.min(1, (footprint.w * CELL * FILL) / (across * UNIT), (footprint.h * CELL * FILL) / (deep * UNIT));

  // Новый корень: сначала центрируем (по x/z — центр габаритов, по y — низ), потом масштаб и поворот.
  const center = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
  const a = (yaw * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  // Поворот вокруг y: (x, z) → (x·cos + z·sin, −x·sin + z·cos).
  const rx = center[0] * cos + center[2] * sin;
  const rz = -center[0] * sin + center[2] * cos;
  const pivot = doc
    .createNode(name)
    .setScale([scale, scale, scale])
    .setRotation([0, Math.sin(a / 2), 0, Math.cos(a / 2)])
    .setTranslation([-rx * scale, -center[1] * scale, -rz * scale]);
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    pivot.addChild(child);
  }
  scene.addChild(pivot);

  // Запекаем все трансформации в вершины и сливаем меши с одинаковым материалом: меньше draw calls.
  await doc.transform(flatten());
  for (const node of root.listNodes()) clearNodeTransform(node);
  await doc.transform(join({ keepNamed: false }), dedup(), prune(), weld(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));

  const final = getBounds(scene);
  const height = round3(final.max[1] - final.min[1]);
  await io.write(path.join(OUT, `${name}.glb`), doc);
  const tris = root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
  console.log(
    `${name.padEnd(18)} ${footprint.w}×${footprint.h} клеток, высота ${height} м, масштаб ${round3(scale)}, ${tris} треугольников, ${root.listMaterials().length} материалов`,
  );
  return { url: `/models/furniture/${name}.glb`, footprint, height };
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const manifest = {};
for (const model of MODELS) manifest[model.name] = await buildModel(model);
await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`done → ${path.relative(ROOT, OUT)}, ${path.relative(ROOT, MANIFEST)}`);

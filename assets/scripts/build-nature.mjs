// Собирает природу Quaternius (Stylized Nature MegaKit, Standard, glTF) в один сжатый GLB для прогулки по полю:
// apps/client/public/models/nature/nature.glb, а размеры моделей — в apps/client/src/field/nature.generated.json.
//
// Запуск: pnpm assets:nature (архив распакован в assets/source/nature/_unpacked, см. README).
//
// Что делает:
//  - берёт выбранные модели и кладёт каждую в отдельный узел с её именем (CommonTree_1, Flower_3_Group…);
//  - подгоняет масштаб: набор сделан в метрах, но цветы и кусты в нём крупноваты для нашего поля;
//  - всё в одном файле: общие текстуры (листья, цветы, кора) скачиваются один раз;
//  - текстуры ужимает в WebP (кора — до 512 px, листья и цветы — до 1024), геометрию сжимает meshopt.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Document, Logger, NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, meshopt, prune, textureCompress, unpartition, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'assets/source/nature/_unpacked/glTF');
const OUT = path.join(ROOT, 'apps/client/public/models/nature');
const MANIFEST = path.join(ROOT, 'apps/client/src/field/nature.generated.json');

/**
 * Какие модели берём и во сколько раз уменьшаем. kind — для клиента: деревья ставятся редко и с ними сталкиваются,
 * растения и камни — россыпью.
 */
const MODELS = {
  // Деревья: 5–7 м.
  CommonTree_1: { scale: 0.75, kind: 'tree' },
  CommonTree_2: { scale: 0.75, kind: 'tree' },
  CommonTree_3: { scale: 0.7, kind: 'tree' },
  CommonTree_4: { scale: 0.7, kind: 'tree' },
  CommonTree_5: { scale: 0.75, kind: 'tree' },
  Pine_1: { scale: 0.75, kind: 'tree' },
  Pine_2: { scale: 0.75, kind: 'tree' },
  Pine_3: { scale: 0.75, kind: 'tree' },
  Pine_4: { scale: 0.65, kind: 'tree' },
  Pine_5: { scale: 0.7, kind: 'tree' },
  // Кусты по пояс.
  Bush_Common_Flowers: { scale: 0.55, kind: 'bush' },
  // Цветы — по колено.
  Flower_3_Group: { scale: 0.26, kind: 'flower' },
  Flower_4_Group: { scale: 0.24, kind: 'flower' },
  Flower_3_Single: { scale: 0.26, kind: 'flower' },
  Flower_4_Single: { scale: 0.24, kind: 'flower' },
  // Низкие растения.
  Fern_1: { scale: 0.4, kind: 'plant' },
  Clover_1: { scale: 0.28, kind: 'plant' },
  Clover_2: { scale: 0.28, kind: 'plant' },
  Plant_1: { scale: 0.45, kind: 'plant' },
  Plant_7: { scale: 0.6, kind: 'plant' },
  Mushroom_Common: { scale: 0.45, kind: 'plant' },
  // Камни.
  Rock_Medium_1: { scale: 0.45, kind: 'rock' },
  Rock_Medium_2: { scale: 0.45, kind: 'rock' },
  Rock_Medium_3: { scale: 0.4, kind: 'rock' },
  Pebble_Round_1: { scale: 1, kind: 'pebble' },
  Pebble_Round_3: { scale: 1, kind: 'pebble' },
  Pebble_Square_2: { scale: 1, kind: 'pebble' },
};

/** Префикс узлов-моделей в файле (клиент его отрезает: см. apps/client/src/field/nature.ts). */
const HOLDER_PREFIX = 'Model_';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).setLogger(new Logger(Logger.Verbosity.WARN));
await MeshoptEncoder.ready;
io.registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const doc = new Document();
doc.createBuffer();
const scene = doc.createScene('nature');
const manifest = {};

for (const [name, { scale, kind }] of Object.entries(MODELS)) {
  const source = await io.read(path.join(SRC, `${name}.gltf`));
  const sourceScene = source.getRoot().listScenes()[0];
  // В цвете вершин (COLOR_0) набор хранит данные для своего шейдера ветра. Нам он не нужен, а three.js умножил бы
  // на него цвет и прозрачность — и листва деревьев целиком отсеклась бы порогом прозрачности.
  for (const mesh of source.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) prim.setAttribute('COLOR_0', null);
  const map = mergeDocuments(doc, source);
  const merged = map.get(sourceScene);
  // Модель целиком — в узле «Model_<имя>»; масштаб на этом узле. Префикс — потому что внутренний меш часто
  // называется так же, как модель, а загрузчик glTF при совпадении переименовал бы один из узлов.
  const holder = doc.createNode(HOLDER_PREFIX + name).setScale([scale, scale, scale]);
  for (const child of merged.listChildren()) holder.addChild(child);
  merged.dispose();
  scene.addChild(holder);

  const bounds = getBounds(holder);
  manifest[name] = {
    kind,
    height: +(bounds.max[1] - Math.max(0, bounds.min[1])).toFixed(2),
    // Полуширина кроны/куста — для расстановки (чтобы не слипались).
    radius: +(Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]) / 2).toFixed(2),
  };
}

await doc.transform(
  unpartition(),
  dedup(),
  prune(),
  weld(),
  // Кора — мелкая деталь, хватит 512 px; листья и цветы видны крупно — 1024.
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], pattern: /Bark/i, quality: 82 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 85 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);

await mkdir(OUT, { recursive: true });
await io.write(path.join(OUT, 'nature.glb'), doc);
await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

const textures = doc.getRoot().listTextures().map((t) => `${t.getName() || t.getURI()} ${Math.round((t.getImage()?.byteLength ?? 0) / 1024)} КБ`);
console.log(`nature.glb: ${Object.keys(MODELS).length} моделей; текстуры: ${textures.join(', ')}`);

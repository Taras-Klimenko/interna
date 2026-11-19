// Собирает персонажей и анимации Quaternius из assets/source/characters/_unpacked
// в сжатые GLB для клиента: apps/client/public/models/characters.
//
// Запуск: pnpm assets:characters
//
// Что делает:
//  - чинит ссылки на текстуры, которых нет в архиве (T_*_png.png → T_*.png);
//  - сжимает текстуры в WebP 1024px, геометрию — meshopt;
//  - из библиотек анимаций оставляет только нужные клипы и выкидывает манекен.

import { cp, mkdir, rm, access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress, meshopt, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'assets/source/characters/_unpacked');
const WORK = path.join(ROOT, 'assets/.work/characters');
const OUT = path.join(ROOT, 'apps/client/public/models/characters');

const BASE = path.join(SRC, 'base/Universal Base Characters[Standard]');
const BODIES_DIR = path.join(BASE, 'Base Characters/Godot - UE');
const HAIR_DIR = path.join(BASE, 'Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)');

const BODIES = { male: 'Superhero_Male_FullBody', female: 'Superhero_Female_FullBody' };
const HAIR = [
  'Hair_SimpleParted',
  'Hair_Long',
  'Hair_Buns',
  'Hair_Buzzed',
  'Hair_BuzzedFemale',
  'Hair_Beard',
  'Eyebrows_Regular',
  'Eyebrows_Female',
];

// Анимации без root motion: персонажа по комнате двигает игра, а не клип.
const ANIMATION_SETS = {
  ual1: {
    file: path.join(SRC, 'ual1/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb'),
    keep: [
      'Idle_Loop',
      'Idle_Talking_Loop',
      'Walk_Loop',
      'Walk_Formal_Loop',
      'Jog_Fwd_Loop',
      'Sitting_Enter',
      'Sitting_Idle_Loop',
      'Sitting_Talking_Loop',
      'Sitting_Exit',
      'Interact',
      'PickUp_Table',
      'Fixing_Kneeling',
      'Crouch_Idle_Loop',
      'Dance_Loop',
    ],
  },
  ual2: {
    file: path.join(SRC, 'ual2/Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb'),
    keep: [
      'Yes',
      'Idle_No_Loop',
      'Idle_FoldArms_Loop',
      'Idle_TalkingPhone_Loop',
      'Consume',
      'Farm_Watering',
      'Chest_Open',
      'LayToIdle',
      'Walk_Carry_Loop',
    ],
  },
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptEncoder.ready;
io.registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const exists = (p) => access(p).then(() => true, () => false);

/** Копирует .gltf со всеми файлами рядом в рабочую папку и чинит битые ссылки на картинки. */
async function prepareGltf(dir, name) {
  const workDir = path.join(WORK, name);
  await rm(workDir, { recursive: true, force: true });
  await cp(dir, workDir, { recursive: true });
  const gltfPath = path.join(workDir, `${name}.gltf`);
  const json = JSON.parse(await readFile(gltfPath, 'utf8'));
  for (const image of json.images ?? []) {
    if (!image.uri || (await exists(path.join(workDir, image.uri)))) continue;
    const fixed = image.uri.replace(/_png\.png$/, '.png');
    if (await exists(path.join(workDir, fixed))) {
      console.log(`  fix texture: ${image.uri} → ${fixed}`);
      image.uri = fixed;
    } else {
      throw new Error(`${name}: missing texture ${image.uri}`);
    }
  }
  await writeFile(gltfPath, JSON.stringify(json));
  return gltfPath;
}

async function compressAndWrite(doc, outFile, { textures = true } = {}) {
  const steps = [dedup(), prune(), weld()];
  if (textures) {
    steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 85 }));
  }
  steps.push(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await doc.transform(...steps);
  await mkdir(path.dirname(outFile), { recursive: true });
  await io.write(outFile, doc);
}

async function buildModel(dir, name, outFile) {
  console.log(`model: ${name}`);
  const doc = await io.read(await prepareGltf(dir, name));
  await compressAndWrite(doc, outFile);
}

async function buildAnimations(id, { file, keep }) {
  console.log(`animations: ${id}`);
  const doc = await io.read(file);
  const root = doc.getRoot();
  const found = new Set();
  for (const anim of root.listAnimations()) {
    if (keep.includes(anim.getName())) found.add(anim.getName());
    else anim.dispose();
  }
  const missing = keep.filter((n) => !found.has(n));
  if (missing.length) throw new Error(`${id}: animations not found: ${missing.join(', ')}`);
  // Манекен не нужен: оставляем только кости, на которые ссылаются клипы.
  for (const node of root.listNodes()) {
    node.setMesh(null);
    node.setSkin(null);
  }
  for (const mesh of root.listMeshes()) mesh.dispose();
  for (const skin of root.listSkins()) skin.dispose();
  await doc.transform(resample());
  await compressAndWrite(doc, path.join(OUT, `animations-${id}.glb`), { textures: false });
}

await rm(OUT, { recursive: true, force: true });
for (const [id, name] of Object.entries(BODIES)) {
  await buildModel(BODIES_DIR, name, path.join(OUT, `body-${id}.glb`));
}
for (const name of HAIR) {
  await buildModel(HAIR_DIR, name, path.join(OUT, `hair/${name}.glb`));
}
for (const [id, set] of Object.entries(ANIMATION_SETS)) {
  await buildAnimations(id, set);
}
console.log(`done → ${path.relative(ROOT, OUT)}`);

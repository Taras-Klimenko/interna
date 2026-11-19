// Печатает анимации, скелет и меши glTF/GLB-файла.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const file of process.argv.slice(2)) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  console.log(`\n=== ${file}`);
  const anims = root.listAnimations().map((a) => {
    let max = 0;
    for (const s of a.listSamplers()) { const t = s.getInput(); if (t) max = Math.max(max, t.getMax([])[0]); }
    return `${a.getName()} (${max.toFixed(1)}s)`;
  });
  console.log(`animations: ${anims.length}`);
  if (anims.length) console.log('  ' + anims.join(', '));
  const skins = root.listSkins();
  console.log(`skins: ${skins.length}; joints: ${skins[0]?.listJoints().length ?? 0}`);
  if (skins[0]) console.log('  joints: ' + skins[0].listJoints().map((j) => j.getName()).slice(0, 70).join(', '));
  console.log('meshes: ' + root.listMeshes().map((m) => `${m.getName()}[${m.listPrimitives().length}]`).join(', '));
  console.log('materials: ' + root.listMaterials().map((m) => m.getName()).join(', '));
  console.log('textures: ' + root.listTextures().map((t) => `${t.getName() || t.getURI()} ${t.getImage()?.byteLength ?? 0}B`).join(', '));
  const scene = root.listScenes()[0];
  const n = scene?.listChildren()[0];
  if (n) console.log(`top node: ${n.getName()} scale=${n.getScale()} rot=${n.getRotation()}`);
}

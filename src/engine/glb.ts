// Minimal GLB loader for the Blender pipeline output: POSITION, NORMAL, COLOR_0, indices,
// node hierarchy with TRS transforms. No materials/textures (the game shades everything).
import { mat4, type Mat4 } from './math';

export interface MeshData {
  name: string;
  /** Interleaved position(3) normal(3) color(4) */
  vertices: Float32Array;
  indices: Uint32Array;
  /** Node world transform inside the model. */
  matrix: Mat4;
  boundsMin: [number, number, number];
  boundsMax: [number, number, number];
}

export interface ModelData {
  meshes: MeshData[];
  nodes: Map<string, Mat4>;
}

export const VERTEX_FLOATS = 10;

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export async function loadGLB(url: string): Promise<ModelData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return parseGLB(await res.arrayBuffer());
}

export function parseGLB(buf: ArrayBuffer): ModelData {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('Not a GLB file');
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const binOffset = 20 + jsonLen + 8;

  const read = (index: number): { data: Float32Array | Uint32Array; comps: number } => {
    const acc = json.accessors[index];
    const view = json.bufferViews[acc.bufferView];
    const comps = COMPONENTS[acc.type];
    const count = acc.count * comps;
    const off = binOffset + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const stride = view.byteStride;
    if (stride && stride !== comps * byteSize(acc.componentType)) throw new Error('Strided accessors unsupported');
    switch (acc.componentType) {
      case 5126: return { data: new Float32Array(buf.slice(off, off + count * 4)), comps };
      case 5125: return { data: new Uint32Array(buf.slice(off, off + count * 4)), comps };
      case 5123: {
        const src = new Uint16Array(buf.slice(off, off + count * 2));
        if (acc.normalized) return { data: Float32Array.from(src, (v) => v / 65535), comps };
        return { data: Uint32Array.from(src), comps };
      }
      case 5121: {
        const src = new Uint8Array(buf.slice(off, off + count));
        if (acc.normalized) return { data: Float32Array.from(src, (v) => v / 255), comps };
        return { data: Uint32Array.from(src), comps };
      }
      default: throw new Error(`Unsupported component type ${acc.componentType}`);
    }
  };

  const nodes = new Map<string, Mat4>();
  const meshes: MeshData[] = [];

  const visit = (ni: number, parent: Mat4) => {
    const node = json.nodes[ni];
    const local = mat4.create();
    if (node.matrix) local.set(node.matrix);
    else {
      const [tx, ty, tz] = node.translation ?? [0, 0, 0];
      const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
      const [sx, sy, sz] = node.scale ?? [1, 1, 1];
      const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz;
      const wx = qw * qx, wy = qw * qy, wz = qw * qz;
      local.set([
        (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
        2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
        2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
        tx, ty, tz, 1,
      ]);
    }
    const world = mat4.multiply(mat4.create(), parent, local);
    const name: string = node.name ?? `node${ni}`;
    nodes.set(name, world);
    if (node.mesh !== undefined) meshes.push(buildMesh(name, json.meshes[node.mesh], world, read));
    for (const c of node.children ?? []) visit(c, world);
  };
  const scene = json.scenes[json.scene ?? 0];
  for (const ni of scene.nodes) visit(ni, mat4.create());
  return { meshes, nodes };
}

function byteSize(ct: number) {
  return ct === 5126 || ct === 5125 ? 4 : ct === 5123 ? 2 : 1;
}

function buildMesh(
  name: string,
  mesh: any,
  matrix: Mat4,
  read: (i: number) => { data: Float32Array | Uint32Array; comps: number },
): MeshData {
  const verts: number[] = [];
  const idx: number[] = [];
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const prim of mesh.primitives) {
    const base = verts.length / 10;
    const pos = read(prim.attributes.POSITION).data;
    const nor = prim.attributes.NORMAL !== undefined ? read(prim.attributes.NORMAL).data : null;
    const colAcc = prim.attributes.COLOR_0 !== undefined ? read(prim.attributes.COLOR_0) : null;
    const n = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      verts.push(x, y, z);
      verts.push(nor ? nor[i * 3] : 0, nor ? nor[i * 3 + 1] : 1, nor ? nor[i * 3 + 2] : 0);
      if (colAcc) {
        const c = colAcc.data, k = colAcc.comps;
        verts.push(c[i * k], c[i * k + 1], c[i * k + 2], k === 4 ? c[i * k + 3] : 1);
      } else verts.push(1, 1, 1, 1);
      min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y); min[2] = Math.min(min[2], z);
      max[0] = Math.max(max[0], x); max[1] = Math.max(max[1], y); max[2] = Math.max(max[2], z);
    }
    if (prim.indices !== undefined) for (const v of read(prim.indices).data) idx.push(base + v);
    else for (let i = 0; i < n; i++) idx.push(base + i);
  }
  return { name, vertices: new Float32Array(verts), indices: new Uint32Array(idx), matrix, boundsMin: min, boundsMax: max };
}

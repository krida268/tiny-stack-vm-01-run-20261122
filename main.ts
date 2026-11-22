// Tiny Stack VM: make.fun's tiny stack ISA. One run answers a whole set:
// /input/<id>/program.bin + input.bin -> /output/<id>/stdout.bin + exit.txt.
// Runs as `node /bot/main.ts` (Node 22).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// [opcode, imm, pops, pushes]; absent bytes are not opcodes.
const SH = [
  [0, 0, 0, 0], [1, 1, 0, 1], [2, 4, 0, 1], [3, 0, 1, 0],
  [4, 0, 1, 2], [5, 0, 2, 2], [6, 0, 2, 3], [7, 0, 3, 3],
  [16, 0, 2, 1], [17, 0, 2, 1], [18, 0, 2, 1], [19, 0, 2, 1],
  [20, 0, 2, 1], [21, 0, 2, 1], [22, 0, 2, 1], [23, 0, 1, 1],
  [24, 0, 2, 1], [25, 0, 2, 1], [26, 0, 2, 1], [27, 0, 1, 1],
  [28, 0, 2, 1], [29, 0, 2, 1], [30, 0, 2, 1], [32, 0, 2, 1],
  [33, 0, 2, 1], [34, 0, 2, 1], [48, 2, 0, 0], [49, 2, 1, 0],
  [50, 2, 1, 0], [51, 2, 0, 0], [52, 0, 0, 0], [64, 0, 1, 1],
  [65, 0, 2, 0], [80, 0, 1, 0], [81, 0, 1, 0], [82, 0, 0, 1],
  [83, 0, 1, 0],
];
const IM = new Uint8Array(256), PO = new Uint8Array(256),
  PU = new Uint8Array(256), OK = new Uint8Array(256);
for (const [o, i, p, u] of SH) { IM[o] = i; PO[o] = p; PU[o] = u; OK[o] = 1; }

function run(code, input) {
  const n = code.length, D = new Int32Array(256), C = new Int32Array(64),
    M = new Int32Array(256), out = new Uint8Array(65536);
  let sp = 0, cp = 0, ol = 0, ip = 0, pc = 0, st = 0;
  const end = (e) => ({ b: out.slice(0, ol), c: e });
  for (;;) {
    if (st === 1000000) return end(10);
    if (pc < 0 || pc >= n) return end(9);
    const op = code[pc];
    if (!OK[op]) return end(5);
    const im = IM[op];
    if (pc + im >= n) return end(9);
    st++;
    if (sp < PO[op]) return end(2);
    if (sp - PO[op] + PU[op] > 256) return end(3);
    const nx = pc + 1 + im;
    pc = nx;
    switch (op) {
      case 0: return end(0);
      case 1: D[sp++] = (code[nx - 1] << 24) >> 24; break;
      case 2:
        D[sp++] = code[nx - 4] | (code[nx - 3] << 8) | (code[nx - 2] << 16) | (code[nx - 1] << 24);
        break;
      case 3: sp--; break;
      case 4: D[sp] = D[sp - 1]; sp++; break;
      case 5: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
      case 6: D[sp] = D[sp - 2]; sp++; break;
      case 7: { const t = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = t; break; }
      case 23: D[sp - 1] = -D[sp - 1] | 0; break;
      case 27: D[sp - 1] = ~D[sp - 1]; break;
      case 16: case 17: case 18: case 19: case 20: case 21: case 22:
      case 24: case 25: case 26: case 28: case 29: case 30: case 32:
      case 33: case 34: {
        const b = D[sp - 1], a = D[sp - 2];
        let r;
        if (op === 16) r = (a + b) | 0;
        else if (op === 17) r = (a - b) | 0;
        else if (op === 18) r = Math.imul(a, b);
        else if (op === 19) { if (!b) return end(4); r = (a / b) | 0; }
        else if (op === 20) { if (!b) return end(4); r = (a % b) | 0; }
        else if (op === 21) { if (!b) return end(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
        else if (op === 22) { if (!b) return end(4); r = ((a >>> 0) % (b >>> 0)) | 0; }
        else if (op === 24) r = a & b;
        else if (op === 25) r = a | b;
        else if (op === 26) r = a ^ b;
        else if (op === 28) r = a << (b & 31);
        else if (op === 29) r = a >> (b & 31);
        else if (op === 30) r = (a >>> (b & 31)) | 0;
        else if (op === 32) r = a === b ? 1 : 0;
        else if (op === 33) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        D[sp - 2] = r; sp--;
        break;
      }
      case 48: case 49: case 50: {
        const rel = ((code[nx - 2] | (code[nx - 1] << 8)) << 16) >> 16;
        let take = op === 48;
        if (op !== 48) { const v = D[--sp]; take = op === 49 ? v === 0 : v !== 0; }
        if (take) pc = nx + rel;
        break;
      }
      case 51:
        if (cp === 64) return end(7);
        C[cp++] = nx;
        pc = code[nx - 2] | (code[nx - 1] << 8);
        break;
      case 52:
        if (!cp) return end(8);
        pc = C[--cp];
        break;
      case 64: {
        const ad = D[sp - 1];
        if (ad < 0 || ad > 255) return end(6);
        D[sp - 1] = M[ad];
        break;
      }
      case 65: {
        const ad = D[sp - 1], v = D[sp - 2];
        if (ad < 0 || ad > 255) return end(6);
        sp -= 2; M[ad] = v;
        break;
      }
      case 80: {
        const t = String(D[sp - 1]);
        if (ol + t.length > 65536) return end(11);
        sp--;
        for (let i = 0; i < t.length; i++) out[ol++] = t.charCodeAt(i);
        break;
      }
      case 81:
        if (ol + 1 > 65536) return end(11);
        out[ol++] = D[--sp] & 255;
        break;
      case 82:
        D[sp++] = ip < input.length ? input[ip++] : -1;
        break;
      case 83:
        return end(D[--sp] & 255);
      default: return end(5);
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  let r;
  try {
    r = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))), new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  } catch { continue; } // a stray non-instance entry must not sink the set
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.b);
  writeFileSync(join(O, id, 'exit.txt'), `${r.c}\n`);
}

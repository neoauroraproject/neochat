/**
 * A small QR code encoder (byte mode, error correction M, versions 1–10, up to 213 bytes) so
 * profile codes work with no network and no outside library. Follows ISO/IEC 18004; the layout
 * steps mirror Project Nayuki's well-known reference implementation.
 */

// [total codewords, ec codewords per block, blocks of the shorter kind, data codewords in those]
const TABLE: [number, number, number, number][] = [
  [0, 0, 0, 0],
  [26, 10, 1, 16],
  [44, 16, 1, 28],
  [70, 26, 1, 44],
  [100, 18, 2, 32],
  [134, 24, 2, 43],
  [172, 16, 4, 27],
  [196, 18, 4, 31],
  [242, 22, 2, 38],
  [292, 22, 3, 36],
  [346, 26, 4, 43],
];
const ALIGN: number[][] = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

function blocksFor(v: number) {
  const [total, ec, nShort, shortData] = TABLE[v];
  const nLong = (total - nShort * (shortData + ec)) / (shortData + 1 + ec);
  const blocks: number[] = [];
  for (let i = 0; i < nShort; i++) blocks.push(shortData);
  for (let i = 0; i < nLong; i++) blocks.push(shortData + 1);
  return { ec, blocks, dataTotal: blocks.reduce((a, b) => a + b, 0) };
}

const gfMul = (x: number, y: number) => {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
};

function rsDivisor(degree: number) {
  const r = new Array<number>(degree).fill(0);
  r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = gfMul(r[j], root);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    root = gfMul(root, 2);
  }
  return r;
}

function rsRemainder(data: number[], div: number[]) {
  const r = div.map(() => 0);
  for (const b of data) {
    const f = b ^ (r.shift() as number);
    r.push(0);
    div.forEach((c, i) => (r[i] ^= gfMul(c, f)));
  }
  return r;
}

export function qrMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  let version = 1;
  for (; version <= 10; version++) {
    const cap = blocksFor(version).dataTotal * 8;
    const need = 4 + (version < 10 ? 8 : 16) + bytes.length * 8;
    if (need <= cap) break;
  }
  if (version > 10) throw new Error("text too long for a QR code here");
  const { ec, blocks, dataTotal } = blocksFor(version);

  // Bit stream: byte mode, length, data, terminator, padding.
  const bits: number[] = [];
  const push = (val: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  push(4, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((b) => push(b, 8));
  push(0, Math.min(4, dataTotal * 8 - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < dataTotal * 8; pad ^= 0xec ^ 0x11) push(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));

  // Split into blocks, add error correction, interleave.
  const div = rsDivisor(ec);
  const dBlocks: number[][] = [];
  const eBlocks: number[][] = [];
  let k = 0;
  for (const len of blocks) {
    const d = data.slice(k, k + len);
    k += len;
    dBlocks.push(d);
    eBlocks.push(rsRemainder(d, div));
  }
  const words: number[] = [];
  for (let i = 0; i < Math.max(...blocks); i++)
    for (const d of dBlocks) if (i < d.length) words.push(d[i]);
  for (let i = 0; i < ec; i++) for (const e of eBlocks) words.push(e[i]);

  const size = version * 4 + 17;
  const mod = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    mod[y][x] = dark;
    fn[y][x] = true;
  };

  // Timing patterns, finders, alignment patterns.
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  const al = ALIGN[version];
  for (let i = 0; i < al.length; i++)
    for (let j = 0; j < al.length; j++) {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === al.length - 1) ||
        (i === al.length - 1 && j === 0)
      )
        continue;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }

  // Format bits (error correction M = 00 plus the mask), drawn again once the mask is chosen.
  const drawFormat = (mask: number) => {
    let rem = mask;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((mask << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((f >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const v = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((v >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, dark);
      set(b, a, dark);
    }
  }

  // Data in the zigzag order.
  let bi = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const up = ((right + 1) & 2) === 0;
        const y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && bi < words.length * 8) {
          mod[y][x] = ((words[bi >>> 3] >>> (7 - (bi & 7))) & 1) === 1;
          bi++;
        }
      }
  }

  const masks: ((x: number, y: number) => boolean)[] = [
    (x, y) => (x + y) % 2 === 0,
    (_, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const applyMask = (m: number) => {
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) if (!fn[y][x] && masks[m](x, y)) mod[y][x] = !mod[y][x];
  };
  // A light penalty (long runs, 2×2 blocks, dark/light balance) picks a mask that scans well.
  const penalty = () => {
    let p = 0;
    const runs = (get: (a: number, b: number) => boolean) => {
      for (let a = 0; a < size; a++) {
        let run = 1;
        for (let b = 1; b < size; b++) {
          if (get(a, b) === get(a, b - 1)) run++;
          else {
            if (run >= 5) p += run - 2;
            run = 1;
          }
        }
        if (run >= 5) p += run - 2;
      }
    };
    runs((y, x) => mod[y][x]);
    runs((x, y) => mod[y][x]);
    let dark = 0;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        if (mod[y][x]) dark++;
        if (x < size - 1 && y < size - 1) {
          const c = mod[y][x];
          if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
        }
      }
    p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return p;
  };
  let best = 0;
  let bestP = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m);
    drawFormat(m);
    const p = penalty();
    if (p < bestP) {
      bestP = p;
      best = m;
    }
    applyMask(m); // XOR again undoes it
  }
  applyMask(best);
  drawFormat(best);
  return mod;
}

/** The code as an SVG path, one unit per module, with the quiet zone included. */
export function qrSvgPath(text: string): { size: number; d: string } {
  const m = qrMatrix(text);
  const q = 4;
  let d = "";
  m.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x + q} ${y + q}h1v1h-1z`;
    }),
  );
  return { size: m.length + q * 2, d };
}

// Mockup crew sprites (chibi pixel art). Letters index each sprite's palette; '.' is empty.
// Outlines are added automatically around every filled pixel.
const OUTLINE = '#0b0814';
const FACE_EYES = '...sKessssKess..';

const CREW = {
  david: { name: 'David', role: 'claude-code', model: 'Claude', work: 'laptop',
    pal: { h: '#5a3a26', H: '#3a2418', S: '#b98a63', s: '#d9a57c', K: '#2a1a12', e: '#4a3226', r: '#a85a4a',
           j: '#f2cf1d', J: '#f4f1e2', a: '#2fb8e8', b: '#2a2230', p: '#6e6458', P: '#575046', o: '#2a2420' },
    rows: ['......hhhh......', '....hhhhhhhh....', '...hhhhhhhhhh...', '..hhhhhhhhhhhh..', '..Hhhhhhhhhhhh..',
      '..HSsshhhhhssS..', FACE_EYES, '...ssssssssss...', '....sssrrsss....', '.....ssssss.....', '......SSSS......',
      '.....aajbbjaa...', '...jjJjbbjJjj...', '..jjJjjbbjjJjj..', '..jjjJjbbjJjjj..', '..jJjjjbbjjjJj..', '..ssjjjbbjjjss..',
      '....pppppppp....', '....pppPPppp....', '....ppp..ppp....', '....ppp..ppp....', '....ooo..ooo....'] },
  lucy: { name: 'Lucy', role: 'coder', model: 'qwen2.5-coder:7b', work: 'jack-in',
    pal: { h: '#eef0f6', H: '#b9bfd6', s: '#f3dfd6', S: '#d9bfb6', K: '#3a2a44', r: '#e8304a',
           j: '#e8e4ee', J: '#a9a3b5', b: '#5a3a6e', a: '#e8304a', p: '#5a3a6e', o: '#3b3646' },
    rows: ['.....hhhhhh.....', '...hhhhhhhhhh...', '..hhhhhhhhhhhh..', '..hhhhhhhhhhhh..', '..hhHhhhhhhHhh..',
      '..hhsssssssshh..', '..hsKrssssKrsh..', '..hssssssssssh..', '..hssssrssssh...', '..h..ssssss..h..', '..h...SSSS...h..',
      '.....jjbbjj.....', '...jjjbbbbjjj...', '..jjjjbabbjjjj..', '..jjJbbabbbJjj..', '..jjJbbbbbbJjj..', '..ssJbbbbbbJss..',
      '....bbbbbbbb....', '....pppppppp....', '....JJJ..JJJ....', '....JJJ..JJJ....', '....ooo..ooo....'] },
  rebecca: { name: 'Rebecca', role: 'vision', model: 'qwen3-vl:4b', work: 'laptop',
    pal: { h: '#8fe3c0', H: '#5fb595', s: '#f2d2c8', S: '#d4aea2', K: '#2a1a2a', e: '#ff8a1e', r: '#c2405a',
           j: '#1c1826', J: '#2e2840', a: '#9cff4a', t: '#ff7fbf', o: '#1c1826' },
    rows: ['..hh........hh..', '.hhh.hhhhhh.hhh.', '.hh.hhhhhhhh.hh.', '.h.hhhhhhhhhh.h.', '..hhhhhhhhhhhh..',
      '..hhssssssssHh..', FACE_EYES, '...ssssssssss...', '....ssrrrrss....', '.....ssssss.....', '......SSSS......',
      '.....jjjjjj.....', '...jjjjjjjjjj...', '..jjjjjjjjjjjj..', '..jjJjjjjjjJjj..', '..jaJjjjjjjJaj..', '..ssaaaaaaaass..',
      '....stssssts....', '....sss..sss....', '....ooo..ooo....'] },
  kiwi: { name: 'Kiwi', role: 'memory', model: 'memory-cpu', work: 'jack-in',
    pal: { h: '#f1d7c4', H: '#d7b39c', s: '#f0d8cc', K: '#2a1a22', e: '#5a3a3a', m: '#e0304a',
           j: '#d42a36', J: '#8e1c2a', b: '#1a1520', o: '#1a1520' },
    rows: ['.....hhhhhh.....', '...hhhhhhhhhh...', '..hhhhhhhhhhhh..', '..hhhhhhhhhhhh..', '..hhhhhhhhhhhh..',
      '..hhsKessKeshh..', '..hhmmmmmmmmhh..', '..hhmmmmmmmmhh..', '..hh.mmmmmm.hh..', '......mmmm......',
      '....jjjjjjjj....', '...jjjjjjjjjj...', '..jjJjjbbjjJjj..', '..jjjJjbbjJjjj..', '..jjJjjbbjjJjj..', '..sjjjjbbjjjjs..',
      '..jjjjjbbjjjjj..', '..jjjJbbbbJjjj..', '..jjj.bb.bb.jjj.', '..jj..bb.bb..jj.', '......oo.oo.....'] },
  maine: { name: 'Maine', role: 'planner', model: 'qwen3:8b', work: 'holo table',
    pal: { h: '#e8cf7a', H: '#b89c4a', s: '#7a4a32', S: '#5e3624', K: '#1a0e0a', e: '#2a1a12', c: '#ff2a2a', r: '#4a2418',
           a: '#d6252e', j: '#18141c', b: '#2a2028', d: '#c9773a', D: '#8a4e22', p: '#2a2430', o: '#141018' },
    rows: ['....hhhhhhhhhhhh....', '....hhhhhhhhhhhh....', '....HHHHHHHHHHHH....', '....ssssssssssss....',
      '....sKcsssssKess....', '....ssssssssssss....', '....sssssrrsssss....', '.....SssssssssS.....',
      '...aaaaaaaaaaaaaa...', '..jjaaaaaaaaaaaajj..', '.jjjjjddddddddjjjjj.', '.jjjjjdDddddDdjjjjj.',
      '.jjjjjddddddddjjjjj.', '.jjjjjdDddddDdjjjjj.', '.ssjjjddddddddjjjss.', '.ssjjjjbbbbbbjjjjss.',
      '..jjjjjbbbbbbjjjjj..', '..jjjjpppppppppjjj..', '..jjj.ppppppppp.jjj.', '..jj..pppp..pppp.jj.',
      '......pppp..pppp....', '......oooo..oooo....'] },
  falco: { name: 'Falco', role: 'trimmer', model: 'trimmer-cpu', work: 'laptop',
    pal: { h: '#c9c9c9', H: '#9a9a9a', s: '#c48b62', S: '#9b6a49', K: '#2a1a12', e: '#3a2a20', r: '#7a3a2a', B: '#8e8e8e',
           j: '#6b3f26', J: '#4a2a18', b: '#c7a47a', a: '#c7a47a', p: '#3a3440', P: '#2e2a34', o: '#1e1a20' },
    rows: ['......hhhh......', '....hhhhhhhh....', '...hhhhhhhhhh...', '...hHhhhhhhhHh..', '...hsssssssssh..',
      FACE_EYES, '...ssssssssss...', '...sBBBrrBBBs...', '....BBBBBBBB....', '......SSSS......',
      '.....jjbbjj.....', '...jjjjbbjjjj...', '..jjjjjbbjjjjj..', '..jjJjjbbjjJjj..', '..jjJjjbbjjJjj..', '..ssjjjbbjjjss..',
      '....pppppppp....', '....pppPPppp....', '....ppp..ppp....', '....ppp..ppp....', '....ooo..ooo....'] },
};

function spriteProblems() {
  const out = [];
  for (const [id, c] of Object.entries(CREW)) {
    const w = c.rows[0].length;
    c.rows.forEach((r, i) => { if (r.length !== w) out.push(`${id} row ${i} is ${r.length} wide, expected ${w}`); });
    c.rows.join('').replace(/\./g, '').split('').forEach(ch => { if (!c.pal[ch]) out.push(`${id} has no colour for '${ch}'`); });
  }
  return [...new Set(out)];
}

// Draws a sprite with its feet at (x, y), centred on x. cut = rows to leave off the bottom (hidden by furniture).
function drawSprite(ctx, id, x, y, { cut = 0, alpha = 1 } = {}) {
  const c = CREW[id], rows = c.rows.slice(0, c.rows.length - cut), w = rows[0].length;
  const fullH = c.rows.length, ox = Math.round(x - w / 2), oy = y - fullH;
  const filled = (cx, cy) => cy >= 0 && cy < rows.length && cx >= 0 && cx < w && rows[cy][cx] !== '.';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = OUTLINE;
  for (let cy = -1; cy <= rows.length; cy++) for (let cx = -1; cx <= w; cx++)
    if (!filled(cx, cy) && (filled(cx - 1, cy) || filled(cx + 1, cy) || filled(cx, cy - 1) || (cy < rows.length - 1 && filled(cx, cy + 1))))
      ctx.fillRect(ox + cx, oy + cy, 1, 1);
  rows.forEach((r, cy) => [...r].forEach((ch, cx) => { if (ch !== '.') { ctx.fillStyle = c.pal[ch]; ctx.fillRect(ox + cx, oy + cy, 1, 1); } }));
  ctx.globalAlpha = 1;
  return { top: oy, left: ox, w };
}

function drawLaptop(ctx, x, y, glow = '#05d9e8') {  // x = centre, y = base line
  ctx.fillStyle = OUTLINE; ctx.fillRect(x - 6, y - 7, 12, 8);
  ctx.fillStyle = '#5a6078'; ctx.fillRect(x - 5, y - 6, 10, 5);
  ctx.fillStyle = glow; ctx.fillRect(x - 4, y - 5, 8, 3);
  ctx.fillStyle = '#8a90a8'; ctx.fillRect(x - 6, y - 1, 12, 2);
}

// Netrunner jack-in: a cable from the neck plus a ring of cyberspace pixels around the head.
function drawJackIn(ctx, info, to, color) {
  const nx = info.left + Math.floor(info.w / 2), ny = info.top + 10;
  ctx.fillStyle = color;
  let cx = nx, cy = ny;
  while (cx !== to.x || cy !== to.y) {
    if (cx !== to.x) cx += Math.sign(to.x - cx);
    if (cy !== to.y && (cx === to.x || (cx + cy) % 2)) cy += Math.sign(to.y - cy);  // always progresses
    ctx.fillRect(cx, cy, 1, 1);
  }
  ctx.globalAlpha = .55;
  for (let a = 0; a < 28; a++) { const t = a / 28 * Math.PI * 2; ctx.fillRect(Math.round(nx + Math.cos(t) * 11), Math.round(info.top + 5 + Math.sin(t) * 9), 1, 1); }
  ctx.globalAlpha = 1;
}

// Claude Code sub-agent: a small translucent hologram figure.
function drawHolo(ctx, x, y, color) {
  ctx.globalAlpha = .7; ctx.fillStyle = color;
  ctx.fillRect(x - 2, y - 12, 4, 4); ctx.fillRect(x - 3, y - 7, 6, 5); ctx.fillRect(x - 3, y - 2, 2, 2); ctx.fillRect(x + 1, y - 2, 2, 2);
  ctx.globalAlpha = .35; ctx.fillRect(x - 5, y, 10, 1);
  ctx.globalAlpha = 1;
}

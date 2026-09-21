// Script klien SUNGGUHAN (index.html) di jsdom + Babylon NullEngine, terhubung ke server SUNGGUHAN.
const fs = require('fs');
const http = require('http');
const { JSDOM } = require('jsdom');
const { io } = require('socket.io-client');

const URL_ = 'http://localhost:3123';
const html = fs.readFileSync('/home/claude/blox/index.html', 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(ok ? 'PASS' : 'FAIL', '-', name, extra); };
const getJSON = (path) => new Promise((res, rej) => http.get(URL_ + path, (r) => { let b = ''; r.on('data', (d) => (b += d)); r.on('end', () => res(JSON.parse(b))); }).on('error', rej));

const BABYLON = require('babylonjs');
const V3 = BABYLON.Vector3;
BABYLON.ArcRotateCamera.prototype.attachControl = function () {};
let pickResult = null;
BABYLON.Scene.prototype.pick = function () { return pickResult || { hit: false }; };

// ---------- boot 1 halaman klien ----------
function boot(matchMediaStub) {
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { url: URL_ + '/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  const ctx = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
  w.HTMLCanvasElement.prototype.getContext = () => ctx;
  global.document = w.document; global.window = w; global.HTMLCanvasElement = w.HTMLCanvasElement; global.navigator = w.navigator;
  if (matchMediaStub) w.matchMedia = matchMediaStub;
  w.confirm = () => true;
  const downloads = [];
  let lastBlob = null;
  w.URL.createObjectURL = (b) => { lastBlob = b; return 'blob:test'; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () { downloads.push({ name: this.download, blob: lastBlob }); };
  w.BABYLON = Object.assign({}, BABYLON);
  w.BABYLON.Engine = function () { return new BABYLON.NullEngine(); };
  w.io = () => io(URL_, { transports: ['websocket'] });
  w.eval(script);
  const $ = (id) => w.document.getElementById(id);
  return {
    w, $, downloads,
    state: () => w.document.body.dataset.state,
    click: (e) => e.dispatchEvent(new w.MouseEvent('click', { bubbles: true })),
    key: (type, code, extra = {}) => w.dispatchEvent(new w.KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...extra })),
    ptr: (target, type, x, y, id = 1, button = 0) => { const ev = new w.MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true }); Object.defineProperty(ev, 'pointerId', { value: id }); target.dispatchEvent(ev); },
    blobText: (blob) => new Promise((res) => { const r = new w.FileReader(); r.onload = () => res(r.result); r.readAsText(blob); }),
    async loadFile(obj, raw) {
      const f = new w.File([raw !== undefined ? raw : JSON.stringify(obj)], 'x.json', { type: 'application/json' });
      Object.defineProperty($('fileGame'), 'files', { value: [f], configurable: true });
      $('fileGame').dispatchEvent(new w.Event('change', { bubbles: true }));
      await wait(150);
    },
  };
}

(async () => {
  // pengamat di Baseplate
  const obs = io(URL_);
  const seen = { moved: [], chat: [], counts: {}, gotInit: false };
  obs.on('player-moved', (d) => seen.moved.push(d));
  obs.on('chat', (m) => seen.chat.push(m));
  obs.on('counts', (c) => (seen.counts = c));
  await wait(400);
  obs.emit('join', { name: 'Observer', game: 'baseplate', costume: {} });
  await wait(300);

  // ================= A. halaman utama (desktop) =================
  const c = boot();
  const { $, w, click, key, ptr } = c;
  await wait(400);
  check('judul halaman = Voxely', w.document.title === 'Voxely');
  check('logo = VOXELY', $('screen-login').querySelector('.logo').textContent === 'VOXELY');
  check('tidak ada nama "Blox" (kata utuh) di seluruh halaman', !/\bblox\b/i.test(w.document.body.textContent + w.document.title));
  check('desktop: kontrol sentuh belum aktif', !w.document.body.classList.contains('touch'));
  check('status koneksi: terhubung', $('conn').classList.contains('ok'));

  $('name').value = 'Vin';
  $('loginForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  check('login -> lobby', c.state() === 'lobby' && $('hello').textContent === 'Vin');
  check('lobby: 2 game bawaan + tombol Buat game / Buka .json', w.document.querySelectorAll('#games .game').length === 2 && !!$('openBuilder') && !!$('openFile'));

  // ================= B. kontrol sentuh (joystick + lompat) =================
  click(w.document.querySelector('#games .game'));               // Baseplate
  await wait(500);
  check('masuk Baseplate', c.state() === 'playing' && $('menuGame').textContent === 'Baseplate');
  check('joystick tidak muncul di desktop', !w.document.body.classList.contains('touch'));
  w.dispatchEvent(new w.Event('touchstart'));
  check('sentuhan pertama -> kontrol sentuh aktif', w.document.body.classList.contains('touch'));
  check('joystick + tombol lompat ada di HUD', !!$('hud').querySelector('#joy') && !!$('hud').querySelector('#jumpBtn'));

  $('joy').getBoundingClientRect = () => ({ left: 0, top: 0, width: 136, height: 136 });
  const run = async (ms) => { seen.moved.length = 0; await wait(ms); const m = seen.moved.filter((x) => x.id !== obs.id); return m.length ? m[m.length - 1].z - m[0].z : 0; };

  ptr($('joy'), 'pointerdown', 68, 10);                            // dorong penuh ke atas = maju
  const full = await run(1000);
  ptr($('joy'), 'pointerup', 68, 10);
  check('joystick penuh ke atas: karakter maju ~16 stud/detik', full > 10, 'dz=' + full.toFixed(1));

  await wait(300);
  ptr($('joy'), 'pointerdown', 68, 39);                            // setengah dorongan
  const halfPush = await run(1000);
  ptr($('joy'), 'pointerup', 68, 39);
  check('joystick setengah: lebih pelan dari penuh (analog)', halfPush > 2 && halfPush < full * 0.8, 'dz=' + halfPush.toFixed(1));

  await wait(300);
  const stopped = await run(600);
  check('lepas joystick: karakter berhenti', Math.abs(stopped) < 0.5, 'dz=' + stopped.toFixed(2));

  ptr($('joy'), 'pointerdown', 10, 68);                            // dorong ke kiri saja
  seen.moved.length = 0; await wait(700);
  const mL = seen.moved.filter((x) => x.id !== obs.id);
  ptr($('joy'), 'pointerup', 10, 68);
  check('joystick ke kiri: bergerak menyamping (x berkurang)', mL.length > 3 && mL[mL.length - 1].x - mL[0].x < -4, 'dx=' + (mL[mL.length - 1].x - mL[0].x).toFixed(1));

  await wait(400);
  seen.moved.length = 0;
  ptr($('jumpBtn'), 'pointerdown', 0, 0, 2);
  await wait(350);
  const ys = seen.moved.filter((x) => x.id !== obs.id).map((x) => x.y);
  ptr($('jumpBtn'), 'pointerup', 0, 0, 2);
  check('tombol lompat: karakter melompat', ys.length > 2 && Math.max(...ys) - Math.min(...ys) > 3, 'naik=' + (Math.max(...ys) - Math.min(...ys)).toFixed(1));
  check('tombol lompat kembali normal setelah dilepas', !$('jumpBtn').classList.contains('held'));

  // keyboard tetap jalan
  await wait(600);
  key('keydown', 'KeyW');
  const kb = await run(800);
  key('keyup', 'KeyW');
  check('keyboard WASD tetap berfungsi', kb > 6, 'dz=' + kb.toFixed(1));

  // keluar
  click($('btnMenu')); click($('btnExit')); await wait(300);
  check('menu -> Keluar -> lobby', c.state() === 'lobby');

  // ================= C. EDITOR GAME =================
  try { w.localStorage.removeItem('voxely-draft'); } catch (_) {}
  click($('openBuilder'));
  check('Buat game -> masuk editor', c.state() === 'building');
  check('nama file default = voxely_mygame.json', $('fname').textContent === 'voxely_mygame.json' && $('gname').value === 'mygame');
  check('editor: 0/800 blok', $('bcount').textContent === '0/800');

  const BS = BABYLON.EngineStore.LastCreatedScene;
  const canvas = $('game');
  const hover = (x, y, z, n = [0, 1, 0], mesh = null) => { pickResult = { hit: true, pickedPoint: new V3(x, y, z), pickedMesh: mesh, getNormal: () => new V3(n[0], n[1], n[2]) }; ptr(canvas, 'pointermove', 0, 0); };
  const leftClick = () => ptr(canvas, 'pointerdown', 0, 0, 1, 0);

  hover(10.3, 0, 5.2); leftClick();
  check('klik kiri di tanah -> blok terpasang (4x4x4 menempel di tanah)', $('bcount').textContent === '1/800');
  hover(10.3, 0, 5.2); leftClick();
  check('klik dua kali di tempat yang sama tidak menumpuk', $('bcount').textContent === '1/800');
  hover(10.2, 4, 5.1, [0, 1, 0]); leftClick();                     // menumpuk di atas blok pertama
  check('blok bisa ditumpuk di atas blok lain', $('bcount').textContent === '2/800');

  click(w.document.querySelector('#types button[data-type="lava"]'));
  check('pilih Lava -> warna otomatis merah-oranye', w.document.querySelector('#sw-block input.sw').value === '#ff4d1a');
  hover(20.1, 0, 5); leftClick();
  check('blok lava terpasang', $('bcount').textContent === '3/800');

  key('keydown', 'Digit2');
  const target = BS.meshes.find((m) => m.metadata && m.metadata.d && m.metadata.d.type === 'lava');
  hover(20, 0.5, 5, [0, 1, 0], target); leftClick();
  check('alat Hapus (tombol 2) menghapus blok yang ditunjuk', $('bcount').textContent === '2/800');
  key('keydown', 'KeyZ', { ctrlKey: true });
  check('Ctrl+Z mengembalikan blok yang dihapus', $('bcount').textContent === '3/800');
  key('keydown', 'KeyZ', { ctrlKey: true });
  check('Ctrl+Z lagi membatalkan pemasangan lava', $('bcount').textContent === '2/800');

  key('keydown', 'Digit3');
  hover(3.2, 0, -4.7); leftClick();
  key('keydown', 'Digit1');

  // ---- simpan .json (nama default) ----
  click($('bSave')); await wait(100);
  check('Simpan -> file voxely_mygame.json', c.downloads.length === 1 && c.downloads[0].name === 'voxely_mygame.json', c.downloads[0] && c.downloads[0].name);
  const saved1 = JSON.parse(await c.blobText(c.downloads[0].blob));
  check('isi JSON: format, nama, 2 blok, spawn, langit, tanah', saved1.format === 'voxely-game' && saved1.name === 'mygame' && saved1.blocks.length === 2 && saved1.spawn.x === 3 && saved1.spawn.z === -5 && saved1.sky === '#8ec9ff' && saved1.ground === true, JSON.stringify({ n: saved1.blocks.length, s: saved1.spawn }));
  check('blok tersimpan lengkap (posisi, ukuran, warna, jenis)', saved1.blocks[0].x === 10 && saved1.blocks[0].y === 2 && saved1.blocks[0].z === 5 && saved1.blocks[0].w === 4 && saved1.blocks[0].type === 'solid', JSON.stringify(saved1.blocks[0]));

  // ---- ganti nama, langit, tanah ----
  $('gname').value = 'My Game!'; $('gname').dispatchEvent(new w.Event('input', { bubbles: true }));
  check('nama "My Game!" -> file voxely_my_game.json', $('fname').textContent === 'voxely_my_game.json');
  click([...w.document.querySelectorAll('#sw-sky button.sw')].find((b) => b.dataset.hex === '#2b2860'));
  $('gground').checked = false; $('gground').dispatchEvent(new w.Event('change', { bubbles: true }));
  click($('bSave')); await wait(100);
  const saved2 = JSON.parse(await c.blobText(c.downloads[1].blob));
  check('file kedua: voxely_my_game.json, langit malam, tanah mati', c.downloads[1].name === 'voxely_my_game.json' && saved2.sky === '#2b2860' && saved2.ground === false && saved2.author === 'Vin');

  // ---- tes main dari editor ----
  seen.moved.length = 0; obs.emit('chat', 'dari baseplate');
  click($('bTest')); await wait(500);
  check('Tes main -> playing (mode tes, tanpa server)', c.state() === 'playing' && w.document.body.classList.contains('testplay') && $('menuGame').textContent === 'My Game!');
  check('menu di mode tes: tombol "Kembali ke editor"', $('btnExit').firstElementChild.textContent === 'Kembali ke editor');
  key('keydown', 'KeyW'); await wait(600); key('keyup', 'KeyW');
  check('tes main tidak mengirim posisi ke server', seen.moved.filter((x) => x.id !== obs.id).length === 0);
  click($('btnMenu')); click($('btnExit')); await wait(300);
  check('Kembali ke editor -> editor, blok masih 2', c.state() === 'building' && $('bcount').textContent === '2/800' && !w.document.body.classList.contains('testplay'));
  key('keydown', 'KeyZ', { ctrlKey: true });
  check('undo masih benar setelah tes main (tidak merusak blok lain)', $('bcount').textContent === '1/800');
  key('keydown', 'KeyZ', { ctrlKey: true });
  check('undo kedua', $('bcount').textContent === '0/800');
  key('keydown', 'KeyZ', { ctrlKey: true });
  check('undo saat riwayat kosong aman', $('bcount').textContent === '0/800');

  // pulihkan 2 blok lewat draft: keluar editor lalu masuk lagi
  hover(10.3, 0, 5.2); leftClick(); hover(10.2, 4, 5.1); leftClick();
  click($('bExit')); await wait(200);
  check('Keluar editor -> lobby', c.state() === 'lobby');
  const draft = JSON.parse(w.localStorage.getItem('voxely-draft'));
  check('draft tersimpan otomatis dengan 2 blok (tidak hilang saat keluar)', draft && draft.blocks.length === 2, draft && draft.blocks.length);
  click($('openBuilder'));
  check('masuk editor lagi: draft dipulihkan (2 blok, nama My Game!)', $('bcount').textContent === '2/800' && $('gname').value === 'My Game!');
  click($('bExit')); await wait(100);

  // ================= D. BUKA FILE + ROOM GAME BUATAN =================
  const gameA = saved1;
  await c.loadFile(gameA);
  const card = w.document.querySelector('#customGames .game');
  check('file .json dimuat -> kartu game buatan muncul', !!card && card.textContent.includes('mygame') && card.textContent.includes('2 blok'));
  const idA = card.querySelector('[data-count]').dataset.count;
  check('id room = custom-<hash>', /^custom-[a-z0-9]{4,16}$/.test(idA), idA);

  // isi sama -> id sama; isi beda -> id beda
  await c.loadFile({ ...gameA, name: 'nama lain', author: 'orang lain' });
  const idSame = w.document.querySelector('#customGames [data-count]').dataset.count;
  await c.loadFile({ ...gameA, blocks: [...gameA.blocks, { x: 0, y: 1, z: 0, w: 2, h: 2, d: 2, color: '#ffffff', type: 'solid' }] });
  const idDiff = w.document.querySelector('#customGames [data-count]').dataset.count;
  check('isi sama (nama beda) -> room sama', idSame === idA);
  check('isi beda -> room beda', idDiff !== idA);
  await c.loadFile(gameA);

  click(w.document.querySelector('#customGames .game')); await wait(500);
  check('main game buatan (online) -> playing', c.state() === 'playing' && $('menuGame').textContent === 'mygame' && !w.document.body.classList.contains('testplay'));
  check('server menghitung room custom (1 pemain)', seen.counts[idA] === 1, JSON.stringify(seen.counts));

  // teman kedua memuat file yang sama -> satu room
  const friend = io(URL_); const fseen = { chat: [], init: null };
  friend.on('init', (d) => (fseen.init = d)); friend.on('chat', (m) => fseen.chat.push(m));
  await wait(300);
  friend.emit('join', { name: 'Teman', game: idA, costume: { shirt: '#123456' }, spawn: gameA.spawn });
  await wait(400);
  check('teman di room yang sama: melihat kita', fseen.init && Object.keys(fseen.init.players).length === 2, fseen.init && Object.keys(fseen.init.players).length);
  check('spawn teman dekat spawn file (3,-5)', fseen.init && Math.abs(fseen.init.me.x - 3) <= 3 && Math.abs(fseen.init.me.z + 5) <= 3 && fseen.init.me.y >= 3, fseen.init && JSON.stringify([fseen.init.me.x.toFixed(1), fseen.init.me.y, fseen.init.me.z.toFixed(1)]));
  check('kita melihat teman di daftar pemain', $('count').textContent === '2', $('count').textContent);
  friend.emit('chat', 'halo dari teman'); await wait(300);
  check('chat teman muncul di log kita', [...$('log').children].some((r) => r.textContent.includes('halo dari teman')));
  obs.emit('chat', 'pesan baseplate'); await wait(300);
  check('chat Baseplate tidak bocor ke room custom', ![...$('log').children].some((r) => r.textContent.includes('pesan baseplate')));
  click($('btnMenu')); click($('btnExit')); await wait(400);
  friend.disconnect();
  check('keluar dari room custom -> lobby', c.state() === 'lobby');

  // ================= E. FILE JAHAT / RUSAK =================
  const evil = { format: 'voxely-game', name: '<img src=x onerror=alert(1)>', author: '<b>x</b>', sky: 'javascript:alert(1)', ground: 'yes', spawn: { x: 1e99, y: NaN, z: 'abc' },
    blocks: [{ x: 1e99, y: NaN, z: -1e99, w: -5, h: 1e9, d: 'x', color: 'red', type: 'evil' }, null, 5, 'str', ...Array.from({ length: 1200 }, (_, i) => ({ x: i, y: 1, z: 0, w: 1, h: 1, d: 1, color: '#ffffff', type: 'solid' }))] };
  await c.loadFile(evil);
  const ecard = w.document.querySelector('#customGames .game');
  check('file jahat: tidak ada elemen HTML yang tersuntik', !!ecard && !ecard.querySelector('img') && !ecard.querySelector('b b') && !/[<>]/.test(ecard.textContent), ecard && ecard.textContent);
  check('file jahat: blok dibatasi maksimal 800', /800 blok/.test(ecard.textContent), ecard.textContent);
  await c.loadFile(null, '{ bukan json');
  check('JSON rusak -> pesan error, tidak crash', /tidak valid/.test($('toast').textContent), $('toast').textContent);
  await c.loadFile({ format: 'lain', blocks: [] });
  check('format salah -> ditolak', /bukan file game Voxely/.test($('toast').textContent), $('toast').textContent);
  await c.loadFile({ format: 'voxely-game' });
  check('tanpa daftar blok -> ditolak', /daftar blok/.test($('toast').textContent), $('toast').textContent);

  // Sky Obby (game bawaan) masih jalan setelah refactor
  click(w.document.querySelectorAll('#games .game')[1]); await wait(600);
  check('Sky Obby masih jalan: playing + toast intro', c.state() === 'playing' && $('menuGame').textContent === 'Sky Obby' && /bendera emas/.test($('toast').textContent), $('toast').textContent);
  key('keydown', 'KeyW'); key('keydown', 'Space'); await wait(900); key('keyup', 'KeyW'); key('keyup', 'Space');
  click($('btnMenu')); click($('btnExit')); await wait(300);
  check('keluar dari Sky Obby -> lobby', c.state() === 'lobby');

  // ================= F. JENIS BLOK: lava & finish di game buatan =================
  const lava = { format: 'voxely-game', version: 1, name: 'lavatest', author: 'x', sky: '#8ec9ff', ground: true, spawn: { x: 0, y: 0, z: 0 },
    blocks: [{ x: 0, y: -0.5, z: 0, w: 8, h: 1, d: 8, color: '#ff4d1a', type: 'lava' }] };
  await c.loadFile(lava); click(w.document.querySelector('#customGames .game')); await wait(1800);
  check('kena lava -> respawn ke awal (toast "ulang dari awal")', c.state() === 'playing' && /ulang dari awal/i.test($('toast').textContent), $('toast').textContent);
  click($('btnMenu')); click($('btnExit')); await wait(300);

  const fin = { ...lava, name: 'fintest', blocks: [{ x: 0, y: -0.5, z: 0, w: 8, h: 1, d: 8, color: '#f1c40f', type: 'finish' }] };
  await c.loadFile(fin); click(w.document.querySelector('#customGames .game')); await wait(1800);
  check('menyentuh blok finish -> toast SELESAI + waktu', /SELESAI · \d\d:\d\d/.test($('toast').textContent), $('toast').textContent);
  click($('btnMenu')); click($('btnExit')); await wait(300);

  // ================= G. SERVER: id game palsu ditolak =================
  const bad = io(URL_); let badInit = 0; bad.on('init', () => badInit++);
  await wait(300);
  for (const g of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'custom-', 'custom-<script>', 'custom-ABC123', 'CUSTOM-abc123', 42, null, {}, ['baseplate']]) bad.emit('join', { name: 'x', game: g, costume: {} });
  bad.emit('join', null); bad.emit('join', 'baseplate'); bad.emit('join', { game: 'baseplate', costume: 'merah', spawn: 5, name: { a: 1 } });
  await wait(500);
  const health = await getJSON('/health');
  check('server tetap hidup setelah id game palsu / payload aneh', health.ok === true);
  check('hanya join yang sah yang diterima (1 dari payload aneh: baseplate dengan costume rusak)', badInit === 1, 'init=' + badInit);
  bad.disconnect();

  // ================= H. HP saja (tanpa mouse) =================
  const coarseMM = (q) => ({ matches: q === '(pointer: coarse)' });
  const p = boot(coarseMM);
  await wait(400);
  check('HP: kontrol sentuh aktif dari awal', p.w.document.body.classList.contains('touch'));
  p.$('name').value = 'Hp'; p.$('loginForm').dispatchEvent(new p.w.Event('submit', { bubbles: true, cancelable: true }));
  p.click(p.$('openBuilder'));
  check('HP tanpa mouse: editor ditolak dengan pesan jelas', p.state() === 'lobby' && /mouse/.test(p.$('toast').textContent), p.$('toast').textContent);
  p.click(p.w.document.querySelector('#games .game')); await wait(500);
  check('HP bisa masuk game', p.state() === 'playing');
  check('HP: panel bantuan keyboard disembunyikan (body.touch)', p.w.document.body.classList.contains('touch'));

  console.log(`\n${results.filter(Boolean).length}/${results.length} lulus`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });

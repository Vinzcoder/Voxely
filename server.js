// ============================================================
//  BLOX — server paling sederhana
//  express   -> menyajikan index.html
//  socket.io -> multiplayer (posisi pemain) + chat
//  Setiap game = 1 "room" socket.io, jadi pemain di game A
//  tidak melihat / tidak bisa chat dengan pemain di game B.
// ============================================================
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// daftar game + titik spawn (platform awal Obby berada di y=0, baseplate juga)
const rnd = (r) => (Math.random() - 0.5) * 2 * r;
const GAMES = {
  baseplate: { spawn: () => ({ x: rnd(8), y: 6, z: rnd(8) }) },
  obby:      { spawn: () => ({ x: rnd(8), y: 4, z: rnd(8) }) },
};

// id socket -> { id, name, game, shirt, pants, skin, x, y, z, ry }
const players = {};

const num = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
const hex = (v, fallback) => (/^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback);

const playersIn = (game) => {
  const out = {};
  for (const id in players) if (players[id].game === game) out[id] = players[id];
  return out;
};
const counts = () => {
  const c = {};
  for (const g in GAMES) c[g] = 0;
  for (const id in players) c[players[id].game]++;
  return c;
};
const broadcastCounts = () => io.emit('counts', counts());

function leave(socket) {
  const p = players[socket.id];
  if (!p) return;
  delete players[socket.id];
  socket.leave(p.game);
  io.to(p.game).emit('player-left', p.id);
  io.to(p.game).emit('chat', { system: true, text: `${p.name} keluar` });
  broadcastCounts();
}

io.on('connection', (socket) => {
  let lastChat = 0;
  socket.emit('counts', counts());

  // pemain memilih game di lobby: { name, game, costume: {shirt, pants, skin} }
  socket.on('join', (d) => {
    if (players[socket.id] || !d || !GAMES[d.game]) return;
    const c = d.costume || {};
    const spawn = GAMES[d.game].spawn();

    const player = {
      id: socket.id,
      name: clean(d.name, 16) || 'Guest' + Math.floor(Math.random() * 9000 + 1000),
      game: d.game,
      shirt: hex(c.shirt, '#ff6a00'),
      pants: hex(c.pants, '#3b5b92'),
      skin: hex(c.skin, '#f6d55c'),
      ...spawn,
      ry: 0,
    };
    players[socket.id] = player;
    socket.join(player.game);

    socket.emit('init', { me: player, players: playersIn(player.game) });   // state penuh untuk pemain baru
    socket.to(player.game).emit('player-joined', player);                    // kabari yang lain di game yang sama
    io.to(player.game).emit('chat', { system: true, text: `${player.name} bergabung` });
    broadcastCounts();
  });

  // klien mengirim posisinya ~20x/detik
  socket.on('move', (d) => {
    const p = players[socket.id];
    if (!p || !d) return;
    p.x = num(d.x, p.x);
    p.y = num(d.y, p.y);
    p.z = num(d.z, p.z);
    p.ry = num(d.ry, p.ry);
    socket.to(p.game).emit('player-moved', { id: p.id, x: p.x, y: p.y, z: p.z, ry: p.ry });
  });

  socket.on('chat', (text) => {
    const p = players[socket.id];
    const msg = clean(text, 120);
    const now = Date.now();
    if (!p || !msg || now - lastChat < 400) return;         // anti-spam sederhana
    lastChat = now;
    io.to(p.game).emit('chat', { id: p.id, name: p.name, color: p.shirt, text: msg });
  });

  // menu -> Keluar: kembali ke lobby (koneksi tetap hidup)
  socket.on('leave', () => leave(socket));
  socket.on('disconnect', () => leave(socket));
});

server.listen(PORT, () => {
  console.log(`BLOX jalan di http://localhost:${PORT}`);
});

'use strict';

const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer();
const io = new Server(server, {
  path: '/api/socket-io/socket.io',
  addTrailingSlash: false,
  transports: ['websocket'],
  cors: {
    origin: true,
    credentials: true,
  },
});

const players = new Map();

const COLORS = [
  '#ff6a00', '#3498db', '#9b59b6', '#2ecc71', '#f1c40f',
  '#e74c3c', '#1abc9c', '#e67e22', '#00a8ff', '#a55eea',
];

function cleanName(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 16) || 'guest';
}

function cleanNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(-10000, Math.min(10000, n)) : fallback;
}

function makePlayer(id, name) {
  const color = COLORS[players.size % COLORS.length];
  return {
    id,
    name,
    color,
    x: 0,
    y: 8,
    z: 0,
    ry: 0,
  };
}

function publicPlayers() {
  const result = {};
  for (const [id, p] of players) result[id] = { ...p };
  return result;
}

io.on('connection', (socket) => {
  socket.on('join', (rawName) => {
    if (players.has(socket.id)) return;

    const player = makePlayer(socket.id, cleanName(rawName));
    players.set(socket.id, player);

    socket.emit('init', {
      me: { ...player },
      players: publicPlayers(),
    });

    socket.broadcast.emit('player-joined', { ...player });
  });

  socket.on('move', (data) => {
    const player = players.get(socket.id);
    if (!player || !data || typeof data !== 'object') return;

    player.x = cleanNumber(data.x, player.x);
    player.y = cleanNumber(data.y, player.y);
    player.z = cleanNumber(data.z, player.z);
    player.ry = cleanNumber(data.ry, player.ry);

    socket.broadcast.emit('player-moved', {
      id: socket.id,
      x: player.x,
      y: player.y,
      z: player.z,
      ry: player.ry,
    });
  });

  socket.on('chat', (rawText) => {
    const player = players.get(socket.id);
    if (!player) return;

    const text = String(rawText ?? '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .trim()
      .slice(0, 120);
    if (!text) return;

    io.emit('chat', {
      id: socket.id,
      name: player.name,
      color: player.color,
      text,
    });
  });

  socket.on('disconnect', () => {
    if (!players.delete(socket.id)) return;
    io.emit('player-left', socket.id);
  });
});

module.exports = server;

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.resolve(__dirname, 'public');

const server = http.createServer((req, res) => {
  let requestPath;
  try { requestPath = decodeURIComponent((req.url || '/').split('?')[0]); } catch { res.writeHead(400); res.end('Bad request'); return; }
  const normalizedPath = requestPath === '/' ? '/index.html' : requestPath;
  const filePath = path.resolve(PUBLIC_DIR, `.${normalizedPath}`);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) { res.writeHead(403); res.end('Forbidden'); return; }
  const ext = path.extname(filePath);
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[ext] || 'text/plain';
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime }); res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const rooms = {};
let nextPlayerId = 1;

const MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,0,1,1,1,0,1,1,0,1,1,1,0,1,1,0,0,1],
  [1,0,1,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,1],
  [1,0,1,1,1,0,1,1,1,0,1,1,0,1,1,1,1,1,0,1],
  [1,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,1,0,1],
  [1,1,1,0,1,1,1,1,1,1,0,1,0,1,1,1,0,1,0,1],
  [1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,1],
  [1,0,1,1,0,1,1,1,0,1,1,1,1,1,0,1,1,1,1,1],
  [1,0,1,0,0,1,0,0,0,0,0,0,0,0,0,1,0,0,0,1],
  [1,0,1,0,1,1,0,1,1,1,1,1,1,1,0,1,0,1,0,1],
  [1,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,1],
  [1,1,1,1,1,0,1,1,1,1,1,1,0,1,1,1,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];
const TILE = 40;
const SEEKER_RADIUS = 14, HIDER_RADIUS = 12, SEEKER_SPEED = 160, HIDER_SPEED = 140, ROUND_TIME = 90;

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms[code] ? generateRoomCode() : code;
}
function broadcast(room, msg) { const data = JSON.stringify(msg); for (const p of Object.values(room.players)) { if (p.ws.readyState === 1) p.ws.send(data); } }
function broadcastTo(room, exceptId, msg) { const data = JSON.stringify(msg); for (const p of Object.values(room.players)) { if (p.id !== exceptId && p.ws.readyState === 1) p.ws.send(data); } }

function startRound(room) {
  const spots = [];
  for (let y = 1; y < MAP.length - 1; y++) { for (let x = 1; x < MAP[y].length - 1; x++) { if (MAP[y][x] === 0) spots.push({ x, y }); } }
  for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
  const players = Object.values(room.players);
  room.seekerId = room.seekerId || players[0].id;
  if (!room.players[room.seekerId]) room.seekerId = players[0].id;
  let si = 0;
  for (const p of players) {
    const spot = spots[si++ % spots.length];
    p.x = spot.x * TILE + TILE / 2; p.y = spot.y * TILE + TILE / 2;
    p.isSeeker = (p.id === room.seekerId); p.alive = true; p.captured = false;
    p.scannerUsed = false; p.traps = []; p.hasTaser = false; p.isTrapped = false; p.isSlowed = false;
  }
  room.state = 'playing'; room.timeLeft = ROUND_TIME; room.startTime = Date.now(); room.hidersFound = 0;
  room.traps = []; room.taserItems = [];
  for (let i = 0; i < 2; i++) { const spot = spots[Math.floor(Math.random() * spots.length)]; room.taserItems.push({ id: Date.now() + i, x: spot.x * TILE + TILE/2, y: spot.y * TILE + TILE/2, collected: false }); }
  
  broadcast(room, { type: 'roundStart', seekerId: room.seekerId, players: players.map(p => ({ id: p.id, name: p.name, x: p.x, y: p.y, isSeeker: p.isSeeker, alive: p.alive })), timeLeft: room.timeLeft, taserItems: room.taserItems });
  
  if (room.timer) clearInterval(room.timer);
  room.timer = setInterval(() => {
    if (room.state !== 'playing') { clearInterval(room.timer); return; }
    room.timeLeft--; broadcast(room, { type: 'tick', timeLeft: room.timeLeft });
    if (room.timeLeft <= 0) { clearInterval(room.timer); endRound(room, 'hiders'); }
  }, 1000);
}

function endRound(room, winner) {
  room.state = 'ended'; if (room.timer) clearInterval(room.timer); broadcast(room, { type: 'roundEnd', winner });
  setTimeout(() => {
    if (Object.keys(room.players).length < 2) { broadcast(room, { type: 'waiting' }); return; }
    const ids = Object.keys(room.players).map(Number).sort((a,b)=>a-b);
    const curIdx = ids.indexOf(room.seekerId); room.seekerId = ids[(curIdx + 1) % ids.length]; startRound(room);
  }, 6000);
}

function checkCapture(room, seeker) {
  for (const p of Object.values(room.players)) {
    if (p.id === seeker.id || p.isSeeker || !p.alive) continue;
    const dx = p.x - seeker.x, dy = p.y - seeker.y;
    if (dx * dx + dy * dy < 26 * 26) {
      p.alive = false; p.captured = true; room.hidersFound++;
      broadcast(room, { type: 'captured', playerId: p.id, byId: seeker.id, name: p.name });
      const remainingHiders = Object.values(room.players).filter(pl => !pl.isSeeker && pl.alive);
      if (remainingHiders.length === 0) endRound(room, 'seeker');
    }
  }
}

function canMove(x, y, radius) {
  const pts = [{ x: x - radius, y: y }, { x: x + radius, y: y }, { x: x, y: y - radius }, { x: x, y: y + radius }, { x: x - radius * 0.7, y: y - radius * 0.7 }, { x: x + radius * 0.7, y: y - radius * 0.7 }, { x: x - radius * 0.7, y: y + radius * 0.7 }, { x: x + radius * 0.7, y: y + radius * 0.7 }];
  for (const pt of pts) { const tx = Math.floor(pt.x / TILE), ty = Math.floor(pt.y / TILE); if (!MAP[ty] || (MAP[ty][tx] !== 0 && MAP[ty][tx] !== 2)) return false; }
  return true;
}

wss.on('connection', (ws) => {
  const player = { id: nextPlayerId++, ws, name: 'Игрок', roomId: null, x: 0, y: 0, isSeeker: false, alive: true, lastMove: Date.now() };
  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'create') {
      const roomId = generateRoomCode(); player.name = (msg.name || 'Игрок').slice(0, 16);
      rooms[roomId] = { id: roomId, players: { [player.id]: player }, state: 'lobby', seekerId: null, timeLeft: ROUND_TIME, timer: null, hidersFound: 0 };
      player.roomId = roomId; const room = rooms[roomId];
      ws.send(JSON.stringify({ type: 'joined', roomId, playerId: player.id, players: [{ id: player.id, name: player.name, isHost: true }], state: 'lobby' }));
      return;
    }
    if (msg.type === 'join') {
      const room = rooms[msg.roomId];
      if (!room) { ws.send(JSON.stringify({ type: 'error', text: 'Комната не найдена' })); return; }
      if (Object.keys(room.players).length >= 8) { ws.send(JSON.stringify({ type: 'error', text: 'Комната заполнена' })); return; }
      if (room.state === 'playing') { ws.send(JSON.stringify({ type: 'error', text: 'Игра уже идёт' })); return; }
      player.name = (msg.name || 'Игрок').slice(0, 16); player.roomId = room.id; player.x = TILE * 2; player.y = TILE * 2;
      room.players[player.id] = player;
      ws.send(JSON.stringify({ type: 'joined', roomId: room.id, playerId: player.id, players: Object.values(room.players).map(p => ({ id: p.id, name: p.name, isHost: p.id === Number(Object.keys(room.players)[0]) })), state: room.state }));
      broadcastTo(room, player.id, { type: 'playerJoined', player: { id: player.id, name: player.name } });
      return;
    }
    const room = rooms[player.roomId]; if (!room) return;
    if (msg.type === 'start') {
      const hostId = Number(Object.keys(room.players)[0]);
      if (player.id !== hostId) { ws.send(JSON.stringify({ type: 'error', text: 'Только хост может начать' })); return; }
      if (Object.keys(room.players).length < 2) { ws.send(JSON.stringify({ type: 'error', text: 'Нужно минимум 2 игрока' })); return; }
      const ids = Object.keys(room.players).map(Number); room.seekerId = ids[Math.floor(Math.random() * ids.length)]; startRound(room); return;
    }
    if (msg.type === 'use_scanner') { if (room.seekerId === player.id && room.state === 'playing' && !player.scannerUsed) { player.scannerUsed = true; broadcast(room, { type: 'scanner_active', time: 10000 }); } return; }
    if (msg.type === 'place_trap') { if (room.seekerId === player.id && room.state === 'playing') { if (room.traps.filter(t => t.owner === player.id && !t.triggered).length < 3) { const trap = { x: player.x, y: player.y, owner: player.id, triggered: false, id: Date.now() }; room.traps.push(trap); broadcast(room, { type: 'trap_placed', trap }); } } return; }
    if (msg.type === 'use_taser') { if (room.state === 'playing' && !player.isSeeker && player.hasTaser) { const seeker = room.players[room.seekerId]; if (seeker && Math.hypot(seeker.x - player.x, seeker.y - player.y) < 300) { player.hasTaser = false; seeker.isSlowed = true; broadcast(room, { type: 'taser_hit', playerId: player.id, seekerId: seeker.id }); setTimeout(() => { if (seeker) seeker.isSlowed = false; }, 3000); } } return; }
    if (msg.type === 'move') {
      if (room.state !== 'playing' || (!player.alive && !player.isSeeker) || player.isTrapped) return;
      const now = Date.now(); const dt = Math.min((now - player.lastMove) / 1000, 0.1); player.lastMove = now;
      let speed = player.isSeeker ? SEEKER_SPEED : HIDER_SPEED; if (player.isSlowed) speed *= 0.4;
      const radius = player.isSeeker ? SEEKER_RADIUS : HIDER_RADIUS;
      let dx = (msg.dx || 0), dy = (msg.dy || 0); const len = Math.hypot(dx, dy); if (len > 1) { dx /= len; dy /= len; }
      const nx = player.x + dx * speed * dt, ny = player.y + dy * speed * dt; let moved = false;
      if (canMove(nx, player.y, radius)) { player.x = nx; moved = true; }
      if (canMove(player.x, ny, radius)) { player.y = ny; moved = true; }
      if (!player.isSeeker) {
        for (const item of room.taserItems) { if (!item.collected && Math.hypot(item.x - player.x, item.y - player.y) < 30) { item.collected = true; player.hasTaser = true; broadcast(room, { type: 'taser_collected', playerId: player.id, itemId: item.id }); break; } }
        for (const trap of room.traps) { if (!trap.triggered && Math.hypot(trap.x - player.x, trap.y - player.y) < 30) { trap.triggered = true; player.isTrapped = true; broadcast(room, { type: 'trap_triggered', trapId: trap.id, playerId: player.id }); setTimeout(() => { player.isTrapped = false; }, 3000); setTimeout(() => { if (trap) trap.triggered = false; }, 10000); break; } }
      }
      if (moved) { broadcastTo(room, player.id, { type: 'playerMove', id: player.id, x: player.x, y: player.y }); if (player.isSeeker) checkCapture(room, player); }
      ws.send(JSON.stringify({ type: 'selfPos', x: player.x, y: player.y })); return;
    }
  });
  ws.on('close', () => {
    const room = rooms[player.roomId]; if (!room) return;
    delete room.players[player.id];
    if (Object.keys(room.players).length === 0) { if (room.timer) clearInterval(room.timer); delete rooms[player.roomId]; return; }
    broadcast(room, { type: 'playerLeft', id: player.id, name: player.name });
    if (room.state === 'playing' && player.id === room.seekerId) {
      const alive = Object.values(room.players).filter(p => p.alive);
      if (alive.length > 0) { room.seekerId = alive[0].id; alive[0].isSeeker = true; broadcast(room, { type: 'newSeeker', seekerId: room.seekerId }); } else { endRound(room, 'seeker'); }
    }
  });
});
server.listen(PORT, HOST, () => { console.log(`\n🎮 Сервер пряток запущен!`); console.log(`👉 Сервер слушает на ${HOST}:${PORT}\n`); });

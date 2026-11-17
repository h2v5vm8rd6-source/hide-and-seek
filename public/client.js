 const state = {
  ws: null, playerId: null, roomId: null, name: '',
  players: {}, me: { x: 0, y: 0 },
  seekerId: null, isHost: false, timeLeft: 0,
  gameState: 'menu', traps: [], taserItems: [], hasTaser: false, isTrapped: false,
};
const TILE = 40;
const MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,2,0,0,0,0,0,0,2,0,0,0,0,0,0,0,1],
  [1,0,1,0,1,1,1,0,1,1,0,1,1,1,0,1,1,0,0,1],
  [1,0,1,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,1],
  [1,0,1,1,1,0,1,1,1,0,1,1,0,1,1,1,1,1,0,1],
  [1,0,0,0,1,0,0,0,2,0,0,1,0,0,0,0,0,1,0,1],
  [1,1,1,0,1,1,1,1,1,1,0,1,0,1,1,1,0,1,0,1],
  [1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,1],
  [1,0,1,1,0,1,1,1,0,1,1,1,1,1,0,1,1,1,1,1],
  [1,0,1,0,0,1,0,0,0,0,0,0,0,0,0,1,0,0,0,1],
  [1,0,1,0,1,1,0,1,1,1,1,1,1,1,0,1,0,1,0,1],
  [1,0,0,0,1,0,0,0,0,2,0,0,0,1,0,0,0,1,0,1],
  [1,1,1,1,1,0,1,1,1,1,1,1,0,1,1,1,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];

const $ = id => document.getElementById(id);
const menuEl = $('menu'), lobbyEl = $('lobby'), gameEl = $('game'), canvas = $('gameCanvas'), messageEl = $('message');
const btnAction = $('btn-action'), btnJump = $('btn-jump'), btnCrouch = $('btn-crouch');

$('create-btn').onclick = () => { const name = $('player-name').value.trim() || 'Игрок'; connect(); state.ws.onopen = () => state.ws.send(JSON.stringify({ type: 'create', name })); };
$('join-btn').onclick = () => { const name = $('player-name').value.trim() || 'Игрок'; const code = $('room-code').value.trim().toUpperCase(); if (code.length !== 5) { showError('Код должен быть из 5 символов'); return; } connect(); state.ws.onopen = () => state.ws.send(JSON.stringify({ type: 'join', name, roomId: code })); };
$('start-btn').onclick = () => state.ws.send(JSON.stringify({ type: 'start' }));

function showError(text) { $('menu-error').textContent = text; setTimeout(() => $('menu-error').textContent = '', 3000); }
function connect() { const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'; state.ws = new WebSocket(`${proto}//${location.host}`); state.ws.onmessage = handleMessage; state.ws.onclose = () => { if (state.gameState === 'playing') showMessage('Соединение потеряно', 5000); }; }

function handleMessage(e) {
  const msg = JSON.parse(e.data);
  switch (msg.type) {
    case 'joined': {
      state.playerId = msg.playerId; state.roomId = msg.roomId; state.gameState = 'lobby';
      $('room-code-display').textContent = msg.roomId; menuEl.classList.add('hidden'); lobbyEl.classList.remove('hidden');
      updateLobbyPlayers(msg.players); state.isHost = msg.players[0]?.id === msg.playerId;
      $('start-btn').style.display = state.isHost ? 'block' : 'none';
      $('lobby-hint').textContent = state.isHost ? 'Нажми "Начать игру", когда все соберутся' : 'Ждём хоста...';
      break;
    }
    case 'error': showError(msg.text); break;
    case 'playerJoined': { const list = $('players-list'); const div = document.createElement('div'); div.className = 'player-row'; div.textContent = msg.player.name; list.appendChild(div); break; }
    case 'roundStart': {
      state.gameState = 'playing'; state.seekerId = msg.seekerId; state.timeLeft = msg.timeLeft; state.players = {};
      state.traps = []; state.taserItems = msg.taserItems || []; state.hasTaser = false; state.isTrapped = false;
      for (const p of msg.players) { state.players[p.id] = { ...p }; if (p.id === state.playerId) state.me = { x: p.x, y: p.y }; }
      lobbyEl.classList.add('hidden'); gameEl.classList.remove('hidden');
      const isSeeker = state.seekerId === state.playerId;
      $('role-display').textContent = isSeeker ? '🔍 ИСКАТЕЛЬ' : '🙈 ПРЯЧУСЬ';
      $('role-display').style.color = isSeeker ? '#ff5555' : '#a855f7';
      btnAction.style.display = 'block'; btnAction.textContent = isSeeker ? '📡 Сканер' : '🪤 Капкан';
      btnJump.style.display = 'block'; btnCrouch.style.display = 'block';
      messageEl.classList.add('hidden'); init3D(); break;
    }
    case 'tick': state.timeLeft = msg.timeLeft; $('timer').textContent = msg.timeLeft; break;
    case 'playerMove': { if (state.players[msg.id]) { state.players[msg.id].x = msg.x; state.players[msg.id].y = msg.y; } break; }
    case 'selfPos': state.me.x = msg.x; state.me.y = msg.y; break;
    case 'captured': {
      if (state.players[msg.playerId]) state.players[msg.playerId].alive = false;
      if (msg.playerId === state.playerId) showMessage('Ты пойман! 👻', 0); else showMessage(`${msg.name} пойман!`, 1500);
      updateAliveCount(); break;
    }
    case 'newSeeker':
      state.seekerId = msg.seekerId;
      if (msg.seekerId === state.playerId) { $('role-display').textContent = '🔍 ИСКАТЕЛЬ'; $('role-display').style.color = '#ff5555'; btnAction.textContent = '📡 Сканер'; }
      break;
    case 'roundEnd':
      state.gameState = 'ended'; showMessage(msg.winner === 'seeker' ? '🔍 Искатель победил!' : '🙈 Прячущиеся выиграли!', 5000);
      btnAction.style.display = 'none'; btnJump.style.display = 'none'; btnCrouch.style.display = 'none'; break;
    case 'playerLeft': delete state.players[msg.id]; updateAliveCount(); break;
    case 'waiting': showMessage('Ждём игроков...', 3000); break;
    
    case 'scanner_active': {
      showMessage('📡 Сканер активирован! Все видны!', 2000);
      const endTime = Date.now() + msg.time;
      const interval = setInterval(() => {
        if (Date.now() > endTime) {
          clearInterval(interval);
          for (const id in otherPlayers) {
            if (otherPlayers[id].userData.bodyMaterial) {
              otherPlayers[id].userData.bodyMaterial.emissive.setHex(0x250d3a);
              otherPlayers[id].userData.bodyMaterial.depthTest = true;
            }
          }
        } else {
          for (const id in otherPlayers) {
            if (otherPlayers[id].userData.bodyMaterial) {
              otherPlayers[id].userData.bodyMaterial.emissive.setHex(0xff0000);
              otherPlayers[id].userData.bodyMaterial.depthTest = false; // Видно сквозь стены
            }
          }
        }
      }, 100); 
      break;
    }
    
    case 'trap_placed': state.traps.push(msg.trap); if (state.seekerId === state.playerId) btnAction.textContent = '📡 Сканер'; break;
    case 'trap_triggered': if (msg.playerId === state.playerId) { state.isTrapped = true; showMessage('🪤 Ты попал в капкан!', 3000); setTimeout(() => { state.isTrapped = false; }, 3000); } break;
    case 'taser_collected': if (msg.playerId === state.playerId) { state.hasTaser = true; btnAction.textContent = '⚡ Электрошокер'; showMessage('Ты подобрал электрошокер!', 2000); } break;
    case 'taser_hit':
      if (msg.seekerId === state.playerId) showMessage('⚡ Тебя ударили током! Ты замедлен!', 3000);
      if (msg.playerId === state.playerId) { state.hasTaser = false; btnAction.textContent = '🪤 Капкан'; }
      break;
  }
}

function updateLobbyPlayers(players) { const list = $('players-list'); list.innerHTML = ''; for (const p of players) { const div = document.createElement('div'); div.className = 'player-row'; div.innerHTML = `<span>${escapeHtml(p.name)}</span>${p.isHost ? '<span class="host-tag">ХОСТ</span>' : ''}`; list.appendChild(div); } }
function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function updateAliveCount() { const alive = Object.values(state.players).filter(p => p.alive && p.id !== state.seekerId).length; $('alive-count').textContent = alive; }
function showMessage(text, ms = 2000) { messageEl.textContent = text; messageEl.classList.remove('hidden'); if (ms > 0) setTimeout(() => messageEl.classList.add('hidden'), ms); }

const keys = {};
document.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase())) e.preventDefault(); });
document.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

let joyActive = false, joyX = 0, joyY = 0;
const joyContainer = $('joystick-container'), joyKnob = $('joystick');
function joyStart(e) { e.preventDefault(); const touch = e.touches ? e.touches[0] : e; const rect = joyContainer.getBoundingClientRect(); joyActive = true; joyUpdate(touch.clientX - rect.left, touch.clientY - rect.top, rect); }
function joyMove(e) { if (!joyActive) return; e.preventDefault(); const touch = e.touches ? e.touches[0] : e; const rect = joyContainer.getBoundingClientRect(); joyUpdate(touch.clientX - rect.left, touch.clientY - rect.top, rect); }
function joyEnd(e) { if (!joyActive) return; e.preventDefault(); joyActive = false; joyX = joyY = 0; joyKnob.style.transform = 'translate(0,0)'; }
function joyUpdate(lx, ly, rect) { const cx = rect.width / 2, cy = rect.height / 2; let dx = lx - cx, dy = ly - cy; const maxR = rect.width / 2 - 30; const len = Math.hypot(dx, dy); if (len > maxR) { dx = dx / len * maxR; dy = dy / len * maxR; } joyKnob.style.transform = `translate(${dx}px, ${dy}px)`; joyX = dx / maxR; joyY = dy / maxR; }
joyContainer.addEventListener('touchstart', joyStart, { passive: false }); joyContainer.addEventListener('touchmove', joyMove, { passive: false }); joyContainer.addEventListener('touchend', joyEnd, { passive: false }); joyContainer.addEventListener('mousedown', joyStart); window.addEventListener('mousemove', joyMove); window.addEventListener('mouseup', joyEnd);

setInterval(() => {
  if (state.gameState !== 'playing' || !state.ws || state.ws.readyState !== 1 || state.isTrapped) return;
  let forwardInput = 0, strafeInput = 0;
  if (keys['arrowup'] || keys['w']) forwardInput += 1; if (keys['arrowdown'] || keys['s']) forwardInput -= 1; if (keys['arrowleft'] || keys['a']) strafeInput -= 1; if (keys['arrowright'] || keys['d']) strafeInput += 1;
  if (joyActive) { strafeInput = joyX; forwardInput = -joyY; }
  const inputLength = Math.hypot(forwardInput, strafeInput);
  if (inputLength > 1) { forwardInput /= inputLength; strafeInput /= inputLength; }
  const dx = -Math.sin(yaw) * forwardInput + Math.cos(yaw) * strafeInput;
  const dy = -Math.cos(yaw) * forwardInput - Math.sin(yaw) * strafeInput;
  if (dx !== 0 || dy !== 0) state.ws.send(JSON.stringify({ type: 'move', dx, dy }));
}, 1000 / 30);

let isCrouching = false, isJumping = false, jumpVelocity = 0;
const GRAVITY = 0.008, JUMP_FORCE = 0.16;
btnAction.addEventListener('click', () => {
  if (state.gameState !== 'playing') return;
  const isSeeker = state.seekerId === state.playerId;
  if (isSeeker) {
    if (btnAction.textContent.includes('Сканер')) { state.ws.send(JSON.stringify({ type: 'use_scanner' })); btnAction.textContent = '📡 Использован'; }
    else if (btnAction.textContent.includes('Капкан')) state.ws.send(JSON.stringify({ type: 'place_trap' }));
  } else {
    if (state.hasTaser) state.ws.send(JSON.stringify({ type: 'use_taser' }));
  }
});
btnJump.addEventListener('click', triggerJump);
document.addEventListener('keydown', e => { if (e.code === 'Space') triggerJump(); });
function triggerJump() { if (!isJumping && state.gameState === 'playing' && !state.isTrapped) { isJumping = true; jumpVelocity = JUMP_FORCE; } }
btnCrouch.addEventListener('mousedown', () => { isCrouching = true; btnCrouch.classList.add('pressed'); });
btnCrouch.addEventListener('mouseup', () => { isCrouching = false; btnCrouch.classList.remove('pressed'); });
btnCrouch.addEventListener('touchstart', (e) => { e.preventDefault(); isCrouching = true; btnCrouch.classList.add('pressed'); }, {passive: false});
btnCrouch.addEventListener('touchend', (e) => { e.preventDefault(); isCrouching = false; btnCrouch.classList.remove('pressed'); }, {passive: false});

const CELL_SIZE = 3, PLAYER_HEIGHT = 1.65, CROUCH_HEIGHT = 0.8;
let scene = null, camera = null, renderer = null, yaw = 0, pitch = 0;
let controlsInitialized = false, animationStarted = false, isLocked = false, lastFrameTime = 0, cameraPositionInitialized = false;
let touchLookPointer = null, touchLookX = 0, touchLookY = 0;
const otherPlayers = {}, trapMeshes = {}, taserMeshes = {};

function init3D() {
  if (typeof THREE === 'undefined') { showMessage('Не удалось загрузить 3D-графику', 0); return; }
  try {
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.domElement.style.position = 'fixed'; renderer.domElement.style.left = '0'; renderer.domElement.style.top = '0'; renderer.domElement.style.zIndex = '1';
      renderer.domElement.style.maxWidth = 'none'; renderer.domElement.style.maxHeight = 'none'; renderer.domElement.style.border = '0';
      renderer.domElement.style.borderRadius = '0'; renderer.domElement.style.boxShadow = 'none'; renderer.domElement.style.imageRendering = 'auto';
      renderer.domElement.style.touchAction = 'none'; setupControls(); window.addEventListener('resize', resize3D);
    }
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x050508); scene.fog = new THREE.Fog(0x050508, 7, 32);
    camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100); camera.rotation.order = 'YXZ'; camera.userData.bobPhase = 0; camera.userData.bobOffset = 0;
    const ambientLight = new THREE.HemisphereLight(0x9ca8ff, 0x171322, 0.38); scene.add(ambientLight);
    const sun = new THREE.DirectionalLight(0xffffff, 0.16); sun.position.set(-8, 16, 6); scene.add(sun);
    build3DMap();
    const textureCanvas = document.createElement('canvas'); textureCanvas.width = 512; textureCanvas.height = 512;
    const textureContext = textureCanvas.getContext('2d'); const squareSize = 64;
    for (let row = 0; row < 8; row++) {
      for (let column = 0; column < 8; column++) {
        textureContext.fillStyle = (row + column) % 2 === 0 ? '#292938' : '#1c1c29';
        textureContext.fillRect(column * squareSize, row * squareSize, squareSize, squareSize);
        textureContext.strokeStyle = 'rgba(150, 150, 190, 0.12)'; textureContext.lineWidth = 2;
        textureContext.strokeRect(column * squareSize, row * squareSize, squareSize, squareSize);
      }
    }
    const floorTexture = new THREE.CanvasTexture(textureCanvas); floorTexture.wrapS = THREE.RepeatWrapping; floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(MAP[0].length / 8, MAP.length / 8); floorTexture.encoding = THREE.sRGBEncoding; floorTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const floor = scene.children.find(object => object.isMesh && object.geometry.type === 'PlaneGeometry');
    if (floor) { floor.material.map = floorTexture; floor.material.color.set(0xffffff); floor.material.roughness = 0.94; floor.material.metalness = 0; floor.material.needsUpdate = true; }
    
    const flashlight = new THREE.SpotLight(0xfff1cf, 5, 22, Math.PI / 5, 0.55, 1); 
    flashlight.position.set(0, 0, 0); 
    flashlight.target.position.set(0, 0, -1);
    camera.add(flashlight); 
    camera.add(flashlight.target); 
    scene.add(camera);
    
    yaw = getSpawnYaw(); pitch = 0; lastFrameTime = 0; cameraPositionInitialized = false; resize3D(); updateCameraFromServer();
    for (const trap of state.traps) addTrapMesh(trap);
    for (const taser of state.taserItems) addTaserMesh(taser);
    if (!animationStarted) { animationStarted = true; requestAnimationFrame(animate); }
  } catch (error) { showMessage('Не удалось запустить 3D-графику', 0); }
}

function build3DMap() {
  const mapWidth = MAP[0].length * CELL_SIZE, mapDepth = MAP.length * CELL_SIZE;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(mapWidth, mapDepth), new THREE.MeshStandardMaterial({ color: 0x151521, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.04; scene.add(floor);
  const grid = new THREE.GridHelper(mapDepth, MAP.length, 0x514079, 0x29263b); grid.scale.x = mapWidth / mapDepth; grid.position.y = 0.005; scene.add(grid);
  const wallGeometry = new THREE.BoxGeometry(CELL_SIZE, 2.4, CELL_SIZE); const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x302a48, roughness: 0.92, emissive: 0x110d1b });
  const bushGeometry = new THREE.BoxGeometry(CELL_SIZE * 0.88, 1.35, CELL_SIZE * 0.88); const bushMaterial = new THREE.MeshStandardMaterial({ color: 0x286236, roughness: 1, transparent: true, opacity: 0.5 });
  for (let row = 0; row < MAP.length; row++) {
    for (let column = 0; column < MAP[row].length; column++) {
      const cell = MAP[row][column]; if (cell !== 1 && cell !== 2) continue;
      const obstacle = new THREE.Mesh(cell === 1 ? wallGeometry : bushGeometry, cell === 1 ? wallMaterial : bushMaterial);
      obstacle.position.set((column - MAP[0].length / 2 + 0.5) * CELL_SIZE, cell === 1 ? 1.2 : 0.675, (row - MAP.length / 2 + 0.5) * CELL_SIZE);
      scene.add(obstacle);
    }
  }
}

function serverPositionToWorld(x, y) { return new THREE.Vector3((x / TILE - MAP[0].length / 2) * CELL_SIZE, 0, (y / TILE - MAP.length / 2) * CELL_SIZE); }
function getSpawnYaw() {
  const column = Math.floor(state.me.x / TILE), row = Math.floor(state.me.y / TILE);
  const directions = [{ dx: 0, dy: -1, yaw: 0 }, { dx: 1, dy: 0, yaw: -Math.PI / 2 }, { dx: 0, dy: 1, yaw: Math.PI }, { dx: -1, dy: 0, yaw: Math.PI / 2 }];
  let best = { yaw: 0, distance: -1 };
  for (const direction of directions) {
    let x = column + direction.dx, y = row + direction.dy, distance = 0;
    while (MAP[y]?.[x] === 0) { distance++; x += direction.dx; y += direction.dy; }
    if (distance > best.distance) best = { yaw: direction.yaw, distance };
  }
  return best.yaw;
}

// ===== ИСПРАВЛЕННАЯ ФУНКЦИЯ (Плавность) =====
function updateCameraFromServer(deltaSeconds = 1) {
  if (!camera) return;
  if (isJumping) {
    camera.position.y += jumpVelocity; jumpVelocity -= GRAVITY;
    if (camera.position.y <= (isCrouching ? CROUCH_HEIGHT : PLAYER_HEIGHT)) { camera.position.y = isCrouching ? CROUCH_HEIGHT : PLAYER_HEIGHT; isJumping = false; jumpVelocity = 0; }
  } else {
    const targetHeight = isCrouching ? CROUCH_HEIGHT : PLAYER_HEIGHT;
    camera.position.y += (targetHeight - camera.position.y) * 0.2;
  }
  const position = serverPositionToWorld(state.me.x, state.me.y);
  if (!cameraPositionInitialized) { camera.position.set(position.x, isCrouching ? CROUCH_HEIGHT : PLAYER_HEIGHT, position.z); cameraPositionInitialized = true; }
  else { 
    // Плавное сглаживание (30 = мягко и быстро, 10 = очень плавно)
    const blend = 1 - Math.exp(-30 * deltaSeconds); 
    camera.position.x += (position.x - camera.position.x) * blend; 
    camera.position.z += (position.z - camera.position.z) * blend; 
  }
  camera.rotation.order = 'YXZ'; camera.rotation.set(pitch, yaw, 0, 'YXZ');
}

function addTrapMesh(trap) {
  if (trapMeshes[trap.id]) return;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.1, 16), new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x550000 }));
  const pos = serverPositionToWorld(trap.x, trap.y); mesh.position.set(pos.x, 0.05, pos.z); scene.add(mesh); trapMeshes[trap.id] = mesh;
}

function addTaserMesh(taser) {
  if (taser.collected || taserMeshes[taser.id]) return;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xaaaa00 }));
  const pos = serverPositionToWorld(taser.x, taser.y); mesh.position.set(pos.x, 0.5, pos.z); scene.add(mesh); taserMeshes[taser.id] = mesh;
}

function createRemotePlayer(id, isSeeker) {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: isSeeker ? 0xff4444 : 0xa855f7, emissive: isSeeker ? 0x4a0808 : 0x250d3a, transparent: true });
  const headMaterial = new THREE.MeshStandardMaterial({ color: isSeeker ? 0xff6b5e : 0xc084fc, emissive: isSeeker ? 0x350606 : 0x160823, transparent: true });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.05, 0.58), bodyMaterial); body.position.y = 0.68;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.58, 0.58), headMaterial); head.position.y = 1.5;
  group.add(body, head); group.userData.bodyMaterial = bodyMaterial; group.userData.headMaterial = headMaterial; group.userData.initialized = false;
  scene.add(group); return group;
}

function updateRemotePlayers() {
  if (!scene) return;
  for (const id in state.players) {
    const numericId = Number(id); if (numericId === state.playerId) continue;
    const player = state.players[id]; const isSeeker = numericId === state.seekerId || player.isSeeker;
    const actor = otherPlayers[id] || (otherPlayers[id] = createRemotePlayer(id, isSeeker));
    const isVisible = player.alive || isSeeker;
    const targetX = Math.floor(player.x / TILE), targetY = Math.floor(player.y / TILE);
    const isInBush = MAP[targetY]?.[targetX] === 2;
    if (isVisible) {
      if (!isSeeker && isInBush) { actor.userData.bodyMaterial.opacity = 0.2; actor.userData.headMaterial.opacity = 0.2; }
      else { actor.userData.bodyMaterial.opacity = 1; actor.userData.headMaterial.opacity = 1; }
    } else { actor.visible = false; continue; }
    actor.visible = true;
    const target = serverPositionToWorld(player.x, player.y);
    if (!actor.userData.initialized) { actor.position.copy(target); actor.userData.initialized = true; }
    else { actor.position.x += (target.x - actor.position.x) * 0.3; actor.position.z += (target.z - actor.position.z) * 0.3; }
  }
  for (const id in otherPlayers) {
    if (state.players[id]) continue;
    scene.remove(otherPlayers[id]); otherPlayers[id].userData.bodyMaterial.dispose(); otherPlayers[id].userData.headMaterial.dispose(); delete otherPlayers[id];
  }
}

function animate() {
  if (!renderer || !scene || !camera) { animationStarted = false; return; }
  requestAnimationFrame(animate);
  const now = performance.now(); const deltaSeconds = lastFrameTime ? Math.min((now - lastFrameTime) / 1000, 0.1) : 1 / 60; lastFrameTime = now;
  updateCameraFromServer(deltaSeconds);
  const keyboardMoving = keys['w'] || keys['a'] || keys['s'] || keys['d'] || keys['arrowup'] || keys['arrowleft'] || keys['arrowdown'] || keys['arrowright'];
  const joystickStrength = joyActive ? Math.min(1, Math.hypot(joyX, joyY)) : 0;
  const movementStrength = state.gameState !== 'playing' ? 0 : (joyActive ? joystickStrength : (keyboardMoving ? 1 : 0));
  if (movementStrength > 0.04 && !isJumping) camera.userData.bobPhase += deltaSeconds * 9;
  const bobTarget = movementStrength > 0.04 && !isJumping ? Math.sin(camera.userData.bobPhase) * 0.035 * movementStrength : 0;
  const bobBlend = 1 - Math.exp(-14 * deltaSeconds); camera.userData.bobOffset += (bobTarget - camera.userData.bobOffset) * bobBlend;
  if (!isJumping) { const baseHeight = isCrouching ? CROUCH_HEIGHT : PLAYER_HEIGHT; camera.position.y = baseHeight + camera.userData.bobOffset; }
  updateRemotePlayers(); renderer.render(scene, camera);
}

function resize3D() {
  if (!renderer || !camera) return;
  const width = Math.max(1, window.innerWidth), height = Math.max(1, window.innerHeight);
  renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
}

function changeLook(deltaX, deltaY, sensitivity) {
  const fullTurn = Math.PI * 2; yaw = ((yaw - deltaX * sensitivity * 2 + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;
  pitch = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, pitch - deltaY * sensitivity));
}

function setupControls() {
  if (controlsInitialized) return; controlsInitialized = true;
  canvas.addEventListener('click', () => {
    if (state.gameState !== 'playing' || !canvas.requestPointerLock || document.pointerLockElement === canvas) return;
    try { const request = canvas.requestPointerLock(); if (request && typeof request.catch === 'function') request.catch(() => {}); } catch (error) {}
  });
  document.addEventListener('pointerlockchange', () => { isLocked = document.pointerLockElement === canvas; });
  document.addEventListener('mousemove', event => { if (isLocked) changeLook(event.movementX, event.movementY, 0.002); });
  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || state.gameState !== 'playing') return;
    touchLookPointer = event.pointerId; touchLookX = event.clientX; touchLookY = event.clientY;
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId); event.preventDefault();
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== touchLookPointer) return;
    changeLook(event.clientX - touchLookX, event.clientY - touchLookY, 0.006);
    touchLookX = event.clientX; touchLookY = event.clientY; event.preventDefault();
  });
  const endTouchLook = event => { if (event.pointerId === touchLookPointer) touchLookPointer = null; };
  canvas.addEventListener('pointerup', endTouchLook); canvas.addEventListener('pointercancel', endTouchLook);
}

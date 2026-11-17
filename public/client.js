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
$('join-btn').onclick = () => { const name = $('player-name').value.trim() || 'Игрок'; const code = $('room-code').value.trim().toUpperCase(); if (code.length !== 5) { showError('Код должен быть из 5 символов'); return; } connect(); state.ws.on

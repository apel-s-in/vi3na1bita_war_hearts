// Импорт моста из соседней папки в Yandex Cloud
import { NetworkBridge } from '../../common/network-bridge.js';

const $ = id => document.getElementById(id);

// Уникальный ID текущего пользователя (в реале будем получать от Башни через postMessage)
const myUid = 'user_' + Math.random().toString(36).substring(2, 9);
const net = new NetworkBridge(myUid);

// --- Логика Сети ---
net.onConnect = () => {
  $('lobby-screen').hidden = true;
  $('game-screen').hidden = false;
  $('enemy-info').textContent = 'Враг: Подключен';
  $('game-status').textContent = 'Связь установлена! Ваш ход.';
  
  // Отправим тестовое сообщение
  net.send({ type: 'chat', text: 'Привет из Войны Сердец!' });
};

net.onData = (msg) => {
  if (msg.type === 'chat') console.log('Враг пишет:', msg.text);
  if (msg.type === 'fire') {
    // Логика получения выстрела
    console.log(`Выстрел по координатам: X:${msg.x} Y:${msg.y}`);
  }
};

// --- Интерфейс Лобби ---
$('btn-host').onclick = async () => {
  $('btn-host').disabled = true;
  $('game-status').textContent = 'Создаем ключи...';
  const offer = await net.hostGame();
  
  // Упаковываем данные для шеринга (в реальности будем кодировать компактнее)
  const roomData = btoa(JSON.stringify({ hostId: myUid, offer }));
  const link = `${window.location.origin}${window.location.pathname}?room=${roomData}`;
  
  $('invite-link').value = link;
  $('invite-link-box').hidden = false;
};

$('btn-share').onclick = () => {
  const url = $('invite-link').value;
  if (navigator.share) {
    navigator.share({ title: 'Война Сердец', text: 'Сразись со мной!', url });
  } else {
    navigator.clipboard.writeText(url);
    alert('Ссылка скопирована!');
  }
};

$('btn-join').onclick = async () => {
  try {
    const input = $('join-id').value.split('?room=')[1] || $('join-id').value;
    const { hostId, offer } = JSON.parse(atob(input));
    await net.joinGame(hostId, offer);
    $('game-status').textContent = 'Соединяемся...';
  } catch (e) {
    alert('Неверный код комнаты');
  }
};

// --- Интерфейс Игры ---
$('btn-voice').onclick = async () => {
  const btn = $('btn-voice');
  const isEnabled = btn.classList.toggle('active');
  try {
    await net.toggleVoice(isEnabled);
    btn.textContent = isEnabled ? '🎤 Микрофон ВКЛ' : '🎤 Включить микрофон';
  } catch (e) {
    alert('Нужен доступ к микрофону');
    btn.classList.remove('active');
  }
};

// Генерация пустых полей 10x10 для примера
const createGrid = (id) => {
  const grid = $(id);
  for (let i = 0; i < 100; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.onclick = () => {
      if (id === 'enemy-grid') net.send({ type: 'fire', x: i % 10, y: Math.floor(i / 10) });
      cell.style.background = 'rgba(255, 49, 89, 0.5)';
    };
    grid.appendChild(cell);
  }
};

createGrid('enemy-grid');
createGrid('my-grid');

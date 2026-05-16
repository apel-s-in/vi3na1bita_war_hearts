import { renderBoard } from '../ui/board-view.js';
import { createEmptyBoard, syncFleetToBoard, placeShipRandomly, autoPlaceFleet, canPlaceShip } from '../game/board.js';

let activeShipId = null;

const loadPresets = () => {
  try {
    return JSON.parse(localStorage.getItem('wh_presets') || '[]');
  } catch { return []; }
};

const savePresets = (list) => {
  localStorage.setItem('wh_presets', JSON.stringify(list));
};

export const renderField = (root, state, actions) => {
  const el = document.createElement('section');
  el.className = 'wh-field-editor';
  
  const renderUI = () => {
    el.innerHTML = '';
    
    // 1. Доска (без карточки)
    const boardWrap = document.createElement('div');
    boardWrap.className = 'wh-editor-board-wrap';
    const previewBoard = syncFleetToBoard(state.fleet, createEmptyBoard());
    
    // Подсвечиваем активный корабль
    if (activeShipId !== null) {
      const act = state.fleet.find(s => s.id === activeShipId);
      if (act && act.placed) {
        for(let i=0; i<act.size; i++) {
          const cy = act.isVert ? act.y + i : act.y;
          const cx = act.isVert ? act.x : act.x + i;
          if(previewBoard[cy]?.[cx]) previewBoard[cy][cx].status = 'active-ship';
        }
      }
    }
    
    const renderedBoard = renderBoard(previewBoard, { mode: 'own' });
    
    // Обработка кликов по доске
    const cells = renderedBoard.querySelectorAll('.wh-cell:not(.label)');
    cells.forEach(btn => {
      btn.addEventListener('click', () => {
        const x = parseInt(btn.dataset.x, 10);
        const y = parseInt(btn.dataset.y, 10);
        
        // Если выбран корабль, пытаемся переместить его сюда
        if (activeShipId !== null) {
          const act = state.fleet.find(s => s.id === activeShipId);
          if (canPlaceShip(state.fleet, act.id, act.size, x, y, act.isVert)) {
            act.x = x; act.y = y; act.placed = true;
          } else if (canPlaceShip(state.fleet, act.id, act.size, x, y, !act.isVert)) {
             // Авто-поворот если так влезает
            act.x = x; act.y = y; act.isVert = !act.isVert; act.placed = true;
          }
          renderUI();
          return;
        }

        // Если ничего не выбрано, ищем корабль под кликом
        const clickedShip = state.fleet.find(s => 
          s.placed && 
          x >= s.x && x <= (s.isVert ? s.x : s.x + s.size - 1) &&
          y >= s.y && y <= (s.isVert ? s.y + s.size - 1 : s.y)
        );
        if (clickedShip) {
          activeShipId = clickedShip.id;
          renderUI();
        }
      });
    });

    boardWrap.append(renderedBoard);

    // 2. Инфо / Экшен бар
    const infoBar = document.createElement('div');
    infoBar.className = 'wh-editor-infobar';
    
    if (activeShipId !== null) {
      infoBar.innerHTML = `
        <div class="wh-active-tools">
          <button class="wh-btn secondary mini" id="btn-rotate">⟳ Повернуть</button>
          <button class="wh-btn secondary mini" id="btn-rnd">🔀 Место</button>
          <button class="wh-btn mini" id="btn-ok" style="background:var(--wh-green);color:#000">✔ Ок</button>
        </div>
      `;
      infoBar.querySelector('#btn-rotate').onclick = () => {
        const act = state.fleet.find(s => s.id === activeShipId);
        if (act && act.placed) {
          if (canPlaceShip(state.fleet, act.id, act.size, act.x, act.y, !act.isVert)) {
            act.isVert = !act.isVert;
          } else {
            // Если на месте не крутится, пытаемся найти случайное
            placeShipRandomly(state.fleet, act.id);
          }
          renderUI();
        }
      };
      infoBar.querySelector('#btn-rnd').onclick = () => {
        placeShipRandomly(state.fleet, activeShipId);
        renderUI();
      };
      infoBar.querySelector('#btn-ok').onclick = () => {
        activeShipId = null;
        renderUI();
      };
    } else {
      const allPlaced = state.fleet.every(s => s.placed);
      infoBar.innerHTML = `<h3 class="wh-editor-title">${allPlaced ? 'Флот к бою готов!' : 'Выбери корабль и размести его на поле'}</h3>`;
    }

    // 3. Флот под полем
    const fleetWrap = document.createElement('div');
    fleetWrap.className = 'wh-fleet-dock';
    
    state.fleet.forEach(ship => {
      const shipEl = document.createElement('div');
      shipEl.className = `wh-dock-ship ${ship.placed ? 'is-placed' : ''} ${activeShipId === ship.id ? 'is-active' : ''}`;
      
      for(let i=0; i<ship.size; i++) {
        shipEl.innerHTML += `<div class="wh-dock-cell"></div>`;
      }

      shipEl.onclick = () => {
        if (!ship.placed) {
          placeShipRandomly(state.fleet, ship.id);
        }
        activeShipId = ship.id;
        renderUI();
      };
      
      fleetWrap.append(shipEl);
    });

    // 4. Кнопки управления
    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'wh-editor-actions';
    actionsWrap.innerHTML = `
      <button class="wh-btn secondary" id="btn-auto">Расставить автоматически</button>
      <div style="display:flex;gap:10px;margin-top:10px">
        <button class="wh-btn secondary" id="btn-clear" style="flex:1">Очистить</button>
        <button class="wh-btn secondary" id="btn-save" style="flex:2">Сохранить расстановку</button>
      </div>
    `;

    actionsWrap.querySelector('#btn-auto').onclick = () => {
      activeShipId = null;
      autoPlaceFleet(state.fleet);
      renderUI();
    };

    actionsWrap.querySelector('#btn-clear').onclick = () => {
      activeShipId = null;
      state.fleet.forEach(s => s.placed = false);
      renderUI();
    };

    actionsWrap.querySelector('#btn-save').onclick = () => {
      if (!state.fleet.every(s => s.placed)) {
        alert('Расставьте все корабли перед сохранением!');
        return;
      }
      
      const presets = loadPresets();
      if (presets.length >= 4) {
        alert('Достигнут лимит (4). Удалите старую расстановку.');
        return;
      }

      const overlay = document.createElement('div');
      overlay.className = 'wh-modal-overlay';
      overlay.innerHTML = `
        <div class="wh-modal-box">
          <h3 class="wh-modal-title">Сохранить расстановку</h3>
          <input type="text" id="preset-name" placeholder="Моя тактика" style="width:100%;margin-bottom:20px;padding:12px;border-radius:12px;border:1px solid var(--wh-line);background:var(--wh-bg);color:#fff">
          <div class="wh-modal-actions">
            <button class="wh-btn secondary" type="button" id="pm-cancel">Отмена</button>
            <button class="wh-btn" type="button" id="pm-save">Сохранить</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector('#pm-cancel').onclick = () => overlay.remove();
      overlay.querySelector('#pm-save').onclick = () => {
        const name = overlay.querySelector('#preset-name').value.trim() || `Тактика ${presets.length + 1}`;
        presets.push({ id: Date.now().toString(), name, fleet: JSON.parse(JSON.stringify(state.fleet)) });
        savePresets(presets);
        overlay.remove();
        renderUI();
      };
    };

    // 5. Пресеты
    const presetsWrap = document.createElement('div');
    presetsWrap.className = 'wh-presets-wrap';
    const presets = loadPresets();
    
    presets.forEach(p => {
      const card = document.createElement('div');
      card.className = 'wh-preset-card';
      
      const miniBoard = document.createElement('div');
      miniBoard.className = 'wh-mini-board';
      // Отрисовка мини-точек
      for(let y=0; y<10; y++){
        for(let x=0; x<10; x++){
          const isShip = p.fleet.some(s => s.placed && x >= s.x && x <= (s.isVert ? s.x : s.x + s.size - 1) && y >= s.y && y <= (s.isVert ? s.y + s.size - 1 : s.y));
          miniBoard.innerHTML += `<div class="wh-mini-cell ${isShip ? 'ship' : ''}"></div>`;
        }
      }

      card.innerHTML = `<div class="wh-preset-name">${p.name}</div>`;
      card.append(miniBoard);
      card.innerHTML += `<div class="wh-preset-del" data-id="${p.id}">Удалить</div>`;
      
      miniBoard.onclick = () => {
        activeShipId = null;
        state.fleet = JSON.parse(JSON.stringify(p.fleet));
        renderUI();
      };

      card.querySelector('.wh-preset-del').onclick = (e) => {
        e.stopPropagation();
        if(confirm('Удалить расстановку?')) {
          savePresets(loadPresets().filter(item => item.id !== p.id));
          renderUI();
        }
      };

      presetsWrap.append(card);
    });

    el.append(boardWrap, infoBar, fleetWrap, actionsWrap, presetsWrap);
  };

  renderUI();
  root.append(el);

  // Грязный хак для board-view.js (чтобы мы могли ловить координаты ячеек)
  // Мы вешаем координаты на DOM элементы при рендере
  setTimeout(() => {
    const attachCoords = () => {
      const rows = el.querySelectorAll('.wh-board');
      rows.forEach(board => {
        let y = 0, x = -1;
        board.querySelectorAll('.wh-cell').forEach(cell => {
          if (cell.classList.contains('label')) {
            if (cell.textContent.match(/^[0-9]+$/)) { y = parseInt(cell.textContent)-1; x = -1; }
          } else {
            x++;
            cell.dataset.x = x;
            cell.dataset.y = y;
          }
        });
      });
    };
    attachCoords();
    el.addEventListener('click', attachCoords); // обновляем при ререндерах
  }, 10);
};

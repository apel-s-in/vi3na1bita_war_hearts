import { createMessage, MessageType } from '../game/protocol.js';

export class WarHeartsSession {
  constructor({ gameId, player }) {
    this.gameId = gameId;
    this.player = player;
    this.bridge = null;
    this.ready = false;
    this.room = null;
    this.onStatus = () => {};
    this.onChat = () => {};
    this.onGameData = () => {};
    this.onRoom = () => {};
    this.onConnect = () => {};
    this.onDisconnect = () => {};
    this.onIceDiagnostics = () => {};
    this.lastError = '';
  }

  async init() {
    this.onStatus({ label: 'bridge...', online: false });

    try {
      const url = new URL('/Games/common/network-bridge.js', window.location.href).href;
      const mod = await import(url);
      const NetworkBridge = mod.NetworkBridge;

      this.bridge = new NetworkBridge({
        gameId: this.gameId,
        playerId: this.player.id,
        displayName: this.player.name
      });

      this.bridge.onStatus = info => {
        if (info?.ice) this.onIceDiagnostics(info.ice);
        this.onStatus(info);
      };
      this.bridge.onIceDiagnostics = info => this.onIceDiagnostics(info);
      this.bridge.onRoom = info => {
        this.room = info;
        this.onRoom(info);
      };
      this.bridge.onConnect = info => {
        this.ready = true;
        this.onStatus({ label: 'online', online: true });
        this.onConnect(info || {});
      };
      this.bridge.onChat = msg => this.handleData(msg);
      this.bridge.onData = data => {
        if (data?.type === MessageType.CHAT_MESSAGE || data?.type === 'CHAT_MESSAGE') return;
        this.handleData(data);
      };
      this.bridge.onError = info => {
        const transient = !!info?.transient || /signal/i.test(String(info?.label || info?.message || ''));
        if (transient && !this.ready) {
          this.onStatus({ label: 'signal retry', online: false, transient: true });
          return;
        }

        this.ready = false;
        this.onStatus({ label: 'net err', online: false });
        this.onDisconnect({ reason: 'network_error' });
      };

      this.bridge.onDisconnect = info => {
        this.ready = false;
        this.onStatus({ label: 'offline', online: false });
        this.onDisconnect(info || { reason: 'disconnect' });
      };

      this.bridge.onClose = info => {
        this.ready = false;
        this.onStatus({ label: 'closed', online: false });
        this.onDisconnect(info || { reason: 'closed' });
      };

      await this.bridge.init();

      const p = new URLSearchParams(window.location.search);
      const roomId = p.get('room') || '';
      let launchCancelled = false;
      try {
        launchCancelled = !!roomId && sessionStorage.getItem(`wh_cancelled_launch_${roomId}:${p.get('key') || p.get('secret') || ''}`.slice(0, 180)) === '1';
      } catch {}

      const joined = launchCancelled ? false : await this.bridge.connectFromUrl();
      this.onStatus({ label: joined ? 'joining' : 'ready', online: false });
    } catch (err) {
      if (this.bridge) this.bridge.close().catch(() => {});
      this.bridge = null;
      this.lastError = err?.message || String(err || 'network_bridge_init_failed');
      this.onStatus({
        label: 'mock',
        online: false,
        error: this.lastError
      });
    }
  }

async createNearbyGameCode() {
if (!this.bridge) throw new Error('network_bridge_unavailable');
if (!this.room) {
await this.createInvite();
}
return this.bridge.createNearbyGameCode();
}

// ─── LAN Wi-Fi: создание и подключение к комнате ──────────────────────────────
async createLanRoom({ ranked = false, forceLocalOnly = true } = {}) {
  if (!this.bridge) throw new Error('network_bridge_unavailable');

  const room = await this.bridge.connectAsHost({ forceLocalOnly, ranked });
  let registered = null;
  let code = '';

  for (let i = 0; i < 3 && !registered; i++) {
    code = this.bridge.generateLanCode?.() || Math.random().toString(36).slice(2, 8).toUpperCase();
    registered = await this.bridge.registerLanCode?.(code, room.roomId, room.roomSecret, ranked).catch(() => null);
  }

  if (!registered?.ok) throw new Error('lan_code_register_failed');

  this.room = {
    roomId: room.roomId,
    roomSecret: room.roomSecret,
    code,
    ranked: !!ranked,
    localOnly: !!forceLocalOnly,
    matchMode: ranked ? 'ranked' : 'casual',
    joinUrl: room.joinUrl
  };

  return {
    roomId: room.roomId,
    roomSecret: room.roomSecret,
    code,
    ranked: !!ranked,
    localOnly: !!forceLocalOnly,
    matchMode: ranked ? 'ranked' : 'casual',
    joinUrl: room.joinUrl,
    expiresAt: registered.expiresAt
  };
}

async joinLanRoom(code, { forceLocalOnly = true } = {}) {
  if (!this.bridge) throw new Error('network_bridge_unavailable');

  const cleanCode = String(code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
  if (!cleanCode) throw new Error('lan_code_required');

  const roomInfo = await this.bridge.getLanRoomByCode?.(cleanCode);
  if (!roomInfo?.roomId || !roomInfo?.roomSecret) throw new Error('lan_room_not_found');

  const ranked = !!roomInfo.ranked;
  const localOnly = roomInfo.localOnly !== false && !!forceLocalOnly;

  await this.bridge.connectAsGuest({
    roomId: roomInfo.roomId,
    roomSecret: roomInfo.roomSecret,
    forceLocalOnly: localOnly,
    ranked
  });

  this.room = {
    roomId: roomInfo.roomId,
    roomSecret: roomInfo.roomSecret,
    code: cleanCode,
    ranked,
    localOnly,
    matchMode: ranked ? 'ranked' : 'casual',
    expiresAt: roomInfo.expiresAt || 0
  };

  return this.room;
}

  async joinNearbyGameCode(code) {
    if (!this.bridge) throw new Error('network_bridge_unavailable');

    const res = await this.bridge.getNearbyGame(code);
    if (!res?.roomId || !res?.roomSecret) throw new Error('nearby_game_not_found');

    await this.bridge.connectAsGuest({
      roomId: res.roomId,
      roomSecret: res.roomSecret
    });

    return res;
  }

  async createInvite() {
    if (!this.bridge) {
      const invite = {
        id: `mock_${Date.now().toString(36)}`,
        roomId: '',
        roomSecret: '',
        url: '',
        expiresAt: Date.now() + 120000,
        preview: true,
        mock: true
      };
      this.room = invite;
      return invite;
    }

    const room = await this.bridge.connectAsHost();
    const invite = {
      id: room.roomId,
      roomId: room.roomId,
      roomSecret: room.roomSecret,
      url: room.joinUrl,
      expiresAt: Date.now() + 120000
    };

    this.room = invite;
    return invite;
  }

  handleData(data) {
    if (!data) return;

    if (data?.type === MessageType.CHAT_MESSAGE || data?.type === 'CHAT_MESSAGE') {
      this.onChat({
        from: data.payload?.from || 'Соперник',
        text: data.payload?.text || '',
        at: data.at || Date.now()
      });
      return;
    }

    if (Object.values(MessageType).includes(data.type)) {
      this.onGameData(data);
    }
  }

  send(data) {
    if (!this.bridge || !this.ready) return false;

    try {
      return !!this.bridge.send(data);
    } catch {
      this.ready = false;
      this.onStatus({ label: 'send err', online: false });
      this.onDisconnect({ reason: 'send_error' });
      return false;
    }
  }

  sendChat(text) {
    const msg = createMessage(MessageType.CHAT_MESSAGE, {
      from: this.player.name,
      text
    });

    if (!this.bridge || !this.ready) return false;

    try {
      return this.bridge.sendChat
        ? !!this.bridge.sendChat(text, this.player.name)
        : this.send(msg);
    } catch {
      this.ready = false;
      this.onStatus({ label: 'chat err', online: false });
      this.onDisconnect({ reason: 'chat_send_error' });
      return false;
    }
  }

  sendGame(type, payload = {}) {
    return this.send(createMessage(type, {
      gameId: this.gameId,
      from: {
        id: this.player.id,
        name: this.player.name
      },
      ...payload
    }));
  }

  sendReady(payload = {}) {
    return this.sendGame(MessageType.READY, payload);
  }

  sendBoardCommit(payload = {}) {
    return this.sendGame(MessageType.BOARD_COMMIT, payload);
  }

  sendBoardReveal(payload = {}) {
    return this.sendGame(MessageType.BOARD_REVEAL, payload);
  }

  sendShot(payload = {}) {
    return this.sendGame(MessageType.SHOT, payload);
  }

  sendShotResult(payload = {}) {
    return this.sendGame(MessageType.SHOT_RESULT, payload);
  }

  sendMatchFinished(payload = {}) {
    return this.sendGame(MessageType.MATCH_FINISHED, payload);
  }

  async toggleVoice(active) {
    if (!this.bridge) return false;
    await this.bridge.toggleVoice(active);
    return true;
  }

  async close() {
    try {
      await this.bridge?.close?.();
    } catch {
      // ignore bridge close errors
    }

    this.ready = false;
    this.room = null;
    this.onStatus({ label: 'offline', online: false });
  }
}

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
  }

  async init() {
    this.onStatus({ label: 'bridge...', online: false });

    try {
      const url = new URL('/Games/common/network-bridge.js', window.location.origin).href;
      const mod = await import(url);
      const NetworkBridge = mod.NetworkBridge;

      this.bridge = new NetworkBridge({
        gameId: this.gameId,
        playerId: this.player.id,
        displayName: this.player.name
      });

      this.bridge.onStatus = info => this.onStatus(info);
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
      this.bridge.onError = () => {
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

      const joined = await this.bridge.connectFromUrl();
      this.onStatus({ label: joined ? 'joining' : 'ready', online: false });
    } catch {
      this.bridge = null;
      this.onStatus({ label: 'mock', online: false });
    }
  }

  async createInvite() {
    if (!this.bridge) {
      const invite = {
        id: `mock_${Date.now().toString(36)}`,
        url: window.location.href,
        expiresAt: Date.now() + 120000,
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
    await this.bridge?.close?.();
  }
}

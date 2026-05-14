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
    this.onRoom = () => {};
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
      this.bridge.onConnect = () => {
        this.ready = true;
        this.onStatus({ label: 'online', online: true });
      };
      this.bridge.onChat = msg => this.handleData(msg);
      this.bridge.onData = data => this.handleData(data);
      this.bridge.onError = () => this.onStatus({ label: 'net err', online: false });

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
        expiresAt: Date.now() + 30000,
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
      expiresAt: Date.now() + 86400000
    };

    this.room = invite;
    return invite;
  }

  handleData(data) {
    if (data?.type === MessageType.CHAT_MESSAGE || data?.type === 'CHAT_MESSAGE') {
      this.onChat({
        from: data.payload?.from || 'Соперник',
        text: data.payload?.text || '',
        at: data.at || Date.now()
      });
    }
  }

  send(data) {
    if (!this.bridge) return false;
    return this.bridge.send(data);
  }

  sendChat(text) {
    const msg = createMessage(MessageType.CHAT_MESSAGE, {
      from: this.player.name,
      text
    });

    if (!this.bridge) return false;
    return this.bridge.sendChat ? this.bridge.sendChat(text, this.player.name) : this.send(msg);
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

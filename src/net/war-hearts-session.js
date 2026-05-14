import { createMessage, MessageType } from '../game/protocol.js';

export class WarHeartsSession {
  constructor({ gameId, player }) {
    this.gameId = gameId;
    this.player = player;
    this.bridge = null;
    this.ready = false;
    this.onStatus = () => {};
    this.onChat = () => {};
  }

  async init() {
    this.onStatus({ label: 'bridge...', online: false });

    try {
      const url = new URL('/Games/common/network-bridge.js', window.location.origin).href;
      const mod = await import(url);
      const NetworkBridge = mod.NetworkBridge;
      this.bridge = new NetworkBridge(this.player.id);
      this.bridge.onConnect = () => {
        this.ready = true;
        this.onStatus({ label: 'online', online: true });
      };
      this.bridge.onData = data => this.handleData(data);
      this.onStatus({ label: 'ready', online: false });
    } catch {
      this.bridge = null;
      this.onStatus({ label: 'mock', online: false });
    }
  }

  handleData(data) {
    if (data?.type === MessageType.CHAT_MESSAGE) {
      this.onChat({
        from: data.payload?.from || 'Соперник',
        text: data.payload?.text || '',
        at: data.at || Date.now()
      });
    }
  }

  send(data) {
    if (!this.bridge) return false;
    this.bridge.send(data);
    return true;
  }

  sendChat(text) {
    return this.send(createMessage(MessageType.CHAT_MESSAGE, {
      from: this.player.name,
      text
    }));
  }

  async toggleVoice(active) {
    if (!this.bridge) return false;
    await this.bridge.toggleVoice(active);
    return true;
  }
}

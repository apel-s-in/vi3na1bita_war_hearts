import {
  createMessage,
  MessageType,
  PROTOCOL_VERSION
} from '../game/protocol.js';
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
      const url = new URL('/Games/common/network-bridge.js', window.location.href);
      url.searchParams.set('rev', '20260728-network-5');
      const mod = await import(url.href);
      const NetworkBridge = mod.NetworkBridge;
      this.bridge = new NetworkBridge({ gameId: this.gameId, playerId: this.player.id, displayName: this.player.name });
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
      const joined = await this.bridge.connectFromUrl();
      this.lastError = '';
      this.onStatus({ label: joined ? 'joining' : 'ready', online: false });
      return true;
    } catch (err) {
      try {
        await this.bridge?.close?.();
      } catch {}
      this.bridge = null;
      this.ready = false;
      this.lastError = err?.message || String(err || 'network_bridge_init_failed');
      this.onStatus({ label: 'mock', online: false, error: this.lastError });
      return false;
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
  async createLanRoom() {
    if (!this.bridge) throw new Error('network_bridge_unavailable');

    const room = await this.bridge.connectAsHost({
      forceLocalOnly: true,
      ranked: true
    });

    if (room.ranked !== true) throw new Error('ranked_room_required');

    let registered = null;
    let code = '';

    for (let attempt = 0; attempt < 5 && !registered?.ok; attempt++) {
      code = this.bridge.generateLanCode?.() ||
        String(Math.floor(100000 + Math.random() * 900000));

      registered = await this.bridge.registerLanCode?.(
        code,
        room.roomId,
        room.roomSecret,
        true,
        true
      ).catch(() => null);
    }

    if (!registered?.ok) throw new Error('lan_code_register_failed');

    this.room = {
      role: 'host',
      roomId: room.roomId,
      roomSecret: room.roomSecret,
      code,
      ranked: true,
      localOnly: true,
      matchMode: 'ranked',
      joinUrl: room.joinUrl
    };

    return {
      ...this.room,
      expiresAt: registered.expiresAt
    };
  }
  async resolveLanRoom(code) {
    if (!this.bridge) throw new Error('network_bridge_unavailable');
    const cleanCode = String(code || '')
      .replace(/\D/g, '')
      .slice(0, 6);
    if (!cleanCode) throw new Error('lan_code_required');
    const roomInfo = await this.bridge.getLanRoomByCode?.(cleanCode);
    if (!roomInfo?.roomId || !roomInfo?.roomSecret) throw new Error('lan_room_not_found');
    return { ...roomInfo, code: cleanCode, ranked: !!roomInfo.ranked, localOnly: roomInfo.localOnly !== false, matchMode: roomInfo.ranked ? 'ranked' : 'casual' };
  }
  async joinLanRoom(code) {
    if (!this.bridge) throw new Error('network_bridge_unavailable');

    const roomInfo = await this.resolveLanRoom(code);
    if (roomInfo.ranked !== true || roomInfo.matchMode !== 'ranked') {
      throw new Error('ranked_room_required');
    }

    this.room = {
      role: 'guest',
      roomId: roomInfo.roomId,
      roomSecret: roomInfo.roomSecret,
      code: roomInfo.code,
      ranked: true,
      localOnly: true,
      matchMode: 'ranked',
      expiresAt: roomInfo.expiresAt || 0
    };

    await this.bridge.connectAsGuest({
      roomId: roomInfo.roomId,
      roomSecret: roomInfo.roomSecret,
      forceLocalOnly: true,
      ranked: true,
      rankedOverride: true
    });

    if (this.bridge.ranked !== true) {
      throw new Error('ranked_room_required');
    }

    this.room = {
      ...this.room,
      ranked: true,
      localOnly: true,
      matchMode: 'ranked'
    };

    return this.room;
  }
  async joinNearbyGameCode(code) {
    if (!this.bridge) throw new Error('network_bridge_unavailable');
    const res = await this.bridge.getNearbyGame(code);
    if (!res?.roomId || !res?.roomSecret) throw new Error('nearby_game_not_found');
    await this.bridge.connectAsGuest({ roomId: res.roomId, roomSecret: res.roomSecret });
    return res;
  }
  async createInvite() {
    if (!this.bridge) {
      throw new Error('network_bridge_unavailable');
    }

    const room = await this.bridge.connectAsHost({
      ranked: true,
      forceLocalOnly: false
    });

    if (room.ranked !== true) {
      throw new Error('ranked_room_required');
    }

    const invite = {
      id: room.roomId,
      roomId: room.roomId,
      roomSecret: room.roomSecret,
      url: room.joinUrl,
      ranked: true,
      localOnly: false,
      matchMode: 'ranked',
      expiresAt: Date.now() + 120000
    };

    this.room = invite;
    return invite;
  }
  handleData(data) {
    if (!data || typeof data !== 'object') return;

    if (
      data.type === MessageType.CHAT_MESSAGE ||
      data.type === 'CHAT_MESSAGE'
    ) {
      this.onChat({
        from: data.payload?.from || 'Соперник',
        text: String(
          data.payload?.text || ''
        ).slice(0, 300),
        at: data.at || Date.now()
      });
      return;
    }

    if (data.v !== PROTOCOL_VERSION) {
      this.onStatus({
        label: 'protocol mismatch',
        online: false,
        error: 'game_protocol_mismatch'
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
    const msg = createMessage(MessageType.CHAT_MESSAGE, { from: this.player.name, text });
    if (!this.bridge || !this.ready) return false;
    try {
      return this.bridge.sendChat ? !!this.bridge.sendChat(text, this.player.name) : this.send(msg);
    } catch {
      this.ready = false;
      this.onStatus({ label: 'chat err', online: false });
      this.onDisconnect({ reason: 'chat_send_error' });
      return false;
    }
  }
  sendGame(type, payload = {}) {
    return this.send(createMessage(type, { gameId: this.gameId, from: { id: this.player.id, name: this.player.name }, ...payload }));
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
  async getProfile(friendId) {
    if (!this.bridge) {
      throw new Error('network_bridge_unavailable');
    }
    return this.bridge.getProfile(friendId);
  }
  async prepareRankedMatch() {
    if (!this.bridge) {
      throw new Error('network_bridge_unavailable');
    }
    const result = await this.bridge.prepareRankedMatch();
    this.ranked = { matchId: result?.match?.matchId || '', playerId: result?.playerId || '', peerPlayerId: result?.peerPlayerId || '', status: result?.match?.status || '' };
    return result;
  }
  async prepareRankedStake(matchId) {
    if (!this.bridge) {
      throw new Error('network_bridge_unavailable');
    }
    return this.bridge.prepareRankedStake(matchId);
  }
  async commitRankedRps({ matchId, round, commit } = {}) {
    if (!this.bridge) {
      throw new Error('network_bridge_unavailable');
    }
    return this.bridge.commitRankedRps({ matchId, round, commit });
  }
  async revealRankedRps({ matchId, round, choice, salt } = {}) {
    if (!this.bridge) {
      throw new Error('network_bridge_unavailable');
    }
    return this.bridge.revealRankedRps({ matchId, round, choice, salt });
  }
  async submitRankedMatch({ matchId, submission } = {}) {
    if (!this.bridge) {
      throw new Error('network_bridge_unavailable');
    }
    return this.bridge.submitRankedMatch({
      matchId,
      submission
    });
  }
  async getRankedMatchStatus(matchId) {
    if (!this.bridge) {
      throw new Error('network_bridge_unavailable');
    }
    return this.bridge.getRankedMatchStatus(matchId);
  }
  async getRankedStats() {
    if (!this.bridge) {
      throw new Error('network_bridge_unavailable');
    }

    return this.bridge.getRankedStats();
  }
  async abortRankedMatch({ matchId, reason = 'disconnect' } = {}) {
    if (!this.bridge) {
      throw new Error('network_bridge_unavailable');
    }
    return this.bridge.abortRankedMatch({ matchId, reason });
  }
  async sendGameInvite({ toFriendId, roomId, roomSecret } = {}) {
    if (!this.bridge) {
      throw new Error('network_bridge_unavailable');
    }
    return this.bridge.sendGameInvite({ toFriendId, gameId: this.gameId, roomId, roomSecret });
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

// ============================================================================
// APUS.IO — MULTIPLAYER ROOM KEY MANAGER (WEBSOCKET + BROADCASTCHANNEL + BOT FILL)
// ============================================================================
import { CONFIG } from './Config.js';

export class RoomManager {
  /**
   * @param {Object} callbacks
   * @param {Function} callbacks.onPeerStateUpdate
   * @param {Function} callbacks.onPeerEliminated
   * @param {Function} callbacks.onPeerGhostEmote
   * @param {Function} callbacks.onRoomJoined
   */
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.peerId = 'peer_' + Math.random().toString(36).slice(2, 10);
    this.roomKey = 'PUBLIC_MAIN';
    this.roomMode = 'QUICK_PLAY'; // 'QUICK_PLAY' | 'PRIVATE'
    this.fillWithBots = true;

    this.peers = new Map(); // peerId -> { lastSeen, state, slotId, ... }
    this.ws = null;
    this.channel = null;

    this._initTransport();
  }

  _initTransport() {
    // 1. Cross-Tab / Local Browser BroadcastChannel (works immediately with zero backend required)
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel('apus_io_room_channel_v1');
        this.channel.onmessage = (event) => {
          this._handleIncomingPacket(event.data);
        };
      } catch {
        this.channel = null;
      }
    }

    // 2. Optional WebSocket Room Layer (connects if window.APUS_WS_URL is provided, else graceful fallback)
    const wsUrl = typeof window !== 'undefined' && window.APUS_WS_URL ? window.APUS_WS_URL : null;
    if (wsUrl) {
      try {
        this.ws = new WebSocket(wsUrl);
        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this._handleIncomingPacket(data);
          } catch {
            // Ignore malformed packet
          }
        };
        this.ws.onerror = () => {
          this.ws = null;
        };
      } catch {
        this.ws = null;
      }
    }
  }

  /**
   * Generates a comical 6-character alphanumeric Room Key (e.g., `DERP42`, `FLOP88`, `INKY77`).
   */
  static generateRoomKey() {
    const prefixes = ['DERP', 'FLOP', 'OCTO', 'INKY', 'SPLA', 'KRKN', 'GOOG', 'BOOP'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const digits = Math.floor(10 + Math.random() * 90);
    return `${prefix}${digits}`; // Exactly 6 alphanumeric characters
  }

  /**
   * Normalizes a user-entered Room Key (strips hyphens/spaces, uppercases, max 6 chars).
   */
  static sanitizeRoomKey(rawKey) {
    const cleaned = String(rawKey || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6);
    return cleaned.length >= 4 ? cleaned : RoomManager.generateRoomKey();
  }

  /**
   * Joins a room (`PUBLIC_MAIN` for Quick Play, or a 6-character Room Key for Private/Joined rooms).
   */
  joinRoom({ mode = 'QUICK_PLAY', roomKey = 'PUBLIC_MAIN', fillWithBots = true } = {}) {
    this.roomMode = mode;
    if (mode === 'QUICK_PLAY') {
      this.roomKey = 'PUBLIC_MAIN';
      this.fillWithBots = true;
    } else {
      this.roomKey = RoomManager.sanitizeRoomKey(roomKey);
      this.fillWithBots = Boolean(fillWithBots);
    }

    this.peers.clear();
    this._sendPacket({
      type: 'ROOM_HELLO',
      roomKey: this.roomKey,
      peerId: this.peerId,
      timestamp: Date.now()
    });

    if (this.callbacks.onRoomJoined) {
      this.callbacks.onRoomJoined({
        roomKey: this.roomKey,
        mode: this.roomMode,
        fillWithBots: this.fillWithBots
      });
    }
  }

  /**
   * Broadcasts local player state to any other tabs/clients in the same `roomKey`.
   */
  broadcastPlayerState(player) {
    this._sendPacket({
      type: 'PLAYER_STATE',
      roomKey: this.roomKey,
      peerId: this.peerId,
      timestamp: Date.now(),
      payload: {
        nickname: player.name,
        colorHex: player.colorHex,
        figurineId: player.figurineId,
        patternId: player.patternId,
        borderEffectId: player.borderEffectId,
        state: player.state,
        normal: [player.normal.x, player.normal.y, player.normal.z],
        heading: [player.heading.x, player.heading.y, player.heading.z],
        turnInput: player.turnInput,
        booEmoteTimer: player.booEmoteTimer
      }
    });

    // Prune stale peers (> 4 seconds old)
    const now = Date.now();
    for (const [id, peer] of this.peers.entries()) {
      if (now - peer.lastSeen > 4000) {
        this.peers.delete(id);
      }
    }
  }

  broadcastGhostEmote(player) {
    this._sendPacket({
      type: 'GHOST_EMOTE',
      roomKey: this.roomKey,
      peerId: this.peerId,
      nickname: player.name,
      timestamp: Date.now()
    });
  }

  _sendPacket(packet) {
    if (this.channel) {
      try {
        this.channel.postMessage(packet);
      } catch {
        // Ignore closed channel
      }
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(packet));
      } catch {
        // Ignore WS error
      }
    }
  }

  _handleIncomingPacket(packet) {
    if (!packet || packet.roomKey !== this.roomKey || packet.peerId === this.peerId) {
      return;
    }

    if (packet.type === 'PLAYER_STATE' && packet.payload) {
      this.peers.set(packet.peerId, {
        peerId: packet.peerId,
        lastSeen: Date.now(),
        ...packet.payload
      });
      if (this.callbacks.onPeerStateUpdate) {
        this.callbacks.onPeerStateUpdate(packet.peerId, packet.payload);
      }
    } else if (packet.type === 'GHOST_EMOTE') {
      if (this.callbacks.onPeerGhostEmote) {
        this.callbacks.onPeerGhostEmote(packet.peerId, packet.nickname);
      }
    }
  }
}

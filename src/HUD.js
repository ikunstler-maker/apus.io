// ============================================================================
// APUS.IO — REAL-TIME NICKNAME LEADERBOARD, GHOST REALM BANNER & NAMEPLATES HUD
// ============================================================================
import * as THREE from 'three';
import { CONFIG } from './Config.js';

export class HUD {
  /**
   * @param {import('./PlayerController.js').PlayerController} player
   * @param {import('./TerritoryGrid.js').TerritoryGrid} territoryGrid
   * @param {import('./SphereWorld.js').SphereWorld} sphereWorld
   * @param {import('./HazardsAndBonuses.js').HazardsAndBonuses} hazardsAndBonuses
   * @param {Object} callbacks { onRespawnRequest, onResetUnstuckRequest, onOpenCustomizeRequest, onResetMatchRequest }
   */
  constructor(player, territoryGrid, sphereWorld, hazardsAndBonuses, callbacks = {}) {
    this.player = player;
    this.territoryGrid = territoryGrid;
    this.sphereWorld = sphereWorld;
    this.hazardsAndBonuses = hazardsAndBonuses;
    this.callbacks = callbacks;

    this.soundEnabled = true;
    this.audioCtx = null;
    this.victoryTriggered = false;
    this.currentRoomKey = 'PUBLIC_MAIN';

    this.nameplateMap = new Map(); // contenderId -> DOM element
    this._projVec = new THREE.Vector3();

    this._injectDOM();
    this._bindEvents();
  }

  setRoomKey(roomKey) {
    this.currentRoomKey = roomKey || 'PUBLIC_MAIN';
    if (this.elRoomKeyText) {
      this.elRoomKeyText.textContent = this.currentRoomKey;
    }
  }

  syncObstacleModeUI(modeId) {
    if (!modeId || !CONFIG.OBSTACLE_DENSITY_PRESETS?.[modeId]) return;
    const obsModeBtns = this.root.querySelectorAll('.hud-obs-mode-btn');
    obsModeBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-obstacle-mode') === modeId);
    });
    const labelEl = document.getElementById('hud-obs-mode-label');
    if (labelEl) {
      labelEl.textContent = CONFIG.OBSTACLE_DENSITY_PRESETS[modeId].label;
    }
  }

  _injectDOM() {
    this.root = document.getElementById('hud-root');
    if (!this.root) {
      this.root = document.createElement('div');
      this.root.id = 'hud-root';
      document.body.appendChild(this.root);
    }

    const currentObsMode = CONFIG.OBSTACLE_MODE || 'normal';
    const hudObsModes = [
      { id: 'none', label: '🌊 None', title: 'None (Clean Open Ocean — 0 Obstacles)' },
      { id: 'low', label: '🏝️ Low', title: 'Low (35% Sparse Islands)' },
      { id: 'normal', label: '🌴 Normal', title: 'Normal (100% Tropical Archipelago)' },
      { id: 'dense', label: '🪸 Dense', title: 'Dense (150% Reef Maze)' }
    ];
    const hudObsBtnsHTML = hudObsModes.map((m) => `
      <button
        type="button"
        class="hud-obs-mode-btn ${m.id === currentObsMode ? 'active' : ''}"
        data-obstacle-mode="${m.id}"
        title="${m.title}"
      >${m.label}</button>
    `).join('');

    this.root.innerHTML = `
      <!-- Subtle Cinematic Corner Vignette (0.22 darkness at screen corners) -->
      <div class="hud-vignette-overlay" aria-hidden="true"></div>

      <!-- Warm Diagonal Golden Sunbeam Overlay (God Rays from Top-Left) -->
      <div class="hud-sunbeams-overlay" aria-hidden="true"></div>

      <!-- Floating 3D-to-HTML Nameplates Layer -->
      <div class="hud-nameplates-layer" id="hud-nameplates-layer"></div>

      <!-- Top-Left Brand, Room Key, Emergency Reset/Unstuck [R], Obstacles Toggle & Local Player Telemetry -->
      <header class="hud-panel hud-brand-panel" id="hud-telemetry-panel">
        <div class="brand-row">
          <div class="brand-badge">🐙</div>
          <div class="brand-title-col">
            <h1 class="brand-title">APUS<span>.IO</span></h1>
            <p class="brand-subtitle">Sunny Spherical Octopus Arena</p>
          </div>
          <button type="button" class="hud-mini-lobby-btn" id="hud-open-lobby-btn" title="Customize Loadout, Speed & Sharks [C]">
            🎨 Loadout
          </button>
        </div>

        <!-- Always-Accessible Emergency Reset / Unstuck [R] Button -->
        <div class="hud-action-utility-row">
          <button
            type="button"
            class="hud-unstuck-reset-btn"
            id="hud-reset-unstuck-btn"
            title="Immediately reset your current run and respawn at a safe ocean spot with a fresh starter island (Shortcut: R)"
          >
            🔄 Reset / Unstuck <kbd>[R]</kbd>
          </button>
        </div>

        <!-- Always-Accessible In-Game 🏝️ Obstacles Mode Selector (None / Low / Normal / Dense) -->
        <div class="hud-obstacles-selector-block">
          <div class="hud-obs-label-row">
            <span>🏝️ Obstacles Mode:</span>
            <strong id="hud-obs-mode-label">${CONFIG.OBSTACLE_DENSITY_PRESETS?.[currentObsMode]?.label || 'Normal'}</strong>
          </div>
          <div class="hud-obs-pills-row" id="hud-obs-pills-row">
            ${hudObsBtnsHTML}
          </div>
        </div>

        <!-- Room Key Badge (Click to Copy) + Live Ghosts Haunting Counter -->
        <div class="room-and-ghost-bar">
          <button type="button" class="room-key-pill" id="hud-room-key-btn" title="Click to copy Room Key">
            <span>🔑 Room:</span>
            <strong id="hud-room-key-text">${this.currentRoomKey}</strong>
            <small id="hud-copy-hint">📋</small>
          </button>
          <div class="ghost-counter-pill" id="hud-ghost-counter-pill" title="Eliminated players currently haunting the Ghost Realm">
            <span>👻 Ghosts Haunting:</span>
            <strong id="hud-ghost-count">0</strong>
          </div>
        </div>

        <div class="telemetry-stats">
          <div class="stat-box">
            <span class="stat-label">DOMAIN CAPTURED</span>
            <div class="stat-value-row">
              <span class="stat-value" id="hud-player-pct">0.0%</span>
              <span class="stat-goal">/ ${CONFIG.DOMINATION_TARGET}% Goal</span>
            </div>
            <div class="stat-progress-track">
              <div class="stat-progress-fill" id="hud-player-bar" style="width: 0%"></div>
            </div>
          </div>

          <div class="stat-mini-grid">
            <div class="stat-mini">
              <span class="stat-label">ELIMINATIONS</span>
              <span class="stat-mini-val" id="hud-player-kills">0</span>
            </div>
            <div class="stat-mini">
              <span class="stat-label">STATUS</span>
              <span class="status-pill safe" id="hud-status-pill">SAFE ZONE</span>
            </div>
          </div>
        </div>

        <!-- Live Rule Switches -->
        <details class="rules-drawer" id="hud-rules-drawer">
          <summary>⚙️ Arena Rules & Audio</summary>
          <div class="rules-list">
            <label class="rule-toggle">
              <input type="checkbox" id="toggle-self-cross" ${CONFIG.ALLOW_SELF_CROSS ? 'checked' : ''} />
              <span>Allow Self-Trail Cross</span>
            </label>
            <label class="rule-toggle">
              <input type="checkbox" id="toggle-sound-fx" checked />
              <span>Synthesizer Audio FX</span>
            </label>
          </div>
        </details>
      </header>

      <!-- Top-Center Live Event Feed & Notifications -->
      <div class="hud-toast-container" id="hud-toast-container" aria-live="polite"></div>

      <!-- Top-Right Real-Time Nickname Leaderboard (Top 6 + Local Player) -->
      <aside class="hud-panel hud-leaderboard-panel" id="hud-leaderboard-panel">
        <div class="panel-header">
          <span class="panel-title">👑 LIVE LEADERBOARD</span>
          <span class="panel-tag">TOP 6</span>
        </div>
        <div class="leaderboard-list" id="hud-leaderboard-list"></div>
      </aside>

      <!-- Bottom-Left Active Power-Up Timers & Controls Hint -->
      <section class="hud-bottom-left">
        <div class="powerup-timers-list" id="hud-powerups-list"></div>
        <div class="hud-panel controls-hint-card">
          <div class="controls-row">
            <kbd>Mouse</kbd> <span>or</span> <kbd>WASD</kbd> / <kbd>Arrows</kbd> <span>Steer</span> • <kbd>R</kbd> <span>Unstuck</span>
          </div>
          <div class="controls-sub">Close loops into your zone to flood-fill the ocean. Cut enemy trails!</div>
        </div>
      </section>

      <!-- Bottom-Center Touch Virtual Joystick -->
      <div class="touch-joystick-zone" id="hud-joystick-zone" title="Drag to steer">
        <div class="touch-joystick-base" id="hud-joystick-base">
          <div class="touch-joystick-knob" id="hud-joystick-knob"></div>
        </div>
      </div>

      <!-- Bottom Floating Ghost Realm Haunting Banner (Shown when Local Player is GHOST) -->
      <section class="hud-panel ghost-realm-banner hidden" id="hud-ghost-banner">
        <div class="ghost-banner-header">
          <span class="ghost-banner-icon">👻</span>
          <div class="ghost-banner-copy">
            <strong>You are haunting the ocean! Living players cannot see you, but other Ghosts can.</strong>
            <span id="hud-ghost-reason-sub">Press <kbd>E</kbd> or <kbd>Click</kbd> to perform a goofy Ghost-Spin / Boo! emote</span>
          </div>
        </div>
        <div class="ghost-banner-actions">
          <button type="button" class="hud-primary-btn ghost-respawn-btn" id="hud-ghost-respawn-btn">
            ⚡ Respawn Now <span class="btn-shortcut">[Space]</span>
          </button>
          <button type="button" class="hud-secondary-btn ghost-customize-btn" id="hud-ghost-customize-btn">
            🎨 Customize Loadout <span class="btn-shortcut">[C]</span>
          </button>
        </div>
      </section>

      <!-- Bottom-Right Miniature 3D Globe Radar -->
      <aside class="hud-panel hud-globe-panel" id="hud-globe-panel">
        <div class="globe-header">
          <span>3D SPHERE RADAR</span>
          <span class="globe-legend">
            <i class="dot-shark"></i>Shark
            <i class="dot-vortex"></i>Vortex
          </span>
        </div>
        <div class="globe-canvas-wrap">
          <canvas id="hud-globe-canvas" width="210" height="210"></canvas>
        </div>
      </aside>

      <!-- Victory Celebration Modal (35% Domination Target) -->
      <div class="hud-modal-backdrop hidden" id="hud-victory-modal">
        <div class="hud-modal-card victory">
          <div class="modal-badge crown">🏆 SPHERICAL DOMINATION</div>
          <h2 class="modal-title" id="victory-modal-title">Ocean Conquered!</h2>
          <p class="modal-desc" id="victory-modal-desc">35% Domination Target Achieved!</p>
          <div class="modal-actions">
            <button class="hud-primary-btn" id="hud-continue-btn">🌊 Keep Expanding</button>
            <button class="hud-secondary-btn" id="hud-newmatch-btn">🔄 New World</button>
          </div>
        </div>
      </div>
    `;

    this.elNameplatesLayer = document.getElementById('hud-nameplates-layer');
    this.elRoomKeyBtn = document.getElementById('hud-room-key-btn');
    this.elRoomKeyText = document.getElementById('hud-room-key-text');
    this.elCopyHint = document.getElementById('hud-copy-hint');
    this.elGhostCount = document.getElementById('hud-ghost-count');

    this.elPlayerPct = document.getElementById('hud-player-pct');
    this.elPlayerBar = document.getElementById('hud-player-bar');
    this.elPlayerKills = document.getElementById('hud-player-kills');
    this.elStatusPill = document.getElementById('hud-status-pill');
    this.elLeaderboardList = document.getElementById('hud-leaderboard-list');
    this.elPowerUpsList = document.getElementById('hud-powerups-list');
    this.elToastContainer = document.getElementById('hud-toast-container');

    this.elGhostBanner = document.getElementById('hud-ghost-banner');
    this.elGhostReasonSub = document.getElementById('hud-ghost-reason-sub');
    this.elGhostRespawnBtn = document.getElementById('hud-ghost-respawn-btn');
    this.elGhostCustomizeBtn = document.getElementById('hud-ghost-customize-btn');
    this.elOpenLobbyBtn = document.getElementById('hud-open-lobby-btn');
    this.elResetUnstuckBtn = document.getElementById('hud-reset-unstuck-btn');

    this.elVictoryModal = document.getElementById('hud-victory-modal');
    this.elVictoryTitle = document.getElementById('victory-modal-title');
    this.elVictoryDesc = document.getElementById('victory-modal-desc');
    this.elContinueBtn = document.getElementById('hud-continue-btn');
    this.elNewMatchBtn = document.getElementById('hud-newmatch-btn');

    this.globeCanvas = document.getElementById('hud-globe-canvas');
    this.globeCtx = this.globeCanvas.getContext('2d');

    this.peakPlayerPct = 0;
  }

  _bindEvents() {
    // Copy Room Key badge
    this.elRoomKeyBtn.addEventListener('click', () => {
      navigator.clipboard?.writeText(this.currentRoomKey).catch(() => {});
      this.elCopyHint.textContent = '✅';
      this.showToast(`📋 Copied Room Key: ${this.currentRoomKey}`, '#70f3ff');
      setTimeout(() => { this.elCopyHint.textContent = '📋'; }, 1600);
    });

    // Always-accessible Emergency "🔄 Reset / Unstuck [R]" button
    const triggerResetUnstuck = () => {
      this.hideGhostBanner();
      if (this.callbacks.onResetUnstuckRequest) {
        this.callbacks.onResetUnstuckRequest();
      } else if (this.callbacks.onRespawnRequest) {
        this.callbacks.onRespawnRequest();
      }
    };

    if (this.elResetUnstuckBtn) {
      this.elResetUnstuckBtn.addEventListener('click', triggerResetUnstuck);
    }

    // In-Game 🏝️ Obstacles Mode Selector (None / Low / Normal / Dense)
    const obsModeBtns = this.root.querySelectorAll('.hud-obs-mode-btn');
    obsModeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const modeId = btn.getAttribute('data-obstacle-mode') || 'normal';
        this.syncObstacleModeUI(modeId);
        if (this.callbacks.onObstacleModeChange) {
          this.callbacks.onObstacleModeChange(modeId);
        }
      });
    });

    // Ghost Realm Banner Buttons: Respawn Now [Space] & Customize Loadout [C]
    this.elGhostRespawnBtn.addEventListener('click', () => {
      this.hideGhostBanner();
      if (this.callbacks.onRespawnRequest) {
        this.callbacks.onRespawnRequest();
      }
    });

    const openCustomizer = () => {
      if (this.callbacks.onOpenCustomizeRequest) {
        this.callbacks.onOpenCustomizeRequest();
      }
    };

    this.elGhostCustomizeBtn.addEventListener('click', openCustomizer);
    this.elOpenLobbyBtn.addEventListener('click', openCustomizer);

    window.addEventListener('keydown', (e) => {
      // Ignore if typing inside an input element
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        return;
      }

      if (e.code === 'KeyR') {
        e.preventDefault();
        triggerResetUnstuck();
      } else if (e.code === 'Space' && this.player.state === 'GHOST') {
        e.preventDefault();
        this.elGhostRespawnBtn.click();
      } else if (e.code === 'KeyC') {
        e.preventDefault();
        openCustomizer();
      }
    });

    // Victory modal buttons
    this.elContinueBtn.addEventListener('click', () => {
      this.elVictoryModal.classList.add('hidden');
    });

    this.elNewMatchBtn.addEventListener('click', () => {
      this.elVictoryModal.classList.add('hidden');
      this.victoryTriggered = false;
      if (this.callbacks.onResetMatchRequest) {
        this.callbacks.onResetMatchRequest();
      }
    });

    // Configurable gameplay rule switches
    document.getElementById('toggle-self-cross').addEventListener('change', (e) => {
      CONFIG.ALLOW_SELF_CROSS = e.target.checked;
      this.showToast(`Self-Trail Cross: ${CONFIG.ALLOW_SELF_CROSS ? 'Allowed' : 'Lethal'}`, '#70f3ff');
    });

    document.getElementById('toggle-sound-fx').addEventListener('change', (e) => {
      this.soundEnabled = e.target.checked;
    });

    // Virtual Touch Joystick pointer handling
    const zone = document.getElementById('hud-joystick-zone');
    const knob = document.getElementById('hud-joystick-knob');
    let dragging = false;

    const updateKnob = (clientX, clientY) => {
      const rect = zone.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const maxR = rect.width * 0.38;

      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > maxR) {
        dx = (dx / dist) * maxR;
        dy = (dy / dist) * maxR;
      }

      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.player.setTouchJoystick(true, dx / maxR, dy / maxR);
    };

    zone.addEventListener('pointerdown', (e) => {
      dragging = true;
      zone.setPointerCapture(e.pointerId);
      updateKnob(e.clientX, e.clientY);
    });

    zone.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      updateKnob(e.clientX, e.clientY);
    });

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      knob.style.transform = 'translate(0px, 0px)';
      this.player.setTouchJoystick(false, 0, 0);
    };

    zone.addEventListener('pointerup', endDrag);
    zone.addEventListener('pointercancel', endDrag);
  }

  showToast(message, accentHex = '#00f5d4') {
    const toast = document.createElement('div');
    toast.className = 'hud-toast';
    toast.style.borderLeftColor = accentHex;
    toast.innerHTML = `<span>${message}</span>`;
    this.elToastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 320);
    }, 2600);
  }

  /**
   * Shows the floating Ghost Realm Banner when the local player enters the Ghost Realm.
   */
  showGhostBanner(reasonText) {
    if (reasonText) {
      this.elGhostReasonSub.innerHTML = `${reasonText} • Press <kbd>E</kbd> or <kbd>Click</kbd> for Ghost-Spin / Boo!`;
    }
    this.elGhostBanner.classList.remove('hidden');
  }

  hideGhostBanner() {
    this.elGhostBanner.classList.add('hidden');
  }

  showVictoryModal(winnerContender) {
    if (this.victoryTriggered) return;
    this.victoryTriggered = true;

    const isLocal = winnerContender.isPlayer;
    this.elVictoryTitle.textContent = isLocal
      ? '🎉 You Command the Sphere!'
      : `👑 ${winnerContender.name} Claims Domination!`;
    this.elVictoryDesc.textContent = `${winnerContender.name} captured ${winnerContender.scorePercentage.toFixed(1)}% of the navigable ocean surface (Target: ${CONFIG.DOMINATION_TARGET}%).`;
    this.elVictoryModal.classList.remove('hidden');
    this.playSound('victory');
  }

  playSound(kind) {
    if (!this.soundEnabled) return;
    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      if (kind === 'capture') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(340, now);
        osc.frequency.exponentialRampToValueAtTime(680, now + 0.18);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (kind === 'powerup') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.24);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
        osc.start(now);
        osc.stop(now + 0.26);
      } else if (kind === 'kill') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.exponentialRampToValueAtTime(560, now + 0.16);
        gain.gain.setValueAtTime(0.11, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (kind === 'eliminated' || kind === 'shark') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(250, now);
        osc.frequency.exponentialRampToValueAtTime(85, now + 0.34);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
        osc.start(now);
        osc.stop(now + 0.36);
      } else if (kind === 'boo') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(580, now);
        osc.frequency.exponentialRampToValueAtTime(790, now + 0.12);
        osc.frequency.exponentialRampToValueAtTime(420, now + 0.3);
        gain.gain.setValueAtTime(0.11, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        osc.start(now);
        osc.stop(now + 0.32);
      } else if (kind === 'whirlpool') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(240, now + 0.15);
        osc.frequency.exponentialRampToValueAtTime(640, now + 0.32);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (kind === 'victory') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(554.37, now + 0.12);
        osc.frequency.setValueAtTime(659.25, now + 0.24);
        osc.frequency.setValueAtTime(880, now + 0.36);
        gain.gain.setValueAtTime(0.16, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
        osc.start(now);
        osc.stop(now + 0.65);
      }
    } catch {
      // Ignore Web Audio autoplay restriction errors
    }
  }

  /**
   * Main HUD update:
   * 1. Updates Ghost Haunting counter & Player telemetry
   * 2. Sorts and renders Top 6 Live Nickname Leaderboard (+ local player row if outside Top 6)
   * 3. Projects floating 3D-to-HTML Nameplates above every visible 1.8x Octopus head
   * 4. Updates Active Power-Up Timers & 3D Globe Radar
   */
  update(allContenders, camera) {
    let ghostCount = 0;

    for (let i = 0; i < allContenders.length; i++) {
      const c = allContenders[i];
      if (c.state === 'GHOST') {
        ghostCount++;
        c.scorePercentage = 0;
      } else {
        c.scorePercentage = this.territoryGrid.getOwnershipPercentage(c.id);
      }
      if (c.isPlayer && c.scorePercentage > this.peakPlayerPct) {
        this.peakPlayerPct = c.scorePercentage;
      }
      if (!this.victoryTriggered && c.scorePercentage >= CONFIG.DOMINATION_TARGET) {
        this.showVictoryModal(c);
      }
    }

    this.elGhostCount.textContent = `${ghostCount}`;

    // Local Player Telemetry
    const playerPct = this.player.scorePercentage;
    this.elPlayerPct.textContent = `${playerPct.toFixed(1)}%`;
    const barProgress = Math.min(100, (playerPct / CONFIG.DOMINATION_TARGET) * 100);
    this.elPlayerBar.style.width = `${barProgress.toFixed(1)}%`;
    this.elPlayerKills.textContent = `${this.player.kills}`;

    if (this.player.state === 'GHOST') {
      this.elStatusPill.textContent = '👻 GHOST REALM';
      this.elStatusPill.className = 'status-pill cloak';
      this.elGhostBanner.classList.remove('hidden');
    } else {
      this.elGhostBanner.classList.add('hidden');
      if (this.player.stunTimer > 0) {
        this.elStatusPill.textContent = '🦈 SNAPPED TO BASE';
        this.elStatusPill.className = 'status-pill danger';
      } else if (this.player.spawnImmunityTimer > 0) {
        this.elStatusPill.textContent = `🛡️ IMMUNE (${this.player.spawnImmunityTimer.toFixed(1)}s)`;
        this.elStatusPill.className = 'status-pill immune';
      } else if (this.player.isCloaked()) {
        this.elStatusPill.textContent = '👻 CLOAKED';
        this.elStatusPill.className = 'status-pill cloak';
      } else if (this.player.isOutside) {
        this.elStatusPill.textContent = '⚡ TETHER EXPOSED';
        this.elStatusPill.className = 'status-pill vulnerable';
      } else {
        this.elStatusPill.textContent = 'SAFE IN ZONE';
        this.elStatusPill.className = 'status-pill safe';
      }
    }

    // Sort and render Top 6 Real-Time Nickname Leaderboard
    const sorted = [...allContenders].sort((a, b) => b.scorePercentage - a.scorePercentage);
    const top6 = sorted.slice(0, 6);
    const playerRank = sorted.indexOf(this.player) + 1;

    const renderLeaderboardRow = (c, rank) => {
      const isCrown = rank === 1 && c.scorePercentage > 0;
      const pctStr = c.scorePercentage.toFixed(1);
      const fillW = Math.min(100, (c.scorePercentage / CONFIG.DOMINATION_TARGET) * 100);
      const patObj = CONFIG.PATTERNS.find(p => p.id === c.patternId) || CONFIG.PATTERNS[0];
      const ghostPrefix = c.state === 'GHOST' ? '👻 ' : '';

      return `
        <div class="lb-row ${c.isPlayer ? 'is-player' : ''} ${c.state === 'GHOST' ? 'is-ghost-row' : ''}">
          <span class="lb-rank">${isCrown ? '<span class="crown-bounce">👑</span>' : `#${rank}`}</span>
          <span
            class="lb-swatch-badge"
            title="${patObj.name}"
            style="background:${c.colorHex}; box-shadow: 0 0 8px ${c.colorHex}"
          >${patObj.icon}</span>
          <div class="lb-info">
            <div class="lb-name-line">
              <span class="lb-name">${ghostPrefix}${this._escapeHTML(c.name)}</span>
              <span class="lb-pct">${pctStr}%</span>
            </div>
            <div class="lb-bar-track">
              <div class="lb-bar-fill" style="width:${fillW}%; background:${c.colorHex}"></div>
            </div>
          </div>
        </div>
      `;
    };

    let lbHTML = '';
    for (let i = 0; i < top6.length; i++) {
      lbHTML += renderLeaderboardRow(top6[i], i + 1);
    }

    if (playerRank > 6) {
      lbHTML += `<div class="lb-divider"></div>` + renderLeaderboardRow(this.player, playerRank);
    }
    this.elLeaderboardList.innerHTML = lbHTML;

    // Render Active Power-Up Timers
    let puHTML = '';
    for (const [key, remaining] of Object.entries(this.player.powerUps)) {
      if (remaining <= 0.05) continue;
      const cfg = CONFIG.POWERUPS[key];
      const maxDur = key === 'INSTANT_ANCHOR' ? 8.0 : cfg.duration;
      const pct = Math.min(100, (remaining / maxDur) * 100);
      puHTML += `
        <div class="powerup-pill" style="border-color:${cfg.hex}">
          <span class="pu-icon">${cfg.icon}</span>
          <div class="pu-body">
            <div class="pu-header">
              <span class="pu-name">${cfg.name}</span>
              <span class="pu-time">${remaining.toFixed(1)}s</span>
            </div>
            <div class="pu-bar-track">
              <div class="pu-bar-fill" style="width:${pct}%; background:${cfg.hex}"></div>
            </div>
          </div>
        </div>
      `;
    }
    this.elPowerUpsList.innerHTML = puHTML;

    // Update Floating 3D-to-Screen Nameplates above each Octopus head
    if (camera) {
      this._updateFloatingNameplates(allContenders, camera);
    }

    // Render Miniature 3D Globe Radar
    this._render3DGlobeRadar(allContenders);
  }

  /**
   * Projects 3D head coordinates of every visible contender onto screen-space HTML nameplates.
   * Respects the Strict Asymmetric Visibility Rule (Living players NEVER see Ghost nameplates;
   * Ghost players see both Living and Ghost nameplates + `👻 [Nickname]` + Boo! emotes).
   */
  _updateFloatingNameplates(allContenders, camera) {
    const localIsGhost = this.player.state === 'GHOST';
    const halfW = window.innerWidth * 0.5;
    const halfH = window.innerHeight * 0.5;
    const camFront = this.player.camNormal;

    for (let i = 0; i < allContenders.length; i++) {
      const c = allContenders[i];
      let tagEl = this.nameplateMap.get(c.id);
      if (!tagEl) {
        tagEl = document.createElement('div');
        tagEl.className = 'octo-nameplate';
        this.elNameplatesLayer.appendChild(tagEl);
        this.nameplateMap.set(c.id, tagEl);
      }

      // Asymmetric Visibility Rule: Living players cannot see Ghosts!
      if (c.state === 'GHOST' && !localIsGhost) {
        tagEl.style.display = 'none';
        continue;
      }

      // Hide if on back hemisphere away from camera
      const dotFront = c.normal.dot(camFront);
      if (dotFront < 0.22) {
        tagEl.style.display = 'none';
        continue;
      }

      c.getHeadWorldPosition(this._projVec);
      this._projVec.project(camera);

      // Cull if behind camera clip plane or off-screen
      if (this._projVec.z > 1.0 || Math.abs(this._projVec.x) > 1.05 || Math.abs(this._projVec.y) > 1.05) {
        tagEl.style.display = 'none';
        continue;
      }

      const sx = this._projVec.x * halfW + halfW;
      const sy = -this._projVec.y * halfH + halfH;

      const figObj = CONFIG.FIGURINES.find(f => f.id === c.figurineId) || CONFIG.FIGURINES[0];
      const isGhost = c.state === 'GHOST';
      const prefix = isGhost ? '👻' : figObj.icon;
      const booBadge = isGhost && c.booEmoteTimer > 0
        ? `<span class="boo-emote-bubble">👻 BOO!!</span>`
        : '';

      tagEl.style.display = 'flex';
      tagEl.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%)`;
      tagEl.className = `octo-nameplate ${c.isPlayer ? 'local-tag' : ''} ${isGhost ? 'ghost-tag' : ''}`;
      tagEl.style.setProperty('--tag-color', c.colorHex);
      tagEl.innerHTML = `
        ${booBadge}
        <div class="nameplate-pill">
          <span class="np-icon">${prefix}</span>
          <span class="np-text">${this._escapeHTML(c.name)}</span>
          ${!isGhost ? `<span class="np-pct">${c.scorePercentage.toFixed(1)}%</span>` : ''}
        </div>
      `;
    }
  }

  _escapeHTML(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  _render3DGlobeRadar(allContenders) {
    const ctx = this.globeCtx;
    const w = this.globeCanvas.width;
    const h = this.globeCanvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const globeR = w * 0.43;

    ctx.clearRect(0, 0, w, h);

    const grad = ctx.createRadialGradient(cx - globeR * 0.28, cy - globeR * 0.28, globeR * 0.1, cx, cy, globeR);
    grad.addColorStop(0, '#2ec4b6');
    grad.addColorStop(0.55, '#086988');
    grad.addColorStop(1, '#063b5a');

    ctx.beginPath();
    ctx.arc(cx, cy, globeR, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, globeR * 0.66, 0, Math.PI * 2);
    ctx.moveTo(cx - globeR, cy);
    ctx.lineTo(cx + globeR, cy);
    ctx.moveTo(cx, cy - globeR);
    ctx.lineTo(cx, cy + globeR);
    ctx.stroke();

    const east = this.player.camEast;
    const north = this.player.camNorth;
    const front = this.player.camNormal;

    const normals = this.territoryGrid.cellNormals;
    const owners = this.territoryGrid.owner;
    const obstacles = this.territoryGrid.obstacle;

    // Build quick color lookup from active contenders
    const contenderHexMap = new Array(16).fill('#00f5d4');
    for (let i = 0; i < allContenders.length; i++) {
      contenderHexMap[allContenders[i].id] = allContenders[i].colorHex;
    }

    for (let c = 0; c < this.territoryGrid.cellCount; c += 3) {
      const own = owners[c];
      const isObs = obstacles[c] !== 0;
      if (own < 0 && !isObs) continue;

      const idx = c * 3;
      const nx = normals[idx], ny = normals[idx + 1], nz = normals[idx + 2];
      const z = nx * front.x + ny * front.y + nz * front.z;
      if (z < -0.25) continue;

      const x = nx * east.x + ny * east.y + nz * east.z;
      const y = nx * north.x + ny * north.y + nz * north.z;

      const px = cx + x * globeR;
      const py = cy - y * globeR;

      if (isObs) {
        ctx.fillStyle = z >= 0 ? 'rgba(255, 241, 208, 0.78)' : 'rgba(255, 241, 208, 0.28)';
        ctx.fillRect(px - 1.2, py - 1.2, 2.4, 2.4);
      } else if (own >= 0) {
        ctx.fillStyle = contenderHexMap[own] || '#00f5d4';
        ctx.globalAlpha = z >= 0 ? 0.9 : 0.3;
        ctx.fillRect(px - 1.6, py - 1.6, 3.2, 3.2);
      }
    }
    ctx.globalAlpha = 1.0;

    for (const wp of this.hazardsAndBonuses.whirlpools) {
      const n = wp.normal;
      const z = n.dot(front);
      if (z < 0) continue;
      const x = n.dot(east);
      const y = n.dot(north);
      ctx.beginPath();
      ctx.arc(cx + x * globeR, cy - y * globeR, 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#70f3ff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    for (const shark of this.hazardsAndBonuses.sharks) {
      const n = shark.normal;
      const z = n.dot(front);
      if (z < 0) continue;
      const x = n.dot(east);
      const y = n.dot(north);
      ctx.beginPath();
      ctx.arc(cx + x * globeR, cy - y * globeR, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff2a55';
      ctx.fill();
    }

    const localIsGhost = this.player.state === 'GHOST';
    for (const c of allContenders) {
      if (c.state === 'GHOST' && !localIsGhost) continue;
      const n = c.normal;
      const z = n.dot(front);
      if (z < -0.1) continue;
      const x = n.dot(east);
      const y = n.dot(north);
      const px = cx + x * globeR;
      const py = cy - y * globeR;

      ctx.beginPath();
      ctx.arc(px, py, c.isPlayer ? 4.5 : 3.2, 0, Math.PI * 2);
      ctx.fillStyle = c.state === 'GHOST' ? '#70f3ff' : (c.isPlayer ? '#ffffff' : c.colorHex);
      ctx.fill();
      ctx.strokeStyle = '#041426';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, globeR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

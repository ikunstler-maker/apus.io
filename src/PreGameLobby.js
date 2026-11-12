// ============================================================================
// APUS.IO — PRE-GAME LOBBY, LIVE 3D OCTOPUS PREVIEW, ROOM KEYS & CUSTOMIZER
// ============================================================================
import * as THREE from 'three';
import { CONFIG, getPatternIndex, getBorderEffectIndex } from './Config.js';
import { DerpyOctopusAvatar } from './DerpyOctopusAvatar.js';
import { createTerritoryMaterial } from './Shaders.js';
import { RoomManager } from './RoomManager.js';

export class PreGameLobby {
  /**
   * @param {Object} options
   * @param {Function} options.onLaunchMatch Called with { loadout, roomConfig }
   */
  constructor({ onLaunchMatch } = {}) {
    this.onLaunchMatch = onLaunchMatch;
    this.isOpen = true;

    // Default player loadout state
    this.loadout = {
      nickname: 'Sir Flops-a-Lot',
      baseColor: CONFIG.CONTENDER_PALETTE[0].hex,
      figurineId: 'tin_colander',
      patternId: 'messy_splatter',
      borderEffectId: 'bubbly_foam'
    };

    // Default room state
    this.roomConfig = {
      mode: 'QUICK_PLAY', // 'QUICK_PLAY' | 'CREATE_PRIVATE' | 'JOIN_KEY'
      roomKey: 'PUBLIC_MAIN',
      generatedPrivateKey: RoomManager.generateRoomKey(),
      joinKeyInput: '',
      fillWithBots: true
    };

    this._injectLobbyDOM();
    this._init3DPreviewStage();
    this._bindLobbyEvents();
  }

  _injectLobbyDOM() {
    this.backdrop = document.createElement('div');
    this.backdrop.id = 'pregame-lobby-backdrop';
    this.backdrop.className = 'lobby-backdrop';

    const colorSwatchesHTML = CONFIG.CONTENDER_PALETTE.map((c, idx) => `
      <button
        type="button"
        class="color-swatch-btn ${idx === 0 ? 'active' : ''}"
        data-color="${c.hex}"
        title="${c.name}"
        style="background: ${c.hex}; --swatch-color: ${c.hex}"
      ></button>
    `).join('');

    const figurinesHTML = CONFIG.FIGURINES.map((f) => `
      <button
        type="button"
        class="customizer-card-btn figurine-btn ${f.id === this.loadout.figurineId ? 'active' : ''}"
        data-figurine="${f.id}"
      >
        <span class="card-icon">${f.icon}</span>
        <div class="card-meta">
          <strong>${f.name}</strong>
          <small>${f.desc}</small>
        </div>
      </button>
    `).join('');

    const patternsHTML = CONFIG.PATTERNS.map((p) => `
      <button
        type="button"
        class="customizer-chip-btn pattern-btn ${p.id === this.loadout.patternId ? 'active' : ''}"
        data-pattern="${p.id}"
        title="${p.desc}"
      >
        <span>${p.icon}</span>
        <span>${p.name}</span>
      </button>
    `).join('');

    const bordersHTML = CONFIG.BORDER_EFFECTS.map((b) => `
      <button
        type="button"
        class="customizer-chip-btn border-btn ${b.id === this.loadout.borderEffectId ? 'active' : ''}"
        data-border="${b.id}"
        title="${b.desc}"
      >
        <span>${b.icon}</span>
        <span>${b.name}</span>
      </button>
    `).join('');

    this.backdrop.innerHTML = `
      <div class="lobby-modal-shell">
        <!-- Left Column: Live 3D Derpy Octopus Preview + Identity + Room Key Matchmaking -->
        <div class="lobby-left-col">
          <div class="lobby-header-brand">
            <span class="lobby-badge-octo">🐙</span>
            <div>
              <h2>APUS<span>.IO</span> LOBBY</h2>
              <p>Derpy Spherical Octopus Turf Wars</p>
            </div>
          </div>

          <!-- 3D Rotating Preview Canvas -->
          <div class="lobby-preview-box">
            <canvas id="lobby-3d-preview-canvas" width="320" height="230"></canvas>
            <div class="preview-caption">
              <span id="preview-loadout-tag">🥣 Tin Colander • 🎨 Messy Splatter</span>
            </div>
          </div>

          <!-- Player Nickname Input + Random Derpy Name Button -->
          <div class="lobby-field-group">
            <label for="lobby-nickname-input">OCTOPUS NICKNAME</label>
            <div class="nickname-input-row">
              <input
                type="text"
                id="lobby-nickname-input"
                maxlength="16"
                value="${this.loadout.nickname}"
                placeholder="Enter nickname..."
                autocomplete="off"
              />
              <button type="button" class="dice-name-btn" id="lobby-random-name-btn" title="Random Derpy Name">
                🎲 Random Derpy Name
              </button>
            </div>
          </div>

          <!-- Multiplayer Modes & Room Keys -->
          <div class="lobby-field-group">
            <label>MULTIPLAYER MODE & ROOM KEY</label>
            <div class="room-mode-tabs">
              <button type="button" class="room-tab-btn active" data-mode="QUICK_PLAY">
                🌊 Quick Play
              </button>
              <button type="button" class="room-tab-btn" data-mode="CREATE_PRIVATE">
                🔑 Create Private
              </button>
              <button type="button" class="room-tab-btn" data-mode="JOIN_KEY">
                🚪 Join by Key
              </button>
            </div>

            <!-- Mode Panel 1: Quick Play -->
            <div class="room-mode-pane" id="pane-QUICK_PLAY">
              <div class="room-info-pill">
                <span>Public Matchmaking: <strong>PUBLIC_MAIN</strong></span>
                <span class="pill-sub">Fills up to ${CONFIG.MAX_PLAYERS} slots with AI Octo-Bots</span>
              </div>
            </div>

            <!-- Mode Panel 2: Create Private Lobby -->
            <div class="room-mode-pane hidden" id="pane-CREATE_PRIVATE">
              <div class="private-key-row">
                <div class="generated-key-box">
                  <span class="key-label">ROOM KEY</span>
                  <strong id="lobby-generated-key">${this.roomConfig.generatedPrivateKey}</strong>
                </div>
                <button type="button" class="copy-key-btn" id="lobby-copy-key-btn">📋 Copy Key</button>
                <button type="button" class="regen-key-btn" id="lobby-regen-key-btn" title="New Key">🔄</button>
              </div>
              <label class="bot-fill-toggle">
                <input type="checkbox" id="lobby-fill-bots-checkbox" checked />
                <span>Fill empty slots with AI Bots (<code>FILL_WITH_BOTS = true</code>)</span>
              </label>
            </div>

            <!-- Mode Panel 3: Join by Room Key -->
            <div class="room-mode-pane hidden" id="pane-JOIN_KEY">
              <div class="join-key-row">
                <input
                  type="text"
                  id="lobby-join-key-input"
                  maxlength="7"
                  placeholder="Enter 6-char Key (e.g. DERP42)"
                  autocomplete="off"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Right Column: 4-Part Visual Customizer + Launch Button -->
        <div class="lobby-right-col">
          <div class="customizer-scroll-area">
            <!-- 1. Paint Fill Color (12 Colors) -->
            <div class="customizer-section">
              <div class="sec-title-row">
                <h3>1. Paint Fill Color</h3>
                <span class="sec-hint">12 Vibrant & Pastel Shades</span>
              </div>
              <div class="color-swatches-grid" id="lobby-colors-grid">
                ${colorSwatchesHTML}
              </div>
            </div>

            <!-- 2. Goofy Figurines / Headgear (6 Styles) -->
            <div class="customizer-section">
              <div class="sec-title-row">
                <h3>2. Goofy Headgear Figurine</h3>
                <span class="sec-hint">6 Clumsy Hats</span>
              </div>
              <div class="figurines-grid" id="lobby-figurines-grid">
                ${figurinesHTML}
              </div>
            </div>

            <!-- 3. Surface Paint Pattern (6 Triplanar Shader Patterns) -->
            <div class="customizer-section">
              <div class="sec-title-row">
                <h3>3. Surface Paint Pattern</h3>
                <span class="sec-hint">Spherical Triplanar GLSL</span>
              </div>
              <div class="chips-grid" id="lobby-patterns-grid">
                ${patternsHTML}
              </div>
            </div>

            <!-- 4. Territory Border Effect (4 Perimeter Shaders) -->
            <div class="customizer-section">
              <div class="sec-title-row">
                <h3>4. Territory Border Effect</h3>
                <span class="sec-hint">Dynamic Perimeter Rim</span>
              </div>
              <div class="chips-grid" id="lobby-borders-grid">
                ${bordersHTML}
              </div>
            </div>
          </div>

          <!-- Launch Action Footer -->
          <div class="lobby-footer-actions">
            <button type="button" class="lobby-launch-btn" id="lobby-launch-btn">
              🚀 Dive Into Ocean Arena!
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.backdrop);
  }

  /**
   * Sets up a live 3D rotating preview of the player's DerpyOctopusAvatar flailing its
   * tentacles over a sample spherical patch of their customized territory paint!
   */
  _init3DPreviewStage() {
    this.previewCanvas = document.getElementById('lobby-3d-preview-canvas');
    this.previewScene = new THREE.Scene();

    this.previewCamera = new THREE.PerspectiveCamera(36, 320 / 230, 0.5, 100);
    this.previewCamera.position.set(0, 4.4, 8.8);
    this.previewCamera.lookAt(0, 1.4, 0);

    this.previewRenderer = new THREE.WebGLRenderer({
      canvas: this.previewCanvas,
      antialias: true,
      alpha: true
    });
    this.previewRenderer.setSize(320, 230);
    this.previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const hemi = new THREE.HemisphereLight(0xfff6dd, 0x0a3d62, 1.35);
    const dirLight = new THREE.DirectionalLight(0xfff0c4, 1.7);
    dirLight.position.set(5, 9, 6);
    this.previewScene.add(hemi, dirLight);

    // Sample curved territory mat patch underneath the preview octopus
    const patchRadius = 24;
    const patchGeo = new THREE.SphereGeometry(patchRadius, 32, 24, 0, Math.PI * 2, 0, 0.16);
    const nonIndexedPatch = patchGeo.index ? patchGeo.toNonIndexed() : patchGeo;
    nonIndexedPatch.translate(0, -patchRadius + 0.15, 0);

    this.previewPatchVertexCount = nonIndexedPatch.attributes.position.count;
    this.patchColorArr = new Float32Array(this.previewPatchVertexCount * 3);
    this.patchAlphaArr = new Float32Array(this.previewPatchVertexCount).fill(1.0);
    this.patchBorderArr = new Float32Array(this.previewPatchVertexCount);
    this.patchPatternArr = new Float32Array(this.previewPatchVertexCount);
    this.patchBorderTypeArr = new Float32Array(this.previewPatchVertexCount);

    // Mark outer ring vertices of the sample patch as border so the player sees their border effect live!
    const posAttr = nonIndexedPatch.attributes.position;
    for (let v = 0; v < this.previewPatchVertexCount; v++) {
      const vx = posAttr.getX(v);
      const vz = posAttr.getZ(v);
      const r = Math.hypot(vx, vz);
      this.patchBorderArr[v] = r > 3.15 ? 1.0 : 0.0;
    }

    nonIndexedPatch.setAttribute('aColor', new THREE.BufferAttribute(this.patchColorArr, 3));
    nonIndexedPatch.setAttribute('aAlpha', new THREE.BufferAttribute(this.patchAlphaArr, 1));
    nonIndexedPatch.setAttribute('aBorder', new THREE.BufferAttribute(this.patchBorderArr, 1));
    nonIndexedPatch.setAttribute('aPattern', new THREE.BufferAttribute(this.patchPatternArr, 1));
    nonIndexedPatch.setAttribute('aBorderType', new THREE.BufferAttribute(this.patchBorderTypeArr, 1));

    this.previewPatchGeo = nonIndexedPatch;
    this.previewPatchMat = createTerritoryMaterial(new THREE.Vector3(0.5, 0.8, 0.4).normalize());
    this.previewPatchMesh = new THREE.Mesh(this.previewPatchGeo, this.previewPatchMat);
    this.previewScene.add(this.previewPatchMesh);

    // Instantiate the preview DerpyOctopusAvatar
    this.previewOctopus = new DerpyOctopusAvatar({
      baseColor: this.loadout.baseColor,
      figurineId: this.loadout.figurineId,
      seed: 7
    });
    this.previewOctopus.root.position.set(0, 0.2, 0);
    this.previewScene.add(this.previewOctopus.root);

    this._syncPreviewPatchAttributes();
  }

  _syncPreviewPatchAttributes() {
    const col = new THREE.Color(this.loadout.baseColor);
    const patIdx = getPatternIndex(this.loadout.patternId);
    const brdIdx = getBorderEffectIndex(this.loadout.borderEffectId);

    for (let v = 0; v < this.previewPatchVertexCount; v++) {
      this.patchColorArr[v * 3]     = col.r;
      this.patchColorArr[v * 3 + 1] = col.g;
      this.patchColorArr[v * 3 + 2] = col.b;
      this.patchPatternArr[v] = patIdx;
      this.patchBorderTypeArr[v] = brdIdx;
    }

    this.previewPatchGeo.attributes.aColor.needsUpdate = true;
    this.previewPatchGeo.attributes.aPattern.needsUpdate = true;
    this.previewPatchGeo.attributes.aBorderType.needsUpdate = true;

    const figObj = CONFIG.FIGURINES.find(f => f.id === this.loadout.figurineId) || CONFIG.FIGURINES[0];
    const patObj = CONFIG.PATTERNS.find(p => p.id === this.loadout.patternId) || CONFIG.PATTERNS[0];
    const brdObj = CONFIG.BORDER_EFFECTS.find(b => b.id === this.loadout.borderEffectId) || CONFIG.BORDER_EFFECTS[0];
    const tagEl = document.getElementById('preview-loadout-tag');
    if (tagEl) {
      tagEl.textContent = `${figObj.icon} ${figObj.name} • ${patObj.icon} ${patObj.name} • ${brdObj.icon} ${brdObj.name}`;
    }
  }

  _bindLobbyEvents() {
    const nickInput = document.getElementById('lobby-nickname-input');
    const randomNameBtn = document.getElementById('lobby-random-name-btn');

    nickInput.addEventListener('input', (e) => {
      this.loadout.nickname = e.target.value.slice(0, 16);
    });

    randomNameBtn.addEventListener('click', () => {
      const pool = CONFIG.DERPY_NICKNAMES;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      this.loadout.nickname = pick;
      nickInput.value = pick;
      this.previewOctopus.triggerSquashImpulse(0.45);
    });

    // Room Mode Tabs
    const tabBtns = this.backdrop.querySelectorAll('.room-tab-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.getAttribute('data-mode');
        this.roomConfig.mode = mode;

        ['QUICK_PLAY', 'CREATE_PRIVATE', 'JOIN_KEY'].forEach((m) => {
          const pane = document.getElementById(`pane-${m}`);
          if (pane) pane.classList.toggle('hidden', m !== mode);
        });
      });
    });

    // Copy & Regenerate Private Room Key
    const copyBtn = document.getElementById('lobby-copy-key-btn');
    const regenBtn = document.getElementById('lobby-regen-key-btn');
    const keyDisplay = document.getElementById('lobby-generated-key');

    copyBtn.addEventListener('click', () => {
      navigator.clipboard?.writeText(this.roomConfig.generatedPrivateKey).catch(() => {});
      copyBtn.textContent = '✅ Copied!';
      setTimeout(() => { copyBtn.textContent = '📋 Copy Key'; }, 1600);
    });

    regenBtn.addEventListener('click', () => {
      this.roomConfig.generatedPrivateKey = RoomManager.generateRoomKey();
      keyDisplay.textContent = this.roomConfig.generatedPrivateKey;
    });

    const fillBotsCheckbox = document.getElementById('lobby-fill-bots-checkbox');
    fillBotsCheckbox.addEventListener('change', (e) => {
      this.roomConfig.fillWithBots = e.target.checked;
    });

    const joinKeyInput = document.getElementById('lobby-join-key-input');
    joinKeyInput.addEventListener('input', (e) => {
      this.roomConfig.joinKeyInput = e.target.value.toUpperCase();
    });

    // 1. Color Swatches
    const colorBtns = this.backdrop.querySelectorAll('.color-swatch-btn');
    colorBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        colorBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.loadout.baseColor = btn.getAttribute('data-color');
        this.previewOctopus.setColor(this.loadout.baseColor);
        this.previewOctopus.triggerSquashImpulse(0.35);
        this._syncPreviewPatchAttributes();
      });
    });

    // 2. Goofy Figurines
    const figBtns = this.backdrop.querySelectorAll('.figurine-btn');
    figBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        figBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.loadout.figurineId = btn.getAttribute('data-figurine');
        this.previewOctopus.setFigurine(this.loadout.figurineId);
        this.previewOctopus.triggerSquashImpulse(0.5);
        this._syncPreviewPatchAttributes();
      });
    });

    // 3. Surface Paint Patterns
    const patBtns = this.backdrop.querySelectorAll('.pattern-btn');
    patBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        patBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.loadout.patternId = btn.getAttribute('data-pattern');
        this._syncPreviewPatchAttributes();
      });
    });

    // 4. Territory Border Effects
    const brdBtns = this.backdrop.querySelectorAll('.border-btn');
    brdBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        brdBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.loadout.borderEffectId = btn.getAttribute('data-border');
        this._syncPreviewPatchAttributes();
      });
    });

    // Launch Match Button
    const launchBtn = document.getElementById('lobby-launch-btn');
    launchBtn.addEventListener('click', () => {
      this.launch();
    });
  }

  open() {
    this.isOpen = true;
    this.backdrop.classList.remove('hidden');
  }

  close() {
    this.isOpen = false;
    this.backdrop.classList.add('hidden');
  }

  launch() {
    const nickInput = document.getElementById('lobby-nickname-input');
    const cleanNick = (nickInput?.value || '').trim().slice(0, 16) || 'Sir Flops-a-Lot';
    this.loadout.nickname = cleanNick;

    let activeRoomKey = 'PUBLIC_MAIN';
    let fillWithBots = true;

    if (this.roomConfig.mode === 'CREATE_PRIVATE') {
      activeRoomKey = this.roomConfig.generatedPrivateKey;
      fillWithBots = this.roomConfig.fillWithBots;
    } else if (this.roomConfig.mode === 'JOIN_KEY') {
      activeRoomKey = RoomManager.sanitizeRoomKey(this.roomConfig.joinKeyInput || this.roomConfig.generatedPrivateKey);
      fillWithBots = true;
    }

    this.close();

    if (this.onLaunchMatch) {
      this.onLaunchMatch({
        loadout: { ...this.loadout },
        roomConfig: {
          mode: this.roomConfig.mode,
          roomKey: activeRoomKey,
          fillWithBots
        }
      });
    }
  }

  /**
   * Renders the rotating 3D DerpyOctopusAvatar preview while the lobby modal is open.
   */
  updatePreview(dt, elapsedTime) {
    if (!this.isOpen) return;

    this.previewPatchMat.uniforms.uTime.value = elapsedTime;
    this.previewOctopus.root.rotation.y = Math.sin(elapsedTime * 0.95) * 0.65;

    // Simulate lively steering & flailing tentacles in the preview window
    this.previewOctopus.update(dt, elapsedTime, {
      turnRate: Math.cos(elapsedTime * 2.2) * 1.65,
      speedRatio: 1.2,
      isBoost: Math.sin(elapsedTime * 1.5) > 0.55,
      isStunned: false
    });

    this.previewRenderer.render(this.previewScene, this.previewCamera);
  }
}

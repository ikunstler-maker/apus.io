// ============================================================================
// APUS.IO — MAIN GAME ORCHESTRATOR, SUNNY CLAYMORPHISM & LOBBY INTEGRATION
// ============================================================================
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import { CONFIG } from './Config.js';
import { TerritoryGrid } from './TerritoryGrid.js';
import { SphereWorld } from './SphereWorld.js';
import { PlayerController } from './PlayerController.js';
import { BotContender } from './BotAI.js';
import { HazardsAndBonuses } from './HazardsAndBonuses.js';
import { HUD } from './HUD.js';
import { RoomManager } from './RoomManager.js';
import { PreGameLobby } from './PreGameLobby.js';

class ApusGame {
  constructor() {
    this.container = document.getElementById('game-canvas-container');
    this.clock = new THREE.Clock();
    this.elapsedTime = 0;
    this.broadcastAccumulator = 0;

    this._initRendererAndScene();
    this._initModules();
    this._spawnAllContenders(true);
    this._bindResize();

    // Expose game instance for debugging/inspection
    window.apusGame = this;

    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);
  }

  _initRendererAndScene() {
    this.scene = new THREE.Scene();

    // Deep Sunny Horizon Backdrop & ZERO Pale Fog (Warm golden rim handled by atmosphere shader at back edge)
    this.scene.background = new THREE.Color('#094a6e');
    this.scene.fog = null;

    this.camera = new THREE.PerspectiveCamera(
      CONFIG.CAMERA_FOV,
      window.innerWidth / window.innerHeight,
      2,
      650
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // Studio Environment Lighting (RoomEnvironment) for rich clay specular reflections
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

    this.container.appendChild(this.renderer.domElement);

    // Post-Processing (EffectComposer + subtle UnrealBloomPass for 2.2x neon territory tube borders)
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.12,
      0.38,
      0.88
    );
    this.composer.addPass(this.bloomPass);
  }

  _initModules() {
    const sunDir = new THREE.Vector3(0.58, 0.72, 0.38).normalize();

    // 1. Spherical Geodesic Grid & Flood-Fill Engine
    this.territoryGrid = new TerritoryGrid(this.scene, sunDir);

    // 2. Spherical Ocean World, Crepuscular Sunbeams & Smooth Clay Islands
    this.sphereWorld = new SphereWorld(this.scene, this.territoryGrid);

    // 3. Local Player Controller (1.8x DerpyOctopusAvatar)
    this.player = new PlayerController(
      this.scene,
      this.territoryGrid,
      this.sphereWorld,
      this.camera,
      this.renderer.domElement
    );

    this.player.onGhostEmoteCallback = () => {
      this.hazardsAndBonuses.spawnShockwaveRing(this.player.normal, 0x70f3ff, 12.0, 0.65);
      this.hud.playSound('boo');
      this.hud.showToast('👻 BOO!! You did a spooky Ghost-Spin!', '#70f3ff');
      this.roomManager.broadcastGhostEmote(this.player);
    };

    // 4. Autonomous AI Bot Contenders (up to 9 bots to fill MAX_PLAYERS = 10)
    this.bots = [];
    for (let i = 1; i <= CONFIG.BOT_COUNT; i++) {
      const bot = new BotContender(i, this.scene, this.territoryGrid, this.sphereWorld);
      this.bots.push(bot);
    }

    this.activeBots = [...this.bots];
    this.allContenders = [this.player, ...this.activeBots];

    // 5. Dynamic Hazards (Whirlpools, Patrolling Sharks) & Power-Up Buoys
    this.hazardsAndBonuses = new HazardsAndBonuses(
      this.scene,
      this.sphereWorld,
      this.territoryGrid
    );

    // 6. Real-Time Nickname Leaderboard, Emergency Reset/Unstuck [R], Obstacles Toggle, Ghost Realm Banner & Nameplates HUD
    this.hud = new HUD(
      this.player,
      this.territoryGrid,
      this.sphereWorld,
      this.hazardsAndBonuses,
      {
        onRespawnRequest: () => this.respawnPlayer(),
        onResetUnstuckRequest: () => this.resetUnstuckPlayer(),
        onOpenCustomizeRequest: () => this.lobby.open(),
        onResetMatchRequest: () => this.resetMatch(),
        onObstacleModeChange: (modeId) => this.setObstacleMode(modeId, true)
      }
    );

    // 7. Multiplayer Room Key Manager (WebSocket + BroadcastChannel + AI Bot fallback)
    this.roomManager = new RoomManager({
      onRoomJoined: ({ roomKey }) => {
        this.hud.setRoomKey(roomKey);
      },
      onRoomSettingsUpdate: (matchSettings) => {
        this._applyMatchSettings(matchSettings, false);
      },
      onPeerStateUpdate: (peerId, payload) => {
        this._syncRemotePeerIntoSlot(peerId, payload);
      },
      onPeerGhostEmote: (peerId, nickname) => {
        if (this.player.state === 'GHOST') {
          this.hud.showToast(`👻 Ghost ${nickname || 'Octo'} says BOO!`, '#c77dff');
        }
      }
    });

    // 8. Pre-Game Lobby with Live 3D Derpy Octopus Preview, Match Settings & 4-Part Customizer
    this.lobby = new PreGameLobby({
      onLaunchMatch: ({ loadout, roomConfig, matchSettings }) => {
        this._applyLobbyLaunch(loadout, roomConfig, matchSettings);
      },
      onObstacleModeChange: (modeId) => {
        this.setObstacleMode(modeId, false);
      }
    });
  }

  /**
   * Dynamically switches or disables static obstacles on the sphere ('none' | 'low' | 'normal' | 'dense')
   * in real time without crashing the current match.
   */
  setObstacleMode(modeId, showToast = true) {
    const validMode = CONFIG.OBSTACLE_DENSITY_PRESETS?.[modeId] ? modeId : 'normal';
    const preset = CONFIG.OBSTACLE_DENSITY_PRESETS[validMode];
    const changed = this.sphereWorld.obstacleMode !== validMode;

    if (changed) {
      this.sphereWorld.setObstacleMode(validMode, this.allContenders);
    }
    this.hud?.syncObstacleModeUI(validMode);
    this.lobby?.syncObstacleModeUI(validMode);

    if (showToast && this.hud) {
      this.hud.showToast(`${preset.icon} Obstacles Mode: ${preset.label}`, '#ffd175');
    }
  }

  /**
   * Applies Match & Hazard Settings (`gameSpeed`, `difficulty`, `obstacleMode`, `sharkCount`, `sharkSpeed`).
   */
  _applyMatchSettings(matchSettings = {}, showNotification = false) {
    if (!matchSettings) return;
    if (matchSettings.gameSpeed !== undefined) {
      CONFIG.GAME_SPEED_MULTIPLIER = THREE.MathUtils.clamp(Number(matchSettings.gameSpeed) || 1.0, 0.5, 2.0);
    }
    if (matchSettings.difficulty && CONFIG.DIFFICULTY_PRESETS[matchSettings.difficulty]) {
      CONFIG.DIFFICULTY = matchSettings.difficulty;
    }
    if (matchSettings.obstacleMode && CONFIG.OBSTACLE_DENSITY_PRESETS?.[matchSettings.obstacleMode]) {
      this.setObstacleMode(matchSettings.obstacleMode, false);
    }
    const sharkCount = matchSettings.sharkCount !== undefined ? Number(matchSettings.sharkCount) : CONFIG.SHARK_COUNT;
    const sharkSpeed = matchSettings.sharkSpeed !== undefined ? Number(matchSettings.sharkSpeed) : CONFIG.SHARK_SPEED_MULTIPLIER;

    this.hazardsAndBonuses.syncSharkSettings(sharkCount, sharkSpeed);

    if (showNotification) {
      const diffObj = CONFIG.DIFFICULTY_PRESETS[CONFIG.DIFFICULTY] || CONFIG.DIFFICULTY_PRESETS.normal;
      const obsObj = CONFIG.OBSTACLE_DENSITY_PRESETS[CONFIG.OBSTACLE_MODE] || CONFIG.OBSTACLE_DENSITY_PRESETS.normal;
      this.hud.showToast(
        `⚙️ ${CONFIG.GAME_SPEED_MULTIPLIER.toFixed(1)}x • ${diffObj.label} • ${obsObj.icon} ${obsObj.label} • 🦈 ${CONFIG.SHARK_COUNT}`,
        '#ffd175'
      );
    }
  }

  /**
   * Maps incoming cross-tab / WebSocket peer packets onto a contender slot so multi-tab
   * rooms (`PUBLIC_MAIN` or 6-char private keys) sync seamlessly.
   */
  _syncRemotePeerIntoSlot(peerId, payload) {
    if (!this.peerSlotMap) {
      this.peerSlotMap = new Map();
    }
    let botSlot = this.peerSlotMap.get(peerId);
    if (!botSlot && this.bots.length > 0) {
      botSlot = this.bots[this.bots.length - 1 - (this.peerSlotMap.size % this.bots.length)];
      this.peerSlotMap.set(peerId, botSlot);
      botSlot.isRemotePeer = true;
    }
    if (!botSlot) return;

    botSlot.applyLoadout({
      nickname: payload.nickname,
      baseColor: payload.colorHex,
      figurineId: payload.figurineId,
      patternId: payload.patternId,
      borderEffectId: payload.borderEffectId
    }, false);

    if (Array.isArray(payload.normal)) {
      botSlot.normal.set(payload.normal[0], payload.normal[1], payload.normal[2]).normalize();
      botSlot.position.copy(botSlot.normal).multiplyScalar(this.sphereWorld.radius);
    }
    if (Array.isArray(payload.heading)) {
      botSlot.heading.set(payload.heading[0], payload.heading[1], payload.heading[2]).normalize();
    }
    botSlot.turnInput = payload.turnInput || 0;
    if (payload.state === 'GHOST' && botSlot.state !== 'GHOST') {
      botSlot.enterGhostState();
    } else if (payload.state === 'ALIVE' && botSlot.state === 'GHOST') {
      botSlot.spawn(botSlot.normal);
    }
  }

  /**
   * Called when the player clicks "Dive Into Ocean Arena!" inside the Pre-Game Lobby.
   */
  _applyLobbyLaunch(loadout, roomConfig, matchSettings) {
    this._applyMatchSettings(matchSettings, true);
    this.player.applyLoadout(loadout, true);
    this.roomManager.joinRoom({ ...roomConfig, matchSettings });

    // Configure whether AI bots fill empty room slots (FILL_WITH_BOTS = true/false)
    if (roomConfig.fillWithBots) {
      this.activeBots = [...this.bots];
      for (const b of this.bots) {
        b.mesh.visible = true;
        b.wakePoints.visible = true;
      }
    } else {
      for (const b of this.bots) {
        this.territoryGrid.clearContenderTerritory(b.id);
        b.clearTrail();
        b.mesh.visible = false;
        b.wakePoints.visible = false;
      }
      this.activeBots = [];
    }

    this.allContenders = [this.player, ...this.activeBots];

    // Respawn player into the arena with their newly customized loadout
    this.respawnPlayer();
    this.hud.showToast(
      `🐙 Joined Room [${this.roomManager.roomKey}] as ${this.player.name}!`,
      this.player.colorHex
    );
  }

  /**
   * Finds a random safe ocean coordinate far away from static obstacles, other contenders, AND patrolling sharks.
   */
  findSafeOceanCoordinateAwayFromHazards(minObstacleMargin = 16.5, minSharkMargin = 22.0) {
    const r = CONFIG.SPHERE_RADIUS;
    for (let attempt = 0; attempt < 90; attempt++) {
      const candidate = this.sphereWorld.findSafeSpawnNormal(this.allContenders, minObstacleMargin, 24.0);
      let sharkClear = true;
      if (this.hazardsAndBonuses && this.hazardsAndBonuses.sharks) {
        for (let s = 0; s < this.hazardsAndBonuses.sharks.length; s++) {
          const shark = this.hazardsAndBonuses.sharks[s];
          if (candidate.angleTo(shark.normal) * r < minSharkMargin) {
            sharkClear = false;
            break;
          }
        }
      }
      if (sharkClear) return candidate;
    }
    return this.sphereWorld.findSafeSpawnNormal(this.allContenders, 14.0, 18.0);
  }

  _spawnAllContenders(keepOneBotHaunting = false) {
    const playerStartNormal = this.findSafeOceanCoordinateAwayFromHazards(16.0, 20.0);
    this.player.spawn(playerStartNormal);

    for (let i = 0; i < this.activeBots.length; i++) {
      const bot = this.activeBots[i];
      const safeNormal = this.sphereWorld.findSafeSpawnNormal(this.allContenders, 15.0, 26.0);
      bot.spawn(safeNormal);

      if (keepOneBotHaunting && i === this.activeBots.length - 1) {
        this.territoryGrid.clearContenderTerritory(bot.id);
        bot.normal.set(0.18, 0.22, 0.95).normalize();
        bot.position.copy(bot.normal).multiplyScalar(CONFIG.SPHERE_RADIUS);
        bot.enterGhostState();
        bot.respawnDelayTimer = 14.0;
      }
    }
  }

  respawnPlayer() {
    this.territoryGrid.clearContenderTerritory(this.player.id);
    const safeNormal = this.findSafeOceanCoordinateAwayFromHazards(16.5, 24.0);
    this.player.spawn(safeNormal);
    this.hud.hideGhostBanner();
    this.hud.showToast('⚡ Respawned into the sunny ocean!', this.player.colorHex);
    this.hud.playSound('powerup');
  }

  /**
   * Emergency "🔄 Reset / Unstuck [R]" action:
   * Immediately resets the player's current run, clears their old territory/trail,
   * and respawns them fresh at a brand-new random safe ocean coordinate (far away from
   * obstacles and sharks) with a full new starter territory island!
   */
  resetUnstuckPlayer() {
    this.player.clearTrail();
    this.territoryGrid.clearContenderTerritory(this.player.id);
    const safeNormal = this.findSafeOceanCoordinateAwayFromHazards(17.5, 26.0);
    this.player.spawn(safeNormal);
    this.hazardsAndBonuses.spawnShockwaveRing(this.player.normal, this.player.color.getHex(), 14.0, 0.65);
    this.hud.hideGhostBanner();
    this.hud.showToast('🔄 Reset / Unstuck! Fresh starter island created!', this.player.colorHex);
    this.hud.playSound('powerup');
  }

  resetMatch() {
    for (let i = 0; i < this.allContenders.length; i++) {
      const c = this.allContenders[i];
      this.territoryGrid.clearContenderTerritory(c.id);
      c.kills = 0;
    }
    this._spawnAllContenders(true);
    this.hud.showToast('🌊 New Spherical Match Started!', '#00f5d4');
  }

  _handleLoopClosed(contender, capturedCells, anchorFrom = null, anchorTo = null) {
    if (capturedCells <= 0) return;
    this.hazardsAndBonuses.spawnShockwaveRing(contender.normal, contender.color.getHex(), 11.0, 0.6);

    if (contender.isPlayer) {
      const pctGain = (capturedCells / this.territoryGrid.navigableCellCount) * 100;
      if (anchorFrom && anchorTo) {
        this.hud.showToast(`⚓ Snap Anchor Closed! +${pctGain.toFixed(1)}% Territory`, '#4dff91');
      } else if (pctGain >= 0.8) {
        this.hud.showToast(`🌊 Loop Captured! +${pctGain.toFixed(1)}% Domain`, contender.colorHex);
      }
      this.hud.playSound('capture');
    }
  }

  /**
   * THE "GHOST REALM" ELIMINATION LIFECYCLE:
   * Triggered ONLY when an opponent contender severs an active trail (or self-collision if enabled).
   * Never triggered by obstacles or shark bites!
   */
  eliminateContender(victim, killer = null, reason = 'Active trail severed!') {
    if (victim.state === 'GHOST') return;

    // 1. Wipe victim's territory back to neutral water
    this.territoryGrid.clearContenderTerritory(victim.id);

    // 2. Play comical Splat/Poof ink cloud + shockwave ring
    this.hazardsAndBonuses.spawnSplatPoofFX(victim.normal, victim.color.getHex());
    this.hazardsAndBonuses.spawnShockwaveRing(victim.normal, 0x70f3ff, 18.0, 0.85);

    // 3. Transition immediately to Ghost Octopus at exact elimination coordinates!
    victim.enterGhostState();

    if (killer && killer !== victim) {
      killer.kills++;
      if (killer.isPlayer) {
        this.hud.showToast(`⚔️ Splat! Sent ${victim.name} to the Ghost Realm!`, killer.colorHex);
        this.hud.playSound('kill');
      }
    }

    if (victim.isPlayer) {
      this.hud.playSound('eliminated');
      this.hud.showGhostBanner(reason);
      this.hud.showToast('👻 Splat! You are now a Ghost Octopus! Fellow Ghosts are revealed!', '#70f3ff');
      this._ensureGhostCompanionNearPlayer();
    } else {
      victim.respawnDelayTimer = 8.5;
    }
  }

  _ensureGhostCompanionNearPlayer() {
    if (this.activeBots.length === 0) return;
    const anyBotGhost = this.activeBots.some(b => b.state === 'GHOST');
    if (!anyBotGhost) {
      const companion = this.activeBots[this.activeBots.length - 1];
      this.territoryGrid.clearContenderTerritory(companion.id);
      const binormal = new THREE.Vector3().crossVectors(this.player.normal, this.player.heading).normalize();
      companion.normal.copy(this.player.normal).applyAxisAngle(binormal, 0.14).normalize();
      companion.position.copy(companion.normal).multiplyScalar(CONFIG.SPHERE_RADIUS);
      companion.enterGhostState();
      companion.respawnDelayTimer = 15.0;
    }
  }

  /**
   * Checks trail intersections across all LIVING contenders (`state === 'ALIVE'`).
   * Ghosts have zero collision and cannot cut or be cut.
   */
  _checkTrailIntersections() {
    const count = this.allContenders.length;

    for (let i = 0; i < count; i++) {
      const attacker = this.allContenders[i];
      if (attacker.state === 'GHOST') continue;

      // 1. Self-Trail Intersection (if ALLOW_SELF_CROSS is false)
      if (!CONFIG.ALLOW_SELF_CROSS && attacker.isOutside && attacker.spawnImmunityTimer <= 0) {
        const pts = attacker.trailPoints;
        const checkLimit = pts.length - 11;
        for (let p = 0; p < checkLimit; p++) {
          if (attacker.position.distanceTo(pts[p]) < CONFIG.TRAIL_HIT_RADIUS * 0.8) {
            this.eliminateContender(attacker, attacker, 'You tangled in your own active trail!');
            break;
          }
        }
        if (attacker.state === 'GHOST') continue;
      }

      // 2. Opponent Trail Intersection
      for (let j = 0; j < count; j++) {
        if (i === j) continue;
        const victim = this.allContenders[j];
        if (victim.state === 'GHOST' || !victim.isOutside || victim.spawnImmunityTimer > 0) continue;

        const pts = victim.trailPoints;
        const hitRadius = CONFIG.TRAIL_HIT_RADIUS + (victim.getCurrentTrailWidth() - CONFIG.NORMAL_TRAIL_WIDTH) * 0.25;

        let cut = false;
        for (let p = 0; p < pts.length; p++) {
          if (attacker.position.distanceTo(pts[p]) < hitRadius) {
            cut = true;
            break;
          }
        }

        if (!cut && attacker.position.distanceTo(victim.position) < 2.5) {
          cut = true;
        }

        if (cut) {
          const reason = `${attacker.name} severed ${victim.isPlayer ? 'your' : victim.name + "'s"} active tether!`;
          this.eliminateContender(victim, attacker, reason);
        }
      }
    }
  }

  _bindResize() {
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.composer.setSize(w, h);
    });
  }

  _animate() {
    requestAnimationFrame(this._animate);

    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsedTime += dt;

    // Update Pre-Game Lobby 3D Preview if open
    this.lobby.updatePreview(dt, this.elapsedTime);

    // 1. Update Local Player Input & Movement (works in both ALIVE and GHOST states!)
    this.player.updateInput();
    this.player.update(
      dt,
      this.elapsedTime,
      (c, cells) => this._handleLoopClosed(c, cells)
    );
    this.player.updateCamera(dt);

    // 2. Update AI Bot Contenders (both ALIVE bots and GHOST bots haunting the sphere!)
    for (let i = 0; i < this.activeBots.length; i++) {
      const bot = this.activeBots[i];

      if (bot.state === 'GHOST' && !bot.isRemotePeer) {
        bot.respawnDelayTimer -= dt;
        const ghostBotsCount = this.activeBots.filter(b => b.state === 'GHOST').length;
        const holdAsCompanion = this.player.state === 'GHOST' && ghostBotsCount <= 1;

        if (bot.respawnDelayTimer <= 0 && !holdAsCompanion) {
          const safeNormal = this.sphereWorld.findSafeSpawnNormal(this.allContenders, 15.0, 22.0);
          bot.spawn(safeNormal);
          continue;
        }
      }

      if (!bot.isRemotePeer) {
        bot.updateAI(dt, this.allContenders, this.hazardsAndBonuses);
      }
      bot.update(
        dt,
        this.elapsedTime,
        (c, cells) => this._handleLoopClosed(c, cells)
      );
    }

    // 3. Enforce Strict Asymmetric Visibility Rule (Living vs. Ghost Realm)
    const localPlayerIsGhost = this.player.state === 'GHOST';
    for (let i = 0; i < this.allContenders.length; i++) {
      const c = this.allContenders[i];
      c.syncVisibilityWithLocalPlayer(localPlayerIsGhost);

      // TERRITORY INTEGRITY FALLBACK (Anti-Softlock Guard):
      // Every tick for every ALIVE contender, if ownedCells.size === 0, stamp a fresh starter island!
      if (c.state === 'ALIVE' && c.ownedCells.size === 0) {
        this.territoryGrid.ensureContenderHasBase(c);
      }
    }

    // 4. Check Trail Severing & Eliminations among Living contenders
    this._checkTrailIntersections();

    // 5. Update Dynamic Hazards (Whirlpools, Patrolling Sharks) & Power-Up Buoys
    this.hazardsAndBonuses.update(dt, this.elapsedTime, this.allContenders, {
      onWhirlpoolTeleport: (contender) => {
        if (contender.isPlayer) {
          this.hud.showToast('🌀 Whirlpool Warp! Trail Dissolved + 1.5s Immunity', '#70f3ff');
          this.hud.playSound('whirlpool');
        }
      },
      onSharkBite: (contender) => {
        if (contender.isPlayer) {
          this.hud.showToast('🦈 Shark Snapped Active Trail! Snapped Back to Base (Territory Safe!)', '#ff4d6d');
          this.hud.playSound('shark');
        }
      },
      onPowerUpCollected: (contender, type, res) => {
        if (contender.isPlayer) {
          const cfg = CONFIG.POWERUPS[type];
          const extra = res && res.retracted ? ' (Loop Claimed!)' : '';
          this.hud.showToast(`${cfg.icon} ${cfg.name}: ${cfg.subtitle}${extra}`, cfg.hex);
          this.hud.playSound('powerup');
        }
      },
      onLoopClosed: (contender, cells, fromPos, toPos) => {
        this._handleLoopClosed(contender, cells, fromPos, toPos);
      }
    });

    // 6. Broadcast multiplayer state at ~15Hz
    this.broadcastAccumulator += dt;
    if (this.broadcastAccumulator >= 0.066) {
      this.broadcastAccumulator = 0;
      this.roomManager.broadcastPlayerState(this.player);
    }

    // 7. Update World Shaders & Territory Grid Wave Sync
    this.sphereWorld.update(this.elapsedTime, dt);
    this.territoryGrid.update(this.elapsedTime);

    // 8. Update HUD, Live Nickname Leaderboard, Floating Nameplates & 3D Globe Radar
    this.hud.update(this.allContenders, this.camera);

    // 9. Render Scene with Bloom Post-Processing
    this.composer.render();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new ApusGame();
});

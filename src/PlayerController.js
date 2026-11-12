// ============================================================================
// APUS.IO — DERPY OCTOPUS CONTENDER PHYSICS, GHOST REALM & PLAYER CONTROLLER
// ============================================================================
import * as THREE from 'three';
import { CONFIG } from './Config.js';
import { DerpyOctopusAvatar } from './DerpyOctopusAvatar.js';
import { createTrailRibbonMaterial } from './Shaders.js';

/**
 * Base class for both the Local Player and AI Bot / Remote Contenders.
 * Handles spherical geodesic movement, procedural 1.8x 3D DerpyOctopusAvatar,
 * wide glowing active trail ribbon, strict ownedCells vs activeTrailCells separation,
 * non-lethal tangential obstacle sliding, Ghost Realm gliding physics, and power-ups.
 */
export class Contender {
  /**
   * @param {number} id Contender index [0..11]
   * @param {THREE.Scene} scene
   * @param {import('./TerritoryGrid.js').TerritoryGrid} territoryGrid
   * @param {import('./SphereWorld.js').SphereWorld} sphereWorld
   * @param {boolean} isPlayer
   */
  constructor(id, scene, territoryGrid, sphereWorld, isPlayer = false) {
    this.id = id;
    this.scene = scene;
    this.territoryGrid = territoryGrid;
    this.sphereWorld = sphereWorld;
    this.isPlayer = isPlayer;
    this.radius = CONFIG.SPHERE_RADIUS;

    const palette = CONFIG.CONTENDER_PALETTE[id % CONFIG.CONTENDER_PALETTE.length];
    this.name = isPlayer ? 'Captain Flops' : CONFIG.DERPY_NICKNAMES[id % CONFIG.DERPY_NICKNAMES.length];
    this.colorHex = palette.hex;
    this.color = new THREE.Color(palette.color);
    this.emissiveColor = new THREE.Color(palette.emissive);

    // 4-Part Loadout Customization state
    this.figurineId = CONFIG.FIGURINES[id % CONFIG.FIGURINES.length].id;
    this.patternId = CONFIG.PATTERNS[id % CONFIG.PATTERNS.length].id;
    this.borderEffectId = CONFIG.BORDER_EFFECTS[id % CONFIG.BORDER_EFFECTS.length].id;

    // Strict State Separation: ownedCells Set vs activeTrailCells Set
    this.ownedCells = this.territoryGrid.getOwnedCellsSet(this.id);
    this.activeTrailCells = this.territoryGrid.getActiveTrailCellsSet(this.id);

    // Register initial style in TerritoryGrid
    this.territoryGrid.setContenderStyle(
      this.id,
      this.colorHex,
      this.patternId,
      this.borderEffectId,
      false
    );

    // Spherical kinematics: unit surface normal `normal` and tangent `heading`
    this.normal = new THREE.Vector3(0, 0, 1);
    this.heading = new THREE.Vector3(0, 1, 0);
    this.position = new THREE.Vector3(0, 0, this.radius);
    this.turnInput = 0; // [-1 = right, +1 = left] around outward surface normal
    this.currentTurnRate = 0;

    // Lifecycle & Ghost Realm states: 'ALIVE' | 'GHOST'
    this.state = 'ALIVE';
    this.isEliminated = false; // True when state === 'GHOST'
    this.isOutside = false;
    this.isDrawingTrail = false;
    this.spawnImmunityTimer = 0;
    this.stunTimer = 0;
    this.booEmoteTimer = 0;
    this.kills = 0;
    this.scorePercentage = 0;

    // Active Power-Up timers (seconds remaining)
    this.powerUps = {
      SPEED_BOOST: 0,
      SEMI_TRANSPARENCY: 0,
      INSTANT_ANCHOR: 0,
      BROAD_BRUSH: 0,
      SONAR_WAVE: 0
    };

    // Active Trail (Tether) state
    this.trailPoints = [];
    this.maxTrailSegments = 900;

    this._buildOctopusMesh();
    this._buildTrailRibbonMesh();
    this._buildWakeParticles();
  }

  /**
   * Applies a full customization loadout (`nickname`, `baseColor`, `figurineId`, `patternId`, `borderEffectId`).
   */
  applyLoadout({
    nickname,
    baseColor,
    figurineId,
    patternId,
    borderEffectId
  } = {}, syncGPU = true) {
    if (nickname && nickname.trim().length > 0) {
      this.name = nickname.trim().slice(0, 16);
    }
    if (baseColor) {
      this.colorHex = typeof baseColor === 'string'
        ? baseColor
        : '#' + new THREE.Color(baseColor).getHexString();
      this.color.set(this.colorHex);
      this.avatar.setColor(this.colorHex);
      if (this.trailMaterial.uniforms && this.trailMaterial.uniforms.uColor) {
        this.trailMaterial.uniforms.uColor.value.copy(this.color);
      }
    }
    if (figurineId) {
      this.figurineId = figurineId;
      this.avatar.setFigurine(figurineId);
    }
    if (patternId) {
      this.patternId = patternId;
    }
    if (borderEffectId) {
      this.borderEffectId = borderEffectId;
    }

    this.territoryGrid.setContenderStyle(
      this.id,
      this.colorHex,
      this.patternId,
      this.borderEffectId,
      syncGPU
    );
  }

  /**
   * Builds the procedural 1.8x 3D `DerpyOctopusAvatar` + status aura shield ring.
   */
  _buildOctopusMesh() {
    this.mesh = new THREE.Group();

    this.avatar = new DerpyOctopusAvatar({
      baseColor: this.colorHex,
      figurineId: this.figurineId,
      seed: this.id + 1
    });
    this.mesh.add(this.avatar.root);

    // Rich soft dark-teal drop shadow disc underneath the octopus on the water/sand surface (shadowOpacity = 0.45)
    const shadowGeo = new THREE.CircleGeometry(2.65, 28);
    shadowGeo.rotateX(-Math.PI / 2);
    this.shadowMat = new THREE.MeshBasicMaterial({
      color: 0x042438,
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    });
    this.shadowDisc = new THREE.Mesh(shadowGeo, this.shadowMat);
    this.shadowDisc.position.set(-0.35, -0.42, -0.25);
    this.mesh.add(this.shadowDisc);

    // Spawn immunity / status aura ring scaled for 1.8x octopus tentacles (non-additive to prevent glare)
    const shieldGeo = new THREE.RingGeometry(3.2, 3.75, 36);
    shieldGeo.rotateX(-Math.PI / 2);
    this.shieldMat = new THREE.MeshBasicMaterial({
      color: 0xa8f0ff,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      depthWrite: false
    });
    this.shieldRing = new THREE.Mesh(shieldGeo, this.shieldMat);
    this.shieldRing.position.y = 0.25;
    this.mesh.add(this.shieldRing);

    this.scene.add(this.mesh);
  }

  /**
   * Builds a dynamic 3.5x wider ribbon BufferGeometry with bright neon core for the active trail.
   */
  _buildTrailRibbonMesh() {
    const maxVerts = (this.maxTrailSegments + 2) * 2;
    const positions = new Float32Array(maxVerts * 3);
    const uvs = new Float32Array(maxVerts * 2);
    const indices = [];

    for (let i = 0; i < this.maxTrailSegments; i++) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }

    this.trailGeometry = new THREE.BufferGeometry();
    this.trailPosAttr = new THREE.BufferAttribute(positions, 3);
    this.trailPosAttr.setUsage(THREE.DynamicDrawUsage);
    this.trailUvAttr = new THREE.BufferAttribute(uvs, 2);
    this.trailUvAttr.setUsage(THREE.DynamicDrawUsage);

    this.trailGeometry.setAttribute('position', this.trailPosAttr);
    this.trailGeometry.setAttribute('uv', this.trailUvAttr);
    this.trailGeometry.setIndex(indices);
    this.trailGeometry.setDrawRange(0, 0);

    this.trailMaterial = createTrailRibbonMaterial(this.color);

    this.trailMesh = new THREE.Mesh(this.trailGeometry, this.trailMaterial);
    this.trailMesh.frustumCulled = false;
    this.trailMesh.renderOrder = 4;
    this.scene.add(this.trailMesh);
  }

  /**
   * Builds 3D spherical wake foam puffs behind the octopus (replacing 2D screen-space point sprites).
   */
  _buildWakeParticles() {
    this.wakeCount = 10;
    this.wakeAges = new Float32Array(this.wakeCount);
    this.wakeBubbles = [];
    this.wakePoints = new THREE.Group();

    const bubbleGeo = new THREE.SphereGeometry(0.32, 10, 10);
    this.wakeMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.02,
      transparent: true,
      opacity: 0.72
    });

    for (let i = 0; i < this.wakeCount; i++) {
      this.wakeAges[i] = i / this.wakeCount;
      const bubble = new THREE.Mesh(bubbleGeo, this.wakeMaterial);
      bubble.scale.setScalar(0.01);
      this.wakePoints.add(bubble);
      this.wakeBubbles.push(bubble);
    }

    this.scene.add(this.wakePoints);
  }

  /**
   * Spawns or respawns the contender as `'ALIVE'` at `spawnNormal` with a fresh circular starter zone.
   */
  spawn(spawnNormal) {
    this.normal.copy(spawnNormal).normalize();

    const ref = Math.abs(this.normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    this.heading.crossVectors(ref, this.normal).normalize();
    this.position.copy(this.normal).multiplyScalar(this.radius);

    this.state = 'ALIVE';
    this.isEliminated = false;
    this.isOutside = false;
    this.isDrawingTrail = false;
    this.turnInput = 0;
    this.currentTurnRate = 0;
    this.spawnImmunityTimer = CONFIG.SPAWN_IMMUNITY_DURATION;
    this.stunTimer = 0;
    this.booEmoteTimer = 0;

    for (const key of Object.keys(this.powerUps)) {
      this.powerUps[key] = 0;
    }

    this.avatar.setGhostMode(false);
    this.avatar.setCloakOpacity(1.0);
    this.avatar.triggerSquashImpulse(0.5);

    this.clearTrail();

    // Ensure style is registered and paint circular starter home zone
    this.territoryGrid.setContenderStyle(
      this.id,
      this.colorHex,
      this.patternId,
      this.borderEffectId,
      false
    );
    this.territoryGrid.claimDisk(this.normal, CONFIG.STARTER_ZONE_RADIUS, this.id, true);

    this.mesh.visible = true;
    this.wakePoints.visible = true;
    this._syncVesselTransform(0);
  }

  /**
   * Transitions the contender into the Ghost Realm (`state = 'GHOST'`) at their exact
   * elimination coordinates without kicking them from the sphere!
   */
  enterGhostState() {
    this.state = 'GHOST';
    this.isEliminated = true;
    this.isOutside = false;
    this.isDrawingTrail = false;
    this.spawnImmunityTimer = 0;
    this.stunTimer = 0;

    for (const key of Object.keys(this.powerUps)) {
      this.powerUps[key] = 0;
    }

    this.clearTrail();
    this.avatar.setGhostMode(true);
    this.avatar.triggerSquashImpulse(0.75);
    this.shieldMat.opacity = 0.0;
  }

  /**
   * Triggers a goofy Ghost-Spin / Boo! emote (visible only in the Ghost Realm).
   */
  triggerGhostEmote() {
    if (this.state !== 'GHOST') return false;
    this.booEmoteTimer = 1.3;
    this.avatar.triggerGhostBooEmote();
    return true;
  }

  /**
   * Enforces the Strict Asymmetric Visibility Rule between Living and Ghost realms:
   * - If Local Player is ALIVE: all Ghost entities are completely invisible (`visible = false`).
   * - If Local Player is GHOST: all Living AND all Ghost entities are visible (`visible = true`).
   */
  syncVisibilityWithLocalPlayer(localPlayerIsGhost) {
    if (this.state === 'GHOST') {
      const showGhost = Boolean(localPlayerIsGhost);
      this.mesh.visible = showGhost;
      this.wakePoints.visible = showGhost;
    } else {
      this.mesh.visible = true;
      this.wakePoints.visible = true;
    }
  }

  /**
   * Strictly clears ONLY the active unclosed trail (`activeTrailCells` and 3D ribbon mesh).
   * NEVER clears, resets, or modifies `ownedCells`!
   */
  clearTrail() {
    this.trailPoints.length = 0;
    this.isOutside = false;
    this.isDrawingTrail = false;
    this.trailGeometry.setDrawRange(0, 0);
    this.territoryGrid.clearTrailMarkers(this.id);
  }

  /**
   * CRITICAL BUGFIX: Called when a Patrolling Shark bites/cuts this contender's active trail.
   * 1. ONLY clears `activeTrailCells` and the 3D trail ribbon mesh (`this.clearTrail()`).
   * 2. NEVER clears, resets, or modifies `ownedCells`!
   * 3. Snaps/teleports the contender back onto the nearest valid cell of their existing `ownedCells`
   *    (and ensures Territory Integrity Fallback if `ownedCells.size === 0`), so the contender
   *    never loses their home island and is never locked out of drawing new trails!
   */
  handleSharkTrailSnap() {
    // 1. Clear ONLY the active trail (ownedCells remain 100% untouched!)
    this.clearTrail();

    // 2. Ensure contender has a valid base (Territory Integrity Fallback)
    this.territoryGrid.ensureContenderHasBase(this);

    // 3. Snap contender back onto the nearest valid cell of their existing ownedCells
    const nearestOwnedPos = this.territoryGrid.findNearestOwnedPoint(this.id, this.position);
    if (nearestOwnedPos) {
      this.normal.copy(nearestOwnedPos).normalize();
      this.position.copy(this.normal).multiplyScalar(this.radius);
      this.heading.sub(this.normal.clone().multiplyScalar(this.heading.dot(this.normal)));
      if (this.heading.lengthSq() < 1e-5) {
        const ref = Math.abs(this.normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        this.heading.crossVectors(ref, this.normal);
      }
      this.heading.normalize();
    }

    this.isOutside = false;
    this.isDrawingTrail = false;
    this.stunTimer = CONFIG.SHARK_STUN_DURATION;
    this.avatar.triggerSquashImpulse(0.55);
  }

  getCurrentTrailWidth() {
    const mult = this.powerUps.BROAD_BRUSH > 0 ? CONFIG.BROAD_BRUSH_MULTIPLIER : 1.0;
    return CONFIG.NORMAL_TRAIL_WIDTH * mult;
  }

  isCloaked() {
    return this.powerUps.SEMI_TRANSPARENCY > 0;
  }

  applyPowerUp(type, onLoopClosedCallback) {
    if (this.state === 'GHOST') return null;
    const cfg = CONFIG.POWERUPS[type];
    if (!cfg) return null;

    this.avatar.triggerSquashImpulse(0.35);

    if (type === 'INSTANT_ANCHOR') {
      if (this.isOutside && this.trailPoints.length > 0) {
        const homePos = this.territoryGrid.findNearestOwnedPoint(this.id, this.position);
        if (homePos) {
          const fromPos = this.position.clone();
          const dist = fromPos.distanceTo(homePos);
          const steps = Math.max(2, Math.ceil(dist / 1.4));
          for (let s = 1; s <= steps; s++) {
            const p = new THREE.Vector3().lerpVectors(fromPos, homePos, s / steps).normalize().multiplyScalar(this.radius);
            this.trailPoints.push(p);
          }

          this.normal.copy(homePos).normalize();
          this.position.copy(this.normal).multiplyScalar(this.radius);
          this.heading.sub(this.normal.clone().multiplyScalar(this.heading.dot(this.normal))).normalize();

          const capturedCells = this.territoryGrid.closeLoopAndFloodFill(
            this.id,
            this.trailPoints,
            this.getCurrentTrailWidth()
          );
          this.clearTrail();
          this.powerUps.INSTANT_ANCHOR = cfg.duration;
          if (onLoopClosedCallback) {
            onLoopClosedCallback(this, capturedCells, fromPos, homePos);
          }
          return { type, retracted: true, fromPos, toPos: homePos };
        }
      }
      this.powerUps.INSTANT_ANCHOR = 8.0;
      return { type, armed: true };
    }

    this.powerUps[type] = cfg.duration;
    return { type };
  }

  /**
   * Advances contender movement on the sphere surface:
   * - If `state === 'ALIVE'`: non-lethal smooth obstacle sliding, active ribbon trail, and BFS loop closure.
   * - If `state === 'GHOST'`: +35% speed, floats 2.5 units above water, passes straight through
   *   all obstacles and trails with zero collision or interference.
   */
  update(dt, elapsedTime, onLoopClosedCallback) {
    const isGhost = this.state === 'GHOST';

    if (this.booEmoteTimer > 0) {
      this.booEmoteTimer = Math.max(0, this.booEmoteTimer - dt);
    }

    if (!isGhost) {
      // TERRITORY INTEGRITY FALLBACK (Anti-Softlock Guard):
      // Every tick, ensure a living contender is NEVER left with 0 ownedCells!
      if (this.ownedCells.size === 0) {
        this.territoryGrid.ensureContenderHasBase(this);
      }

      if (this.spawnImmunityTimer > 0) {
        this.spawnImmunityTimer = Math.max(0, this.spawnImmunityTimer - dt);
      }
      if (this.stunTimer > 0) {
        this.stunTimer = Math.max(0, this.stunTimer - dt);
      }
      for (const key of Object.keys(this.powerUps)) {
        if (this.powerUps[key] > 0) {
          this.powerUps[key] = Math.max(0, this.powerUps[key] - dt);
        }
      }

      const targetOpacity = this.isCloaked() ? CONFIG.POWERUPS.SEMI_TRANSPARENCY.opacity : 1.0;
      this.avatar.setCloakOpacity(targetOpacity);

      if (this.trailMaterial.uniforms) {
        this.trailMaterial.uniforms.uTime.value = elapsedTime;
        this.trailMaterial.uniforms.uOpacity.value = this.isCloaked() ? 0.25 : 0.96;
        this.trailMaterial.uniforms.uColor.value.copy(
          this.powerUps.SPEED_BOOST > 0
            ? new THREE.Color(0xffe066).lerp(this.color, 0.5)
            : this.color
        );
      }

      if (this.spawnImmunityTimer > 0) {
        this.shieldMat.color.setHex(0xa8f0ff);
        this.shieldMat.opacity = 0.20 + 0.12 * Math.sin(elapsedTime * 10.0);
        this.shieldRing.rotation.z = elapsedTime * 3.0;
      } else if (this.powerUps.INSTANT_ANCHOR > 0) {
        this.shieldMat.color.setHex(0x4dff91);
        this.shieldMat.opacity = 0.24 + 0.14 * Math.sin(elapsedTime * 8.0);
      } else {
        this.shieldMat.opacity = 0.0;
      }
    } else if (this.booEmoteTimer > 0) {
      // Glowing ectoplasm aura ring during Ghost Boo emote!
      this.shieldMat.color.setHex(0x70f3ff);
      this.shieldMat.opacity = (this.booEmoteTimer / 1.3) * 0.75;
    } else {
      this.shieldMat.opacity = 0.0;
    }

    // Smooth steering angular velocity in tangent plane
    const gameSpeedMult = CONFIG.GAME_SPEED_MULTIPLIER || 1.0;
    const targetTurn = THREE.MathUtils.clamp(this.turnInput, -1, 1) * CONFIG.TURN_SPEED;
    this.currentTurnRate = THREE.MathUtils.lerp(this.currentTurnRate, targetTurn, Math.min(1, dt * 11.0));

    let speedRatio = gameSpeedMult;

    if (isGhost || this.stunTimer <= 0) {
      if (Math.abs(this.currentTurnRate) > 0.0001) {
        this.heading.applyAxisAngle(this.normal, this.currentTurnRate * dt);
      }

      let speed = CONFIG.BASE_SPEED * gameSpeedMult;
      if (!this.isPlayer) {
        const diffPreset = CONFIG.DIFFICULTY_PRESETS[CONFIG.DIFFICULTY] || CONFIG.DIFFICULTY_PRESETS.normal;
        speed *= diffPreset.botSpeedMult || 1.0;
      }

      if (isGhost) {
        speed *= CONFIG.GHOST_SPEED_MULTIPLIER; // +35% speed in Ghost Realm!
        speedRatio = gameSpeedMult * CONFIG.GHOST_SPEED_MULTIPLIER;
      } else if (this.powerUps.SPEED_BOOST > 0) {
        speed *= CONFIG.POWERUPS.SPEED_BOOST.speedMultiplier;
        speedRatio = gameSpeedMult * CONFIG.POWERUPS.SPEED_BOOST.speedMultiplier;
      }

      const prevPos = this.position.clone();

      const binormal = new THREE.Vector3().crossVectors(this.normal, this.heading).normalize();
      const angularStep = (speed * dt) / this.radius;

      this.normal.applyAxisAngle(binormal, angularStep).normalize();
      this.heading.applyAxisAngle(binormal, angularStep);
      this.heading.sub(this.normal.clone().multiplyScalar(this.heading.dot(this.normal))).normalize();

      if (!isGhost) {
        // Non-lethal solid obstacle sliding resolution (NEVER kills or breaks trail!)
        this._handleObstacleCollisions();
        this.position.copy(this.normal).multiplyScalar(this.radius);
        this._updateTerritoryAndTrail(prevPos, onLoopClosedCallback);
      } else {
        // Ghosts pass straight through obstacles and never paint or cut trails
        this.position.copy(this.normal).multiplyScalar(this.radius);
      }
    }

    // Animate procedural floppy tentacles, googly eyes & squishy mantle
    this.avatar.update(dt, elapsedTime, {
      turnRate: this.currentTurnRate,
      speedRatio,
      isBoost: !isGhost && this.powerUps.SPEED_BOOST > 0,
      isStunned: !isGhost && this.stunTimer > 0
    });

    this._syncVesselTransform(elapsedTime);
    this._updateWakeParticles(dt);
  }

  /**
   * NON-LETHAL, NON-BLOCKING SCENIC OBSTACLES:
   * When colliding with an obstacle (islands, trees, cliffs, coral reefs), NOTHING happens:
   * Zero pushback, zero stopping, zero velocity interruption.
   * The player (and bots) can continue moving safely and uninterruptedly straight through
   * and across any obstacle without getting stuck, immobilized, or breaking their active trail.
   */
  _handleObstacleCollisions() {
    // Intentionally empty: obstacles do not block, push, or freeze movement.
  }

  _updateTerritoryAndTrail(prevPos, onLoopClosedCallback) {
    // Territory Integrity Fallback check
    if (this.ownedCells.size === 0 && this.state === 'ALIVE') {
      this.territoryGrid.ensureContenderHasBase(this);
    }

    const currentCell = this.territoryGrid.getCellAtPosition(this.normal);
    if (currentCell < 0) return;

    const cellOwner = this.territoryGrid.owner[currentCell];
    const trailWidth = this.getCurrentTrailWidth();

    if (cellOwner === this.id) {
      if (this.isOutside && this.trailPoints.length >= 2) {
        this.trailPoints.push(this.position.clone());
        const capturedCells = this.territoryGrid.closeLoopAndFloodFill(
          this.id,
          this.trailPoints,
          trailWidth
        );
        this.clearTrail();
        this.avatar.triggerSquashImpulse(0.45);
        if (onLoopClosedCallback) {
          onLoopClosedCallback(this, capturedCells);
        }
      } else if (this.isOutside) {
        this.clearTrail();
      }
    } else {
      if (!this.isOutside) {
        this.isOutside = true;
        this.isDrawingTrail = true;

        // Anchor trail start cleanly to the nearest ownedCells border
        const borderAnchor = this.territoryGrid.findNearestOwnedPoint(this.id, prevPos) || prevPos;
        this.trailPoints.length = 0;
        this.trailPoints.push(borderAnchor.clone());
        this.trailPoints.push(this.position.clone());
      } else {
        this.isDrawingTrail = true;
        const lastPt = this.trailPoints[this.trailPoints.length - 1];
        if (lastPt.distanceTo(this.position) >= CONFIG.TRAIL_SAMPLE_DISTANCE) {
          if (this.trailPoints.length < this.maxTrailSegments) {
            this.trailPoints.push(this.position.clone());
          } else {
            this.trailPoints.splice(1, 1);
            this.trailPoints.push(this.position.clone());
          }
        }
      }

      this.territoryGrid.stampTrailSegment(prevPos, this.position, this.id, trailWidth, false);
      this._rebuildTrailRibbonGeometry(trailWidth);
    }
  }

  _rebuildTrailRibbonGeometry(trailWidth) {
    const pts = this.trailPoints;
    if (!this.isOutside || pts.length === 0) {
      this.trailGeometry.setDrawRange(0, 0);
      return;
    }

    const halfW = trailWidth * 0.5;
    const posArr = this.trailPosAttr.array;
    const uvArr = this.trailUvAttr.array;
    const count = Math.min(pts.length, this.maxTrailSegments);

    const pCurr = new THREE.Vector3();
    const pNext = new THREE.Vector3();
    const nVec = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const side = new THREE.Vector3();

    for (let i = 0; i <= count; i++) {
      if (i < count) {
        pCurr.copy(pts[i]);
      } else {
        pCurr.copy(this.position);
      }

      nVec.copy(pCurr).normalize();

      if (i < count - 1) {
        pNext.copy(pts[i + 1]);
        dir.subVectors(pNext, pCurr);
      } else if (i === count - 1) {
        dir.subVectors(this.position, pCurr);
      } else {
        dir.copy(this.heading);
      }

      if (dir.lengthSq() < 1e-5) {
        dir.copy(this.heading);
      } else {
        dir.normalize();
      }

      side.crossVectors(nVec, dir).normalize();

      let islandElev = 0;
      if (this.sphereWorld && this.sphereWorld.obstacles) {
        const obstacles = this.sphereWorld.obstacles;
        for (let o = 0; o < obstacles.length; o++) {
          const obs = obstacles[o];
          const arc = nVec.angleTo(obs.normal) * this.radius;
          if (arc < obs.radius) {
            const t = 1.0 - (arc / obs.radius);
            const h = (obs.type === 'ANCIENT_TREE' ? 1.4 : 1.1) * Math.sin(t * Math.PI * 0.5);
            if (h > islandElev) islandElev = h;
          }
        }
      }

      const r = this.radius + 0.42 + islandElev;
      const baseX = nVec.x * r;
      const baseY = nVec.y * r;
      const baseZ = nVec.z * r;

      const vIdx = i * 6;
      posArr[vIdx]     = baseX + side.x * halfW;
      posArr[vIdx + 1] = baseY + side.y * halfW;
      posArr[vIdx + 2] = baseZ + side.z * halfW;

      posArr[vIdx + 3] = baseX - side.x * halfW;
      posArr[vIdx + 4] = baseY - side.y * halfW;
      posArr[vIdx + 5] = baseZ - side.z * halfW;

      const uIdx = i * 4;
      const vCoord = i / Math.max(1, count);
      uvArr[uIdx]     = 0.0;
      uvArr[uIdx + 1] = vCoord;
      uvArr[uIdx + 2] = 1.0;
      uvArr[uIdx + 3] = vCoord;
    }

    this.trailPosAttr.needsUpdate = true;
    this.trailUvAttr.needsUpdate = true;
    this.trailGeometry.setDrawRange(0, count * 6);
  }

  /**
   * Aligns the 3D DerpyOctopusAvatar to the sphere surface normal (`local +Y`) and heading tangent (`local +Z`)
   * using a strict right-handed orthonormal basis (`det = +1.0`) so the character is 100% upright and volumetric!
   * In Ghost mode, floats `CONFIG.GHOST_FLOAT_OFFSET` (2.5 units) above the water surface!
   * Seamlessly elevates over sandy island dunes and reefs so movement is 100% smooth and unobstructed.
   */
  _syncVesselTransform(elapsedTime) {
    const isGhost = this.state === 'GHOST';

    let islandElev = 0;
    if (this.sphereWorld && this.sphereWorld.obstacles) {
      const obstacles = this.sphereWorld.obstacles;
      for (let i = 0; i < obstacles.length; i++) {
        const obs = obstacles[i];
        const arc = this.normal.angleTo(obs.normal) * this.radius;
        if (arc < obs.radius) {
          const t = 1.0 - (arc / obs.radius);
          const h = (obs.type === 'ANCIENT_TREE' ? 1.8 : (obs.type === 'CORAL_REEF' ? 1.2 : 2.0)) * Math.sin(t * Math.PI * 0.5);
          if (h > islandElev) islandElev = h;
        }
      }
    }

    const floatHeight = isGhost
      ? CONFIG.GHOST_FLOAT_OFFSET + Math.sin(elapsedTime * 3.2 + this.id) * 0.42
      : 0.68 + islandElev + Math.sin(elapsedTime * 4.5 + this.id) * 0.16;

    this.mesh.position.copy(this.normal).multiplyScalar(this.radius + floatHeight);

    // Right-handed basis: sideX = normal x heading, Y = normal (outward up), Z = heading (forward)
    const sideX = new THREE.Vector3().crossVectors(this.normal, this.heading).normalize();
    const rotMat = new THREE.Matrix4().makeBasis(sideX, this.normal, this.heading);
    this.mesh.quaternion.setFromRotationMatrix(rotMat);

    // Subtle banking lean into turns
    const bankAngle = this.currentTurnRate * 0.18;
    this.mesh.rotateZ(bankAngle);
  }

  _updateWakeParticles(dt) {
    const isGhost = this.state === 'GHOST';
    const isBoost = !isGhost && this.powerUps.SPEED_BOOST > 0;

    if (isGhost) {
      this.wakeMaterial.color.setHex(0x80ffea);
      this.wakeMaterial.opacity = 0.45;
    } else {
      this.wakeMaterial.color.setHex(isBoost ? 0xffe066 : 0xffffff);
      this.wakeMaterial.opacity = this.isCloaked() ? 0.12 : 0.68;
    }

    const sideX = new THREE.Vector3().crossVectors(this.normal, this.heading).normalize();
    const altitude = isGhost ? this.radius + CONFIG.GHOST_FLOAT_OFFSET + 0.35 : this.radius + 0.38;

    for (let i = 0; i < this.wakeCount; i++) {
      this.wakeAges[i] += dt * (isBoost ? 2.2 : 1.4);
      const bubble = this.wakeBubbles[i];
      if (this.wakeAges[i] >= 1.0) {
        this.wakeAges[i] -= 1.0;
        const spread = (Math.random() - 0.5) * 2.4;
        const spawnPos = this.position
          .clone()
          .addScaledVector(this.heading, -2.6 - Math.random() * 0.8)
          .addScaledVector(sideX, spread)
          .normalize()
          .multiplyScalar(altitude + (isGhost ? (Math.random() - 0.5) * 0.6 : 0));

        bubble.position.copy(spawnPos);
      }
      const life = this.wakeAges[i];
      const scale = Math.max(0.05, Math.sin(life * Math.PI) * (isBoost ? 1.25 : 0.95));
      bubble.scale.setScalar(scale);
    }
  }

  /**
   * Returns the 3D world position above the 1.8x octopus's head for floating nameplate projection.
   * Raised +3.5 units higher (`CONFIG.NAMEPLATE_HEIGHT_OFFSET = 7.8`) so it never covers the hat/headgear!
   */
  getHeadWorldPosition(targetVec = new THREE.Vector3()) {
    const baseOffset = CONFIG.NAMEPLATE_HEIGHT_OFFSET || 7.8;
    const extraHeight = this.state === 'GHOST'
      ? CONFIG.GHOST_FLOAT_OFFSET + baseOffset + 0.4
      : baseOffset;
    return targetVec.copy(this.normal).multiplyScalar(this.radius + extraHeight);
  }
}

/**
 * Local Player Controller:
 * Handles Closer Diorama Spherical Camera Rig (FOV = 26, Tilt = 54 deg, Distance = 30 + wheel zoom),
 * multi-modal steering input, and Ghost Realm `[E]` / `Click` Boo Emote triggers.
 */
export class PlayerController extends Contender {
  constructor(scene, territoryGrid, sphereWorld, camera, domElement) {
    super(0, scene, territoryGrid, sphereWorld, true);
    this.camera = camera;
    this.domElement = domElement;

    this.camNormal = new THREE.Vector3(0, 0, 1);
    this.camNorth = new THREE.Vector3(0, 1, 0);
    this.camEast = new THREE.Vector3(1, 0, 0);
    this.cameraDistance = CONFIG.CAMERA_DISTANCE || 30;

    this.keys = {
      left: false,
      right: false,
      up: false,
      down: false
    };
    this.mouseSteeringActive = false;
    this.mouseNormalized = new THREE.Vector2(0, 0);

    this.joystickActive = false;
    this.joystickVector = new THREE.Vector2(0, 0);

    this.onGhostEmoteCallback = null;

    this._bindInputEvents();
  }

  _bindInputEvents() {
    window.addEventListener('keydown', (e) => {
      // Ignore game hotkeys if typing inside an input box in the Pre-Game Lobby
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        return;
      }

      switch (e.code) {
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = true;
          this.mouseSteeringActive = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = true;
          this.mouseSteeringActive = false;
          break;
        case 'KeyW':
        case 'ArrowUp':
          this.keys.up = true;
          this.mouseSteeringActive = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.down = true;
          this.mouseSteeringActive = false;
          break;
        case 'KeyE':
          if (this.state === 'GHOST') {
            if (this.triggerGhostEmote() && this.onGhostEmoteCallback) {
              this.onGhostEmoteCallback(this);
            }
          }
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = false;
          break;
        case 'KeyW':
        case 'ArrowUp':
          this.keys.up = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.down = false;
          break;
      }
    });

    this.domElement.addEventListener('pointermove', (e) => {
      if (this.joystickActive || e.pointerType === 'touch') return;
      const rect = this.domElement.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      if (Math.hypot(nx, ny) > 0.06) {
        this.mouseNormalized.set(nx, -ny);
        this.mouseSteeringActive = true;
      }
    });

    // Mouse-wheel zoom to adjust camera distance smoothly between [22..145]
    this.domElement.addEventListener(
      'wheel',
      (e) => {
        const minD = CONFIG.CAMERA_MIN_DISTANCE || 22;
        const maxD = CONFIG.CAMERA_MAX_DISTANCE || 145;
        this.cameraDistance = THREE.MathUtils.clamp(
          this.cameraDistance + Math.sign(e.deltaY) * 3.5,
          minD,
          maxD
        );
      },
      { passive: true }
    );

    // Click on canvas while in Ghost Mode triggers the goofy Ghost Spin / Boo emote!
    this.domElement.addEventListener('pointerdown', (e) => {
      if (this.state === 'GHOST' && e.button === 0) {
        if (this.triggerGhostEmote() && this.onGhostEmoteCallback) {
          this.onGhostEmoteCallback(this);
        }
      }
    });
  }

  setTouchJoystick(active, vx, vy) {
    this.joystickActive = active;
    if (active) {
      this.joystickVector.set(vx, -vy);
      this.mouseSteeringActive = false;
    } else {
      this.joystickVector.set(0, 0);
    }
  }

  spawn(spawnNormal) {
    super.spawn(spawnNormal);

    this.camNormal.copy(this.normal);
    this.camNorth.copy(this.heading);
    this.camEast.crossVectors(this.camNorth, this.camNormal).normalize();
    this.updateCamera(1.0);
  }

  /**
   * Updates steering input for BOTH Living and Ghost states so eliminated players
   * can glide and haunt freely around the 3D sphere!
   */
  updateInput() {
    if (this.joystickActive && this.joystickVector.lengthSq() > 0.02) {
      this._steerTowardScreenVector(this.joystickVector.x, this.joystickVector.y);
      return;
    }

    if (this.keys.up || this.keys.down) {
      const kx = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
      const ky = (this.keys.up ? 1 : 0) - (this.keys.down ? 1 : 0);
      if (kx !== 0 || ky !== 0) {
        this._steerTowardScreenVector(kx, ky);
        return;
      }
    } else if (this.keys.left || this.keys.right) {
      this.turnInput = (this.keys.left ? 1 : 0) - (this.keys.right ? 1 : 0);
      return;
    }

    if (this.mouseSteeringActive && this.mouseNormalized.lengthSq() > 0.004) {
      this._steerTowardScreenVector(this.mouseNormalized.x, this.mouseNormalized.y);
      return;
    }

    this.turnInput = 0;
  }

  _steerTowardScreenVector(sx, sy) {
    const desiredTangent = new THREE.Vector3()
      .addScaledVector(this.camEast, sx)
      .addScaledVector(this.camNorth, sy);

    desiredTangent.sub(this.normal.clone().multiplyScalar(desiredTangent.dot(this.normal)));
    if (desiredTangent.lengthSq() < 1e-5) {
      this.turnInput = 0;
      return;
    }
    desiredTangent.normalize();

    const cross = new THREE.Vector3().crossVectors(this.normal, this.heading);
    const sinAngle = cross.dot(desiredTangent);
    const cosAngle = this.heading.dot(desiredTangent);
    const signedAngle = Math.atan2(sinAngle, cosAngle);

    this.turnInput = THREE.MathUtils.clamp(signedAngle * 2.4, -1.0, 1.0);
  }

  /**
   * Closer Diorama Spherical Camera Framing:
   * Uses `camera.fov = 26`, tilt angle `60 deg` from the surface normal (`elevation = 30 deg`),
   * and distance `30` units so the curved horizon sits at ~8.7% from the top of the viewport
   * and the rich ocean fills ~95% of the screen!
   */
  updateCamera(dt) {
    const lerpFactor = Math.min(1.0, dt * CONFIG.CAMERA_SMOOTHNESS);

    this.camNormal.lerp(this.normal, lerpFactor).normalize();
    this.camNorth.sub(this.camNormal.clone().multiplyScalar(this.camNorth.dot(this.camNormal))).normalize();
    this.camEast.crossVectors(this.camNorth, this.camNormal).normalize();

    const elevationDeg = CONFIG.CAMERA_ELEVATION_DEG !== undefined ? CONFIG.CAMERA_ELEVATION_DEG : 30;
    const tiltFromNormalDeg = 90 - elevationDeg; // 60 degrees from surface normal => horizon at ~8.7% from top
    const tiltRad = THREE.MathUtils.degToRad(tiltFromNormalDeg);
    const dist = this.cameraDistance || CONFIG.CAMERA_DISTANCE || 30;

    const camOffsetDir = new THREE.Vector3()
      .addScaledVector(this.camNormal, Math.cos(tiltRad))
      .addScaledVector(this.camNorth, -Math.sin(tiltRad))
      .normalize();

    const targetPos = this.camNormal.clone().multiplyScalar(this.radius);
    const camPos = targetPos.clone().addScaledVector(camOffsetDir, dist);

    this.camera.position.copy(camPos);
    const camUp = new THREE.Vector3()
      .addScaledVector(this.camNormal, Math.sin(tiltRad))
      .addScaledVector(this.camNorth, Math.cos(tiltRad))
      .normalize();

    this.camera.up.copy(camUp);
    this.camera.lookAt(targetPos);
  }
}

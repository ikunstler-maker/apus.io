// ============================================================================
// APUS.IO — DYNAMIC HAZARDS (WHIRLPOOLS, SHARKS) & POWER-UP BUOYS + FX
// ============================================================================
import * as THREE from 'three';
import { CONFIG } from './Config.js';
import { createWhirlpoolMaterial } from './Shaders.js';

const POWERUP_KEYS = [
  'SPEED_BOOST',
  'SEMI_TRANSPARENCY',
  'INSTANT_ANCHOR',
  'BROAD_BRUSH',
  'SONAR_WAVE'
];

export class HazardsAndBonuses {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./SphereWorld.js').SphereWorld} sphereWorld
   * @param {import('./TerritoryGrid.js').TerritoryGrid} territoryGrid
   */
  constructor(scene, sphereWorld, territoryGrid) {
    this.scene = scene;
    this.sphereWorld = sphereWorld;
    this.territoryGrid = territoryGrid;
    this.radius = CONFIG.SPHERE_RADIUS;

    this.whirlpools = []; // Linked pairs of non-lethal teleport vortexes
    this.sharks = [];     // Autonomous trail-cutting shark agents
    this.powerUps = [];   // Floating luminous power-up buoys
    this.activeFX = [];   // Expanding sonar rings, shark shockwaves, anchor beams

    this._initWhirlpools();
    this._initSharks();
    this._initPowerUpBuoys();
  }

  // ==========================================================================
  // 1. WHIRLPOOLS (NON-LETHAL TELEPORT & TRAIL SEVER)
  // ==========================================================================
  _initWhirlpools() {
    this.whirlpoolGroup = new THREE.Group();
    this.scene.add(this.whirlpoolGroup);

    const pairColors = [
      new THREE.Color(0x00f5d4),
      new THREE.Color(0x70f3ff),
      new THREE.Color(0xc77dff)
    ];

    for (let p = 0; p < CONFIG.WHIRLPOOL_PAIR_COUNT; p++) {
      const color = pairColors[p % pairColors.length];
      const mat = createWhirlpoolMaterial(color);

      // Find a safe normal for Entrance Whirlpool A
      const normalA = this.sphereWorld.findSafeSpawnNormal([], 15.0, 0);
      // Place Linked Exit Whirlpool B on the opposite hemisphere (antipodal region, nudged away from obstacles)
      const antipodeCandidate = normalA.clone().negate();
      const normalB = this._nudgeAwayFromObstacles(antipodeCandidate, 15.0);

      const vortexA = this._createVortexMesh(normalA, mat, color, p * 2);
      const vortexB = this._createVortexMesh(normalB, mat, color, p * 2 + 1);

      vortexA.linkedPartner = vortexB;
      vortexB.linkedPartner = vortexA;

      this.whirlpools.push(vortexA, vortexB);
    }
  }

  _nudgeAwayFromObstacles(startNormal, minClearance) {
    const candidate = startNormal.clone().normalize();
    for (let attempt = 0; attempt < 50; attempt++) {
      let safe = true;
      for (const obs of this.sphereWorld.obstacles) {
        if (candidate.angleTo(obs.normal) * this.radius < obs.radius + minClearance) {
          safe = false;
          break;
        }
      }
      if (safe) return candidate;

      // Perturb slightly on unit sphere
      candidate.x += (Math.random() - 0.5) * 0.25;
      candidate.y += (Math.random() - 0.5) * 0.25;
      candidate.z += (Math.random() - 0.5) * 0.25;
      candidate.normalize();
    }
    return candidate;
  }

  _createVortexMesh(normal, material, color, id) {
    const vortexRadius = 5.2;
    const group = new THREE.Group();
    const pos = normal.clone().multiplyScalar(this.radius + 0.25);
    group.position.copy(pos);

    const up = new THREE.Vector3(0, 0, 1);
    group.quaternion.setFromUnitVectors(up, normal);

    const discGeo = new THREE.PlaneGeometry(vortexRadius * 2.2, vortexRadius * 2.2, 24, 24);
    const discMesh = new THREE.Mesh(discGeo, material);
    discMesh.renderOrder = 3;
    group.add(discMesh);

    // Outer glowing portal beacon ring
    const ringGeo = new THREE.RingGeometry(vortexRadius * 0.92, vortexRadius * 1.08, 36);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    group.add(ringMesh);

    this.whirlpoolGroup.add(group);

    return {
      id,
      normal: normal.clone(),
      position: pos,
      radius: vortexRadius * 0.85,
      material,
      mesh: group,
      linkedPartner: null
    };
  }

  // ==========================================================================
  // 2. PATROLLING SHARKS (AUTONOMOUS TRAIL CUTTERS)
  // ==========================================================================
  _initSharks() {
    this.sharkGroup = new THREE.Group();
    this.scene.add(this.sharkGroup);

    for (let i = 0; i < CONFIG.SHARK_COUNT; i++) {
      const normal = this.sphereWorld.findSafeSpawnNormal([], 14.0, 0);
      const ref = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const heading = new THREE.Vector3().crossVectors(ref, normal).normalize();

      const mesh = this._buildSharkMesh();
      this.sharkGroup.add(mesh);

      this.sharks.push({
        id: i,
        normal,
        heading,
        position: normal.clone().multiplyScalar(this.radius),
        speed: CONFIG.BASE_SPEED * 0.88,
        chaseSpeed: CONFIG.BASE_SPEED * 1.16,
        patrolCurveSign: i % 2 === 0 ? 1 : -1,
        patrolTimer: Math.random() * 6.0,
        biteCooldown: 0,
        isChasing: false,
        mesh
      });
    }
  }

  /**
   * Builds a stylized menacing dorsal fin, tail fin, and shadowy underwater shark silhouette.
   */
  _buildSharkMesh() {
    const group = new THREE.Group();

    // Shadowy underwater body silhouette just beneath the surface
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0c1f33,
      roughness: 0.6,
      transparent: true,
      opacity: 0.72
    });
    const bodyGeo = new THREE.ConeGeometry(0.95, 4.4, 7);
    bodyGeo.rotateX(Math.PI / 2);
    bodyGeo.scale(0.85, 0.42, 1.0);
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = -0.15;
    group.add(bodyMesh);

    // Iconic curved dorsal fin slicing above the waves
    const finMat = new THREE.MeshStandardMaterial({
      color: 0x223344,
      emissive: 0xff2a55,
      emissiveIntensity: 0.25,
      roughness: 0.4,
      flatShading: true
    });
    const dorsalGeo = new THREE.ConeGeometry(0.55, 1.85, 4);
    dorsalGeo.scale(0.32, 1.0, 1.15);
    const dorsalMesh = new THREE.Mesh(dorsalGeo, finMat);
    dorsalMesh.position.set(0, 0.95, -0.1);
    dorsalMesh.rotation.x = -0.28;
    dorsalMesh.castShadow = true;
    group.add(dorsalMesh);

    // Swept tail fin
    const tailGeo = new THREE.ConeGeometry(0.38, 1.25, 4);
    tailGeo.scale(0.25, 1.0, 0.85);
    const tailMesh = new THREE.Mesh(tailGeo, finMat);
    tailMesh.position.set(0, 0.6, -2.1);
    tailMesh.rotation.x = -0.35;
    group.add(tailMesh);

    // Subtle warning ripple ring around dorsal fin
    const rippleGeo = new THREE.RingGeometry(0.9, 1.35, 20);
    rippleGeo.rotateX(-Math.PI / 2);
    const rippleMat = new THREE.MeshBasicMaterial({
      color: 0xff4d6d,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const rippleMesh = new THREE.Mesh(rippleGeo, rippleMat);
    rippleMesh.position.y = 0.28;
    group.add(rippleMesh);

    return group;
  }

  // ==========================================================================
  // 3. POWER-UPS & BONUSES (FLOATING ROTATING LUMINOUS BUOYS)
  // ==========================================================================
  _initPowerUpBuoys() {
    this.buoyGroup = new THREE.Group();
    this.scene.add(this.buoyGroup);

    for (let i = 0; i < CONFIG.MAX_POWERUPS; i++) {
      const type = POWERUP_KEYS[i % POWERUP_KEYS.length];
      const buoy = this._createBuoyObject(i, type);
      this._relocateBuoy(buoy);
      this.powerUps.push(buoy);
    }
  }

  _createBuoyObject(index, type) {
    const cfg = CONFIG.POWERUPS[type];
    const group = new THREE.Group();

    const coreMat = new THREE.MeshStandardMaterial({
      color: cfg.color,
      emissive: cfg.color,
      emissiveIntensity: 0.85,
      roughness: 0.15,
      metalness: 0.2
    });

    // Luminous floating crystal octahedron core
    const coreGeo = new THREE.OctahedronGeometry(1.25, 0);
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.y = 1.65;
    coreMesh.castShadow = true;
    group.add(coreMesh);

    // Orbiting energy halo ring
    const ringGeo = new THREE.TorusGeometry(1.75, 0.14, 8, 24);
    ringGeo.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: cfg.color,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.y = 1.1;
    group.add(ringMesh);

    // Base water glow disc
    const baseGeo = new THREE.RingGeometry(0.6, 2.2, 24);
    baseGeo.rotateX(-Math.PI / 2);
    const baseMat = new THREE.MeshBasicMaterial({
      color: cfg.color,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 0.25;
    group.add(baseMesh);

    this.buoyGroup.add(group);

    return {
      index,
      type,
      active: true,
      respawnTimer: 0,
      normal: new THREE.Vector3(0, 1, 0),
      position: new THREE.Vector3(),
      mesh: group,
      coreMesh,
      ringMesh,
      coreMat,
      ringMat,
      baseMat
    };
  }

  _relocateBuoy(buoy, newType = null) {
    if (newType) {
      buoy.type = newType;
      const cfg = CONFIG.POWERUPS[newType];
      buoy.coreMat.color.setHex(cfg.color);
      buoy.coreMat.emissive.setHex(cfg.color);
      buoy.ringMat.color.setHex(cfg.color);
      buoy.baseMat.color.setHex(cfg.color);
    }

    const normal = this.sphereWorld.findSafeSpawnNormal([], 12.0, 0);
    buoy.normal.copy(normal);
    buoy.position.copy(normal).multiplyScalar(this.radius);

    buoy.mesh.position.copy(buoy.position);
    const up = new THREE.Vector3(0, 1, 0);
    buoy.mesh.quaternion.setFromUnitVectors(up, normal);

    buoy.active = true;
    buoy.respawnTimer = 0;
    buoy.mesh.visible = true;
  }

  // ==========================================================================
  // 4. EXPANDING SHOCKWAVES, REPULSOR PULSES & ANCHOR TETHER FX
  // ==========================================================================
  spawnShockwaveRing(normal, colorHex = 0x5ce1e6, maxRadius = 26.0, duration = 1.1) {
    const group = new THREE.Group();
    group.position.copy(normal).multiplyScalar(this.radius + 0.45);
    const up = new THREE.Vector3(0, 0, 1);
    group.quaternion.setFromUnitVectors(up, normal);

    const geo = new THREE.RingGeometry(0.85, 1.0, 48);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);
    this.scene.add(group);

    this.activeFX.push({
      kind: 'RING',
      group,
      mat,
      age: 0,
      duration,
      maxRadius
    });
  }

  spawnAnchorTetherFX(fromPos, toPos, colorHex = 0x4dff91) {
    const points = [];
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const p = new THREE.Vector3()
        .lerpVectors(fromPos, toPos, i / steps)
        .normalize()
        .multiplyScalar(this.radius + 0.9);
      points.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const geo = new THREE.TubeGeometry(curve, 20, 0.45, 6, false);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    this.scene.add(mesh);

    this.activeFX.push({
      kind: 'BEAM',
      group: mesh,
      mat,
      age: 0,
      duration: 0.75
    });
  }

  /**
   * Executes Repulsor Pulse (`SONAR_WAVE`):
   * Emits an expanding spherical water ring that pushes nearby opponents and
   * patrolling sharks away from the contender and their active trail!
   */
  triggerRepulsorPulse(sourceContender, allContenders) {
    const cfg = CONFIG.POWERUPS.SONAR_WAVE;
    this.spawnShockwaveRing(sourceContender.normal, cfg.color, cfg.radius, 1.15);

    const pushRadius = cfg.radius;
    const pushArcAngle = (cfg.pushStrength * 0.35) / this.radius;

    // Push nearby opponent contenders outward along sphere tangent
    for (let i = 0; i < allContenders.length; i++) {
      const other = allContenders[i];
      if (other === sourceContender || other.isEliminated) continue;

      const d = other.position.distanceTo(sourceContender.position);
      if (d < pushRadius && d > 0.01) {
        const strength = (1.0 - d / pushRadius) * pushArcAngle;
        const axis = new THREE.Vector3().crossVectors(sourceContender.normal, other.normal);
        if (axis.lengthSq() > 1e-6) {
          axis.normalize();
          other.normal.applyAxisAngle(axis, strength).normalize();
          other.position.copy(other.normal).multiplyScalar(this.radius);
          other.heading.sub(other.normal.clone().multiplyScalar(other.heading.dot(other.normal))).normalize();
        }
      }
    }

    // Push nearby patrolling sharks away and stun their chase briefly
    for (let i = 0; i < this.sharks.length; i++) {
      const shark = this.sharks[i];
      const d = shark.position.distanceTo(sourceContender.position);
      if (d < pushRadius * 1.15 && d > 0.01) {
        const strength = (1.15 - d / pushRadius) * pushArcAngle * 1.35;
        const axis = new THREE.Vector3().crossVectors(sourceContender.normal, shark.normal);
        if (axis.lengthSq() > 1e-6) {
          axis.normalize();
          shark.normal.applyAxisAngle(axis, strength).normalize();
          shark.position.copy(shark.normal).multiplyScalar(this.radius);
          // Turn shark away from source contender
          const awayTangent = new THREE.Vector3()
            .subVectors(shark.position, sourceContender.position)
            .sub(shark.normal.clone().multiplyScalar(shark.position.dot(shark.normal)))
            .normalize();
          if (awayTangent.lengthSq() > 1e-4) {
            shark.heading.copy(awayTangent);
          }
          shark.biteCooldown = 2.5;
        }
      }
    }
  }

  // ==========================================================================
  // 5. MAIN UPDATE LOOP FOR WHIRLPOOLS, SHARKS, BUOYS & FX
  // ==========================================================================
  update(dt, elapsedTime, allContenders, callbacks = {}) {
    const { onWhirlpoolTeleport, onSharkBite, onPowerUpCollected, onLoopClosed, onEliminated } = callbacks;

    // 1. Update Whirlpools & check contender entry
    for (let i = 0; i < this.whirlpools.length; i++) {
      const wp = this.whirlpools[i];
      wp.material.uniforms.uTime.value = elapsedTime;

      for (let c = 0; c < allContenders.length; c++) {
        const contender = allContenders[c];
        if (contender.isEliminated || contender.spawnImmunityTimer > 0) continue;

        const arcDist = contender.normal.angleTo(wp.normal) * this.radius;
        if (arcDist < wp.radius) {
          // Non-lethal teleport & active trail sever!
          contender.clearTrail();

          const exitWp = wp.linkedPartner;
          // Place contender just outside the exit whirlpool rim along their current heading projection
          const exitOffsetAngle = (exitWp.radius + 3.8) / this.radius;
          const ref = Math.abs(exitWp.normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
          const exitBinormal = new THREE.Vector3().crossVectors(ref, exitWp.normal).normalize();

          contender.normal.copy(exitWp.normal).applyAxisAngle(exitBinormal, exitOffsetAngle).normalize();
          contender.position.copy(contender.normal).multiplyScalar(this.radius);
          contender.heading.crossVectors(exitBinormal, contender.normal).normalize();
          contender.spawnImmunityTimer = CONFIG.WHIRLPOOL_IMMUNITY_DURATION; // 1.5s immunity!

          this.spawnShockwaveRing(wp.normal, 0x00f5d4, 14.0, 0.7);
          this.spawnShockwaveRing(exitWp.normal, 0x00f5d4, 16.0, 0.8);

          if (onWhirlpoolTeleport) {
            onWhirlpoolTeleport(contender, wp, exitWp);
          }
        }
      }
    }

    // 2. Update Autonomous Patrolling Sharks
    this._updateSharks(dt, elapsedTime, allContenders, onSharkBite, onEliminated);

    // 3. Update Floating Power-Up Buoys & check collection
    for (let i = 0; i < this.powerUps.length; i++) {
      const buoy = this.powerUps[i];
      if (!buoy.active) {
        buoy.respawnTimer -= dt;
        if (buoy.respawnTimer <= 0) {
          const nextType = POWERUP_KEYS[Math.floor(Math.random() * POWERUP_KEYS.length)];
          this._relocateBuoy(buoy, nextType);
        }
        continue;
      }

      // Bob and spin luminous crystal buoy
      buoy.coreMesh.rotation.y = elapsedTime * 2.2 + buoy.index;
      buoy.coreMesh.rotation.x = Math.sin(elapsedTime * 1.6 + buoy.index) * 0.35;
      buoy.coreMesh.position.y = 1.65 + Math.sin(elapsedTime * 3.0 + buoy.index) * 0.32;
      buoy.ringMesh.rotation.z = -elapsedTime * 1.8;

      // Check contender collection
      for (let c = 0; c < allContenders.length; c++) {
        const contender = allContenders[c];
        if (contender.isEliminated) continue;

        if (contender.position.distanceTo(buoy.position) < 3.4) {
          const collectedType = buoy.type;
          buoy.active = false;
          buoy.mesh.visible = false;
          buoy.respawnTimer = CONFIG.POWERUP_RESPAWN_TIME;

          const res = contender.applyPowerUp(collectedType, onLoopClosed);

          if (collectedType === 'SONAR_WAVE') {
            this.triggerRepulsorPulse(contender, allContenders);
          } else if (res && res.retracted && res.fromPos && res.toPos) {
            this.spawnAnchorTetherFX(res.fromPos, res.toPos, 0x4dff91);
          } else {
            const cfg = CONFIG.POWERUPS[collectedType];
            this.spawnShockwaveRing(contender.normal, cfg.color, 11.0, 0.55);
          }

          if (onPowerUpCollected) {
            onPowerUpCollected(contender, collectedType, res);
          }
          break;
        }
      }
    }

    // 4. Update active FX rings and beams
    for (let i = this.activeFX.length - 1; i >= 0; i--) {
      const fx = this.activeFX[i];
      fx.age += dt;
      const t = fx.age / fx.duration;
      if (t >= 1.0) {
        this.scene.remove(fx.group);
        this.activeFX.splice(i, 1);
        continue;
      }

      if (fx.kind === 'RING') {
        const scale = 1.0 + t * fx.maxRadius;
        fx.group.scale.set(scale, scale, 1);
        fx.mat.opacity = (1.0 - t) * 0.9;
      } else if (fx.kind === 'BEAM') {
        fx.mat.opacity = (1.0 - t) * 0.95;
      } else if (fx.kind === 'SPLAT_POOF') {
        fx.mat.opacity = (1.0 - t) * 0.95;
        for (let p = 0; p < fx.puffs.length; p++) {
          const puff = fx.puffs[p];
          puff.mesh.position.x += puff.vx * dt;
          puff.mesh.position.y += puff.vy * dt;
          puff.mesh.position.z += puff.vz * dt;
          puff.vy -= 14.0 * dt;
          const s = Math.max(0.1, (1.0 - t * 0.65) * (1.0 + Math.sin(t * Math.PI) * 0.5));
          puff.mesh.scale.setScalar(s);
        }
      }
    }
  }

  /**
   * Updates autonomous trail-cutting sharks:
   * - Cruisers patrol along curved spherical paths.
   * - Ignore contenders inside safe territory and ignore contenders with Phantom Cloak (`SEMI_TRANSPARENCY`).
   * - Veer aggressively toward nearby exposed trails and bite/sever them on contact!
   */
  _updateSharks(dt, elapsedTime, allContenders, onSharkBite, onEliminated) {
    for (let s = 0; s < this.sharks.length; s++) {
      const shark = this.sharks[s];
      if (shark.biteCooldown > 0) {
        shark.biteCooldown = Math.max(0, shark.biteCooldown - dt);
      }

      shark.patrolTimer += dt;
      let targetTrailPoint = null;
      let targetContender = null;
      let bestDist = 30.0; // Shark detection range

      if (shark.biteCooldown <= 0) {
        for (let c = 0; c < allContenders.length; c++) {
          const contender = allContenders[c];
          if (contender.isEliminated || !contender.isOutside) continue;
          // Phantom Cloak rule: sharks cannot detect cloaked trails!
          if (contender.isCloaked()) continue;
          if (contender.trailPoints.length < 2) continue;

          // Check distance to exposed trail points
          for (let p = 0; p < contender.trailPoints.length; p += 2) {
            const pt = contender.trailPoints[p];
            const d = shark.position.distanceTo(pt);
            if (d < bestDist) {
              bestDist = d;
              targetTrailPoint = pt;
              targetContender = contender;
            }
          }
        }
      }

      let turnRate = 0;
      if (targetTrailPoint) {
        shark.isChasing = true;
        const toTarget = new THREE.Vector3()
          .subVectors(targetTrailPoint, shark.position)
          .sub(shark.normal.clone().multiplyScalar(targetTrailPoint.dot(shark.normal)));
        if (toTarget.lengthSq() > 1e-5) {
          toTarget.normalize();
          const cross = new THREE.Vector3().crossVectors(shark.normal, shark.heading);
          const angle = Math.atan2(cross.dot(toTarget), shark.heading.dot(toTarget));
          turnRate = THREE.MathUtils.clamp(angle * 2.8, -1.0, 1.0) * CONFIG.TURN_SPEED * 1.15;
        }
      } else {
        shark.isChasing = false;
        // Curved figure-8 / sinusoidal spherical patrol path
        turnRate = Math.sin(shark.patrolTimer * 0.75 + shark.id) * 0.65 * shark.patrolCurveSign;
      }

      // Obstacle avoidance for sharks
      for (let o = 0; o < this.sphereWorld.obstacles.length; o++) {
        const obs = this.sphereWorld.obstacles[o];
        const dist = shark.normal.angleTo(obs.normal) * this.radius;
        if (dist < obs.radius + 6.5) {
          const toObs = new THREE.Vector3().subVectors(obs.position, shark.position);
          const leftDir = new THREE.Vector3().crossVectors(shark.normal, shark.heading).normalize();
          turnRate = (leftDir.dot(toObs) > 0 ? -1.0 : 1.0) * CONFIG.TURN_SPEED * 1.4;
          break;
        }
      }

      // Advance shark along sphere tangent
      shark.heading.applyAxisAngle(shark.normal, turnRate * dt);
      const speed = shark.isChasing ? shark.chaseSpeed : shark.speed;
      const binormal = new THREE.Vector3().crossVectors(shark.normal, shark.heading).normalize();
      const stepAngle = (speed * dt) / this.radius;

      shark.normal.applyAxisAngle(binormal, stepAngle).normalize();
      shark.heading.applyAxisAngle(binormal, stepAngle);
      shark.heading.sub(shark.normal.clone().multiplyScalar(shark.heading.dot(shark.normal))).normalize();
      shark.position.copy(shark.normal).multiplyScalar(this.radius);

      // Sync shark mesh orientation + swimming tail sway
      const sway = Math.sin(elapsedTime * (shark.isChasing ? 14.0 : 8.0) + shark.id) * 0.14;
      shark.mesh.position.copy(shark.position);
      const right = new THREE.Vector3().crossVectors(shark.heading, shark.normal).normalize();
      const rotMat = new THREE.Matrix4().makeBasis(right, shark.normal, shark.heading);
      shark.mesh.quaternion.setFromRotationMatrix(rotMat);
      shark.mesh.rotateY(sway);

      // Check if shark bites/intersects any exposed trail!
      if (shark.biteCooldown <= 0) {
        for (let c = 0; c < allContenders.length; c++) {
          const contender = allContenders[c];
          if (contender.isEliminated || !contender.isOutside || contender.isCloaked()) continue;

          let bitten = false;
          for (let p = 0; p < contender.trailPoints.length; p++) {
            if (shark.position.distanceTo(contender.trailPoints[p]) < 2.35) {
              bitten = true;
              break;
            }
          }

          if (bitten) {
            shark.biteCooldown = 3.0;
            this.spawnShockwaveRing(shark.normal, 0xff2a55, 16.0, 0.75);
            this.spawnShockwaveRing(contender.normal, 0xffbe0b, 12.0, 0.65);

            if (CONFIG.SHARK_LETHAL_BITE) {
              if (onEliminated) {
                onEliminated(contender, null, 'Bitten by a Patrolling Shark');
              }
            } else {
              // Non-lethal bite: snaps active trail and sends a shockwave that stuns contender for 0.8s!
              contender.clearTrail();
              contender.stunTimer = CONFIG.SHARK_STUN_DURATION;
              if (onSharkBite) {
                onSharkBite(contender, shark);
              }
            }
            break;
          }
        }
      }
    }
  }
}

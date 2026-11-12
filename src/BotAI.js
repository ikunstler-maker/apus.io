// ============================================================================
// APUS.IO — AUTONOMOUS AI BOT CONTENDERS & GHOST REALM HAUNTING BEHAVIOR
// ============================================================================
import * as THREE from 'three';
import { CONFIG } from './Config.js';
import { Contender } from './PlayerController.js';

export class BotContender extends Contender {
  constructor(id, scene, territoryGrid, sphereWorld) {
    super(id, scene, territoryGrid, sphereWorld, false);

    // Assign a distinct Derpy Nickname & randomized 4-part loadout
    this.name = CONFIG.DERPY_NICKNAMES[(id - 1) % CONFIG.DERPY_NICKNAMES.length];
    this.figurineId = CONFIG.FIGURINES[(id - 1) % CONFIG.FIGURINES.length].id;
    this.patternId = CONFIG.PATTERNS[id % CONFIG.PATTERNS.length].id;
    this.borderEffectId = CONFIG.BORDER_EFFECTS[id % CONFIG.BORDER_EFFECTS.length].id;

    this.applyLoadout({
      nickname: this.name,
      baseColor: this.colorHex,
      figurineId: this.figurineId,
      patternId: this.patternId,
      borderEffectId: this.borderEffectId
    }, false);

    // AI Personality traits (scaled dynamically by CONFIG.DIFFICULTY)
    this.baseAggression = 0.35 + Math.random() * 0.55;
    this.aggression = this.baseAggression;
    this.maxVentureTime = 2.4 + Math.random() * 2.4;
    this.ventureTimer = 0;
    this.loopArcDirection = Math.random() < 0.5 ? 1 : -1;
    this.aiState = 'EXPAND'; // 'EXPAND' | 'RETURN' | 'HUNT'
    this.homeAnchorNormal = new THREE.Vector3(0, 0, 1);
    this.respawnDelayTimer = 0;
    this.ghostEmoteCooldown = 2.0 + Math.random() * 3.0;
  }

  spawn(spawnNormal) {
    super.spawn(spawnNormal);
    this.homeAnchorNormal.copy(this.normal);
    this.ventureTimer = 0;
    this.aiState = 'EXPAND';
    this.loopArcDirection = Math.random() < 0.5 ? 1 : -1;
    const diffPreset = CONFIG.DIFFICULTY_PRESETS[CONFIG.DIFFICULTY] || CONFIG.DIFFICULTY_PRESETS.normal;
    this.aggression = THREE.MathUtils.clamp(this.baseAggression * (diffPreset.botAggression || 0.65) * 1.4, 0.15, 0.98);
    this.maxVentureTime = (2.1 + Math.random() * 2.2) * (0.75 + this.aggression * 0.5);
  }

  /**
   * Evaluates spherical surroundings and sets `this.turnInput` in `[-1, 1]`.
   * Scales AI aggression and responsiveness according to `CONFIG.DIFFICULTY`.
   * Also controls ghostly wandering & Boo! emotes while the bot is in the Ghost Realm!
   */
  updateAI(dt, allContenders, hazardsAndBonuses) {
    if (this.state === 'GHOST') {
      // Ghost Realm AI: glide playfully across the sphere and occasionally perform a Ghost Boo Spin!
      this.turnInput = Math.sin(performance.now() * 0.0014 + this.id * 1.7) * 0.55;
      this.ghostEmoteCooldown -= dt;
      if (this.ghostEmoteCooldown <= 0) {
        this.ghostEmoteCooldown = 3.5 + Math.random() * 4.0;
        this.triggerGhostEmote();
      }
      return;
    }

    const diffPreset = CONFIG.DIFFICULTY_PRESETS[CONFIG.DIFFICULTY] || CONFIG.DIFFICULTY_PRESETS.normal;
    this.aggression = THREE.MathUtils.clamp(this.baseAggression * (diffPreset.botAggression || 0.65) * 1.4, 0.15, 0.98);

    if (!this.isOutside) {
      this.homeAnchorNormal.copy(this.normal);
      this.ventureTimer = 0;
      if (this.aiState === 'RETURN') {
        this.aiState = 'EXPAND';
        this.loopArcDirection = Math.random() < 0.5 ? 1 : -1;
        this.maxVentureTime = (2.0 + Math.random() * 2.4) * (0.75 + this.aggression * 0.5);
      }
    } else {
      this.ventureTimer += dt;
    }

    // 1. Check gentle obstacle avoidance ahead
    const avoidSteer = this._computeObstacleAvoidance();
    if (Math.abs(avoidSteer) > 0.15) {
      this.turnInput = avoidSteer;
      return;
    }

    // 2. Return to base if trail gets long or threatened
    const threatened = this.isOutside && this._isTrailThreatened(allContenders, hazardsAndBonuses);
    const maxTrailLen = CONFIG.DIFFICULTY === 'easy' ? 24 : (CONFIG.DIFFICULTY === 'hard' ? 42 : 34);
    if (this.isOutside && (this.ventureTimer >= this.maxVentureTime || this.trailPoints.length > maxTrailLen || threatened)) {
      this.aiState = 'RETURN';
    }

    // 3. Look for nearby vulnerable enemy trails to sever (respecting Phantom Cloak & Difficulty!)
    let targetWorldPos = null;
    if (!threatened && this.trailPoints.length < 18 && Math.random() < this.aggression) {
      const huntPoint = this._findVulnerableTrailTarget(allContenders);
      if (huntPoint) {
        this.aiState = 'HUNT';
        targetWorldPos = huntPoint;
      }
    }

    // 4. Look for nearby Power-Up Buoys
    if (!targetWorldPos && this.aiState !== 'RETURN' && hazardsAndBonuses) {
      const buoyPos = this._findNearbyPowerUp(hazardsAndBonuses.powerUps);
      if (buoyPos) {
        targetWorldPos = buoyPos;
      }
    }

    // 5. Execute state steering
    if (this.aiState === 'RETURN') {
      const nearestHome = this.territoryGrid.findNearestOwnedPoint(this.id, this.position);
      const returnTarget = nearestHome || this.homeAnchorNormal.clone().multiplyScalar(this.radius);
      this.turnInput = this._steerTowardPointOnSphere(returnTarget);

      if (!CONFIG.ALLOW_SELF_CROSS && this.trailPoints.length > 8) {
        const selfAvoid = this._computeSelfTrailAvoidance();
        if (Math.abs(selfAvoid) > 0.1) {
          this.turnInput = selfAvoid;
        }
      }
    } else if (targetWorldPos) {
      this.turnInput = this._steerTowardPointOnSphere(targetWorldPos);
    } else {
      if (!this.isOutside) {
        this.turnInput = Math.sin(performance.now() * 0.001 + this.id) * 0.25;
      } else {
        const progress = Math.min(1.0, this.ventureTimer / this.maxVentureTime);
        const curveStrength = 0.38 + progress * 0.48;
        this.turnInput = this.loopArcDirection * curveStrength;
      }
    }
  }

  _steerTowardPointOnSphere(targetPos) {
    const toTarget = new THREE.Vector3().subVectors(targetPos, this.position);
    toTarget.sub(this.normal.clone().multiplyScalar(toTarget.dot(this.normal)));
    if (toTarget.lengthSq() < 1e-5) return 0;
    toTarget.normalize();

    const cross = new THREE.Vector3().crossVectors(this.normal, this.heading);
    const sinAngle = cross.dot(toTarget);
    const cosAngle = this.heading.dot(toTarget);
    const angle = Math.atan2(sinAngle, cosAngle);
    return THREE.MathUtils.clamp(angle * 2.2, -1.0, 1.0);
  }

  _computeObstacleAvoidance() {
    const lookAheadDist = 11.5;
    const binormal = new THREE.Vector3().crossVectors(this.normal, this.heading).normalize();
    const feelerNormal = this.normal
      .clone()
      .applyAxisAngle(binormal, lookAheadDist / this.radius)
      .normalize();

    const obstacles = this.sphereWorld.obstacles;
    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      const dist = feelerNormal.angleTo(obs.normal) * this.radius;
      if (dist < obs.radius + 5.5) {
        const toObs = new THREE.Vector3().subVectors(obs.position, this.position);
        toObs.sub(this.normal.clone().multiplyScalar(toObs.dot(this.normal))).normalize();
        const leftDir = new THREE.Vector3().crossVectors(this.normal, this.heading).normalize();
        return leftDir.dot(toObs) > 0 ? -1.0 : 1.0;
      }
    }
    return 0;
  }

  _computeSelfTrailAvoidance() {
    const lookAheadPos = this.position.clone().addScaledVector(this.heading, 5.5);
    const safeLimit = this.trailPoints.length - 7;
    for (let i = 0; i < safeLimit; i += 2) {
      const pt = this.trailPoints[i];
      if (lookAheadPos.distanceTo(pt) < 4.5) {
        const toPt = new THREE.Vector3().subVectors(pt, this.position);
        const leftDir = new THREE.Vector3().crossVectors(this.normal, this.heading).normalize();
        return leftDir.dot(toPt) > 0 ? -1.0 : 1.0;
      }
    }
    return 0;
  }

  _isTrailThreatened(allContenders, hazardsAndBonuses) {
    if (!this.isOutside || this.trailPoints.length < 3) return false;
    const midPt = this.trailPoints[Math.floor(this.trailPoints.length * 0.5)];

    for (let i = 0; i < allContenders.length; i++) {
      const other = allContenders[i];
      if (other === this || other.state === 'GHOST') continue;
      if (other.position.distanceTo(midPt) < 16.0) return true;
    }

    if (hazardsAndBonuses && hazardsAndBonuses.sharks) {
      for (let i = 0; i < hazardsAndBonuses.sharks.length; i++) {
        const shark = hazardsAndBonuses.sharks[i];
        if (shark.position.distanceTo(midPt) < 18.0) return true;
      }
    }
    return false;
  }

  _findVulnerableTrailTarget(allContenders) {
    let bestPt = null;
    let bestDist = 30.0 * (0.45 + this.aggression * 0.75);

    for (let i = 0; i < allContenders.length; i++) {
      const other = allContenders[i];
      if (other === this || other.state === 'GHOST' || !other.isOutside) continue;
      if (other.isCloaked()) continue;
      if (other.trailPoints.length < 4) continue;

      const sampleIdx = Math.floor(other.trailPoints.length * 0.6);
      const pt = other.trailPoints[sampleIdx];
      const d = this.position.distanceTo(pt);
      if (d < bestDist) {
        bestDist = d;
        bestPt = pt;
      }
    }
    return bestPt;
  }

  _findNearbyPowerUp(powerUps) {
    if (!powerUps) return null;
    let bestPos = null;
    let bestDist = 22.0;

    for (let i = 0; i < powerUps.length; i++) {
      const p = powerUps[i];
      if (!p.active) continue;
      const d = this.position.distanceTo(p.position);
      if (d < bestDist) {
        bestDist = d;
        bestPos = p.position;
      }
    }
    return bestPos;
  }
}

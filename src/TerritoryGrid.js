// ============================================================================
// APUS.IO — SPHERICAL GEODESIC GRID, STRICT STATE SEPARATION & BFS FLOOD-FILL
// ============================================================================
import * as THREE from 'three';
import { CONFIG, getPatternIndex, getBorderEffectIndex } from './Config.js';
import { createTerritoryMaterial } from './Shaders.js';

export class TerritoryGrid {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Vector3} sunDirection
   */
  constructor(scene, sunDirection) {
    this.scene = scene;
    this.radius = CONFIG.SPHERE_RADIUS;
    this.detail = CONFIG.SUBDIVISION_DETAIL; // 15,680 geodesic cells

    const baseGeo = new THREE.IcosahedronGeometry(this.radius, this.detail);
    this.geometry = baseGeo.index ? baseGeo.toNonIndexed() : baseGeo;
    this.geometry.computeVertexNormals();

    const posAttr = this.geometry.attributes.position;
    this.cellCount = posAttr.count / 3; // 15,680 cells

    // Per-cell logical state arrays (STRICTLY SEPARATED: owner vs trailOwner)
    this.cellNormals = new Float32Array(this.cellCount * 3);
    this.owner = new Int16Array(this.cellCount).fill(-1);      // -1 = neutral water, >= 0 = contenderId
    this.trailOwner = new Int16Array(this.cellCount).fill(-1); // -1 = none, >= 0 = active trail contenderId
    this.obstacle = new Uint8Array(this.cellCount).fill(0);    // 0 = navigable water, 1 = impassable island/cliff/reef

    const maxContenders = Math.max(16, CONFIG.CONTENDER_PALETTE.length);

    // Explicit Set tracking per contender for O(1) size checks & strict state separation
    this.ownedCellsSets = Array.from({ length: maxContenders }, () => new Set());
    this.activeTrailCellsSets = Array.from({ length: maxContenders }, () => new Set());

    this.contenderRGB = Array.from({ length: maxContenders }, (_, i) => {
      const p = CONFIG.CONTENDER_PALETTE[i % CONFIG.CONTENDER_PALETTE.length];
      const c = new THREE.Color(p.color);
      return [c.r, c.g, c.b];
    });
    this.contenderPatternIndex = new Float32Array(maxContenders);
    this.contenderBorderIndex = new Float32Array(maxContenders);
    for (let i = 0; i < maxContenders; i++) {
      this.contenderPatternIndex[i] = i % CONFIG.PATTERNS.length;
      this.contenderBorderIndex[i] = i % CONFIG.BORDER_EFFECTS.length;
    }

    this.ownerCounts = new Int32Array(maxContenders).fill(0);
    this.navigableCellCount = this.cellCount;

    // GPU Vertex Attributes for Territory Surface Mat Shader
    const vertexCount = this.cellCount * 3;
    this.colorArray = new Float32Array(vertexCount * 3);
    this.alphaArray = new Float32Array(vertexCount);
    this.borderArray = new Float32Array(vertexCount);
    this.patternArray = new Float32Array(vertexCount);
    this.borderTypeArray = new Float32Array(vertexCount);

    this.colorAttr = new THREE.BufferAttribute(this.colorArray, 3);
    this.alphaAttr = new THREE.BufferAttribute(this.alphaArray, 1);
    this.borderAttr = new THREE.BufferAttribute(this.borderArray, 1);
    this.patternAttr = new THREE.BufferAttribute(this.patternArray, 1);
    this.borderTypeAttr = new THREE.BufferAttribute(this.borderTypeArray, 1);

    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr.setUsage(THREE.DynamicDrawUsage);
    this.borderAttr.setUsage(THREE.DynamicDrawUsage);
    this.patternAttr.setUsage(THREE.DynamicDrawUsage);
    this.borderTypeAttr.setUsage(THREE.DynamicDrawUsage);

    this.geometry.setAttribute('aColor', this.colorAttr);
    this.geometry.setAttribute('aAlpha', this.alphaAttr);
    this.geometry.setAttribute('aBorder', this.borderAttr);
    this.geometry.setAttribute('aPattern', this.patternAttr);
    this.geometry.setAttribute('aBorderType', this.borderTypeAttr);

    this.material = createTerritoryMaterial(sunDirection);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = 2;
    this.scene.add(this.mesh);

    this.bfsVisited = new Int32Array(this.cellCount);
    this.bfsQueue = new Int32Array(this.cellCount);
    this.bfsStamp = 1;

    this._buildTopologyAndSpatialIndex(posAttr);
  }

  /**
   * Returns the Set of owned cell indices for `contenderId`.
   */
  getOwnedCellsSet(contenderId) {
    return this.ownedCellsSets[contenderId];
  }

  /**
   * Returns the Set of active trail cell indices for `contenderId`.
   */
  getActiveTrailCellsSet(contenderId) {
    return this.activeTrailCellsSets[contenderId];
  }

  setContenderStyle(contenderId, colorHexOrInt, patternId = 'solid_gloss', borderEffectId = 'bubbly_foam', syncGPU = false) {
    const c = new THREE.Color(colorHexOrInt);
    this.contenderRGB[contenderId] = [c.r, c.g, c.b];
    this.contenderPatternIndex[contenderId] = getPatternIndex(patternId);
    this.contenderBorderIndex[contenderId] = getBorderEffectIndex(borderEffectId);
    if (syncGPU) {
      this.syncBuffersToGPU();
    }
  }

  _buildTopologyAndSpatialIndex(posAttr) {
    const pos = posAttr.array;

    this.bucketRes = 24;
    const totalBuckets = 6 * this.bucketRes * this.bucketRes;
    this.buckets = Array.from({ length: totalBuckets }, () => []);

    const quantScale = 1000;
    const vertexToCells = new Map();

    const getVertexKey = (vx, vy, vz) => {
      const qx = Math.round(vx * quantScale);
      const qy = Math.round(vy * quantScale);
      const qz = Math.round(vz * quantScale);
      return `${qx},${qy},${qz}`;
    };

    const cellVertKeys = new Array(this.cellCount);

    for (let c = 0; c < this.cellCount; c++) {
      const i0 = c * 9;
      const ax = pos[i0],     ay = pos[i0 + 1], az = pos[i0 + 2];
      const bx = pos[i0 + 3], by = pos[i0 + 4], bz = pos[i0 + 5];
      const cx = pos[i0 + 6], cy = pos[i0 + 7], cz = pos[i0 + 8];

      let nx = (ax + bx + cx) / 3;
      let ny = (ay + by + cy) / 3;
      let nz = (az + bz + cz) / 3;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;

      this.cellNormals[c * 3]     = nx;
      this.cellNormals[c * 3 + 1] = ny;
      this.cellNormals[c * 3 + 2] = nz;

      const bIdx = this._normalToBucketIndex(nx, ny, nz);
      this.buckets[bIdx].push(c);

      const k0 = getVertexKey(ax, ay, az);
      const k1 = getVertexKey(bx, by, bz);
      const k2 = getVertexKey(cx, cy, cz);
      cellVertKeys[c] = [k0, k1, k2];

      for (const k of cellVertKeys[c]) {
        let list = vertexToCells.get(k);
        if (!list) {
          list = [];
          vertexToCells.set(k, list);
        }
        list.push(c);
      }
    }

    this.edgeNeighbors = new Int32Array(this.cellCount * 3).fill(-1);
    for (let c = 0; c < this.cellCount; c++) {
      const [k0, k1, k2] = cellVertKeys[c];
      const candidates = new Map();

      for (const k of [k0, k1, k2]) {
        const list = vertexToCells.get(k);
        for (let i = 0; i < list.length; i++) {
          const other = list[i];
          if (other === c) continue;
          candidates.set(other, (candidates.get(other) || 0) + 1);
        }
      }

      let edgeSlot = 0;
      for (const [other, sharedVerts] of candidates.entries()) {
        if (sharedVerts >= 2 && edgeSlot < 3) {
          this.edgeNeighbors[c * 3 + edgeSlot] = other;
          edgeSlot++;
        }
      }
    }
  }

  _normalToBucketIndex(nx, ny, nz) {
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    let face = 0, u = 0, v = 0, ma = 1;
    if (ax >= ay && ax >= az) {
      face = nx > 0 ? 0 : 1;
      ma = ax; u = ny / ma; v = nz / ma;
    } else if (ay >= ax && ay >= az) {
      face = ny > 0 ? 2 : 3;
      ma = ay; u = nx / ma; v = nz / ma;
    } else {
      face = nz > 0 ? 4 : 5;
      ma = az; u = nx / ma; v = ny / ma;
    }
    const res = this.bucketRes;
    const iu = Math.min(res - 1, Math.max(0, Math.floor((u * 0.5 + 0.5) * res)));
    const iv = Math.min(res - 1, Math.max(0, Math.floor((v * 0.5 + 0.5) * res)));
    return face * res * res + iv * res + iu;
  }

  getCellAtPosition(posOrNormal) {
    const len = posOrNormal.length() || 1;
    const nx = posOrNormal.x / len;
    const ny = posOrNormal.y / len;
    const nz = posOrNormal.z / len;

    const bIdx = this._normalToBucketIndex(nx, ny, nz);
    const res = this.bucketRes;
    const face = Math.floor(bIdx / (res * res));
    const rem = bIdx % (res * res);
    const iv = Math.floor(rem / res);
    const iu = rem % res;

    let bestCell = -1;
    let bestDot = -2.0;

    for (let dv = -1; dv <= 1; dv++) {
      const nv = iv + dv;
      if (nv < 0 || nv >= res) continue;
      for (let du = -1; du <= 1; du++) {
        const nu = iu + du;
        if (nu < 0 || nu >= res) continue;
        const bucket = this.buckets[face * res * res + nv * res + nu];
        for (let i = 0; i < bucket.length; i++) {
          const c = bucket[i];
          const cnIdx = c * 3;
          const dot = nx * this.cellNormals[cnIdx] +
                      ny * this.cellNormals[cnIdx + 1] +
                      nz * this.cellNormals[cnIdx + 2];
          if (dot > bestDot) {
            bestDot = dot;
            bestCell = c;
          }
        }
      }
    }

    if (bestCell === -1) {
      for (let c = 0; c < this.cellCount; c++) {
        const cnIdx = c * 3;
        const dot = nx * this.cellNormals[cnIdx] +
                    ny * this.cellNormals[cnIdx + 1] +
                    nz * this.cellNormals[cnIdx + 2];
        if (dot > bestDot) {
          bestDot = dot;
          bestCell = c;
        }
      }
    }
    return bestCell;
  }

  getCellsInRadius(posOrNormal, worldRadius) {
    const len = posOrNormal.length() || 1;
    const nx = posOrNormal.x / len;
    const ny = posOrNormal.y / len;
    const nz = posOrNormal.z / len;

    const angularRadius = worldRadius / this.radius;
    const cosThreshold = Math.cos(angularRadius);

    const startCell = this.getCellAtPosition(posOrNormal);
    if (startCell < 0) return [];

    this.bfsStamp = (this.bfsStamp + 1) | 0;
    const stamp = this.bfsStamp;

    const result = [];
    let head = 0, tail = 0;
    this.bfsQueue[tail++] = startCell;
    this.bfsVisited[startCell] = stamp;

    while (head < tail) {
      const c = this.bfsQueue[head++];
      result.push(c);

      const base = c * 3;
      for (let i = 0; i < 3; i++) {
        const nb = this.edgeNeighbors[base + i];
        if (nb < 0 || this.bfsVisited[nb] === stamp) continue;
        this.bfsVisited[nb] = stamp;

        const cnIdx = nb * 3;
        const dot = nx * this.cellNormals[cnIdx] +
                    ny * this.cellNormals[cnIdx + 1] +
                    nz * this.cellNormals[cnIdx + 2];
        if (dot >= cosThreshold) {
          this.bfsQueue[tail++] = nb;
        }
      }
    }
    return result;
  }

  /**
   * Note: We keep `obstacle` tracking mild on the inner core so players can still
   * capture territory right up to the sandy shoreline of every island!
   */
  markObstacleDisk(normalVec, worldRadius) {
    const cells = this.getCellsInRadius(normalVec, worldRadius * 0.65);
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (this.obstacle[c] === 0) {
        this.obstacle[c] = 1;
        this.navigableCellCount = Math.max(1, this.navigableCellCount - 1);
      }
    }
  }

  /**
   * Updates `this.owner[cellIdx]` and synchronizes `this.ownedCellsSets` + `this.ownerCounts`.
   */
  _setCellOwner(cellIdx, newOwnerId) {
    if (this.obstacle[cellIdx] !== 0) return false;
    const prevOwner = this.owner[cellIdx];
    if (prevOwner === newOwnerId) return false;

    if (prevOwner >= 0) {
      this.ownerCounts[prevOwner] = Math.max(0, this.ownerCounts[prevOwner] - 1);
      this.ownedCellsSets[prevOwner]?.delete(cellIdx);
    }
    this.owner[cellIdx] = newOwnerId;
    if (newOwnerId >= 0) {
      this.ownerCounts[newOwnerId]++;
      this.ownedCellsSets[newOwnerId]?.add(cellIdx);
    }
    return true;
  }

  /**
   * Claims a circular disk of cells for `contenderId`.
   * If `contenderId`'s center lands near an obstacle, also claims unobstructed cells around it.
   */
  claimDisk(posOrNormal, worldRadius, contenderId, syncGPU = true) {
    const cells = this.getCellsInRadius(posOrNormal, worldRadius);
    let changed = false;
    let claimedCount = 0;
    for (let i = 0; i < cells.length; i++) {
      if (this._setCellOwner(cells[i], contenderId)) {
        changed = true;
      }
      if (this.owner[cells[i]] === contenderId) {
        claimedCount++;
      }
    }

    // Fallback: if all cells in `worldRadius` were marked obstacle, force-claim nearest cell ignoring obstacle flag
    if (claimedCount === 0 && cells.length > 0) {
      for (let i = 0; i < Math.min(cells.length, 16); i++) {
        const c = cells[i];
        this.obstacle[c] = 0;
        if (this._setCellOwner(c, contenderId)) {
          changed = true;
        }
      }
    }

    if (changed && syncGPU) {
      this.syncBuffersToGPU();
    }
    return changed;
  }

  /**
   * Stamps active trail cells into `this.trailOwner` and `this.activeTrailCellsSets[contenderId]`
   * STRICTLY SEPARATELY from `this.owner` / `ownedCellsSets`!
   */
  stampTrailSegment(prevPos, currPos, contenderId, worldWidth, claimImmediately = false) {
    const dist = prevPos.distanceTo(currPos);
    const steps = Math.max(1, Math.ceil(dist / 0.8));
    const tempVec = new THREE.Vector3();
    let changedTerritory = false;

    const brushRadius = Math.max(1.85, worldWidth * 0.72);
    const trailSet = this.activeTrailCellsSets[contenderId];

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      tempVec.lerpVectors(prevPos, currPos, t).normalize();
      const cells = this.getCellsInRadius(tempVec, brushRadius);
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        if (this.obstacle[c] !== 0) continue;
        this.trailOwner[c] = contenderId;
        if (trailSet) trailSet.add(c);
        if (claimImmediately && this._setCellOwner(c, contenderId)) {
          changedTerritory = true;
        }
      }
    }

    if (changedTerritory) {
      this.syncBuffersToGPU();
    }
  }

  /**
   * STRICT STATE SEPARATION:
   * Clears ONLY `activeTrailCells` (`this.trailOwner`) for `contenderId`.
   * NEVER clears, resets, or modifies `this.owner` or `ownedCellsSets`!
   */
  clearTrailMarkers(contenderId) {
    const trailSet = this.activeTrailCellsSets[contenderId];
    if (trailSet && trailSet.size > 0) {
      for (const c of trailSet) {
        if (this.trailOwner[c] === contenderId) {
          this.trailOwner[c] = -1;
        }
      }
      trailSet.clear();
    } else {
      for (let c = 0; c < this.cellCount; c++) {
        if (this.trailOwner[c] === contenderId) {
          this.trailOwner[c] = -1;
        }
      }
    }
  }

  /**
   * Wipes a contender's owned territory (`ownedCells`) back to neutral water (-1).
   * Called ONLY upon full elimination into the Ghost Realm or manual Reset [R].
   */
  clearContenderTerritory(contenderId) {
    this.clearTrailMarkers(contenderId);

    let changed = false;
    const ownedSet = this.ownedCellsSets[contenderId];
    if (ownedSet && ownedSet.size > 0) {
      for (const c of ownedSet) {
        if (this.owner[c] === contenderId) {
          this.owner[c] = -1;
          changed = true;
        }
      }
      ownedSet.clear();
    } else {
      for (let c = 0; c < this.cellCount; c++) {
        if (this.owner[c] === contenderId) {
          this.owner[c] = -1;
          changed = true;
        }
      }
    }

    this.ownerCounts[contenderId] = 0;
    if (changed) {
      this.syncBuffersToGPU();
    }
  }

  /**
   * TERRITORY INTEGRITY FALLBACK (ANTI-SOFTLOCK GUARD):
   * Runs every tick for every `ALIVE` contender. If `ownedCells.size === 0` while `ALIVE`
   * (e.g., if an enemy stole 100% of their base while their trail was cut), immediately stamps
   * a fresh circular starter island (`radius = STARTER_ZONE_RADIUS`) right underneath them
   * so a living player is NEVER left without a base and can ALWAYS draw trails!
   */
  ensureContenderHasBase(contender) {
    if (!contender || contender.state !== 'ALIVE') return false;
    const ownedSet = this.ownedCellsSets[contender.id];
    if (!ownedSet || ownedSet.size === 0 || this.ownerCounts[contender.id] <= 0) {
      this.claimDisk(contender.normal, CONFIG.STARTER_ZONE_RADIUS, contender.id, true);
      return true;
    }
    return false;
  }

  /**
   * Closes a contender's active trail loop and executes the spherical BFS Flood-Fill.
   */
  closeLoopAndFloodFill(contenderId, trailPoints, trailWidth = CONFIG.NORMAL_TRAIL_WIDTH) {
    let newlyCaptured = 0;
    const brushRadius = Math.max(1.95, trailWidth * 0.72);

    for (let i = 0; i < trailPoints.length; i++) {
      const p = trailPoints[i];
      const cells = this.getCellsInRadius(p, brushRadius);
      for (let j = 0; j < cells.length; j++) {
        if (this._setCellOwner(cells[j], contenderId)) {
          newlyCaptured++;
        }
      }
    }

    const trailSet = this.activeTrailCellsSets[contenderId];
    if (trailSet && trailSet.size > 0) {
      for (const c of trailSet) {
        this.trailOwner[c] = -1;
        if (this._setCellOwner(c, contenderId)) {
          newlyCaptured++;
        }
      }
      trailSet.clear();
    } else {
      for (let c = 0; c < this.cellCount; c++) {
        if (this.trailOwner[c] === contenderId) {
          this.trailOwner[c] = -1;
          if (this._setCellOwner(c, contenderId)) {
            newlyCaptured++;
          }
        }
      }
    }

    this.bfsStamp = (this.bfsStamp + 1) | 0;
    const stamp = this.bfsStamp;

    for (let c = 0; c < this.cellCount; c++) {
      if (this.owner[c] === contenderId) {
        this.bfsVisited[c] = stamp;
      }
    }

    const hemisphereThreshold = Math.floor(this.cellCount * 0.46);

    for (let startCell = 0; startCell < this.cellCount; startCell++) {
      if (this.bfsVisited[startCell] === stamp) continue;

      let head = 0;
      let tail = 0;
      this.bfsQueue[tail++] = startCell;
      this.bfsVisited[startCell] = stamp;

      while (head < tail) {
        const curr = this.bfsQueue[head++];
        const base = curr * 3;

        const n0 = this.edgeNeighbors[base];
        if (n0 >= 0 && this.bfsVisited[n0] !== stamp) {
          this.bfsVisited[n0] = stamp;
          this.bfsQueue[tail++] = n0;
        }
        const n1 = this.edgeNeighbors[base + 1];
        if (n1 >= 0 && this.bfsVisited[n1] !== stamp) {
          this.bfsVisited[n1] = stamp;
          this.bfsQueue[tail++] = n1;
        }
        const n2 = this.edgeNeighbors[base + 2];
        if (n2 >= 0 && this.bfsVisited[n2] !== stamp) {
          this.bfsVisited[n2] = stamp;
          this.bfsQueue[tail++] = n2;
        }
      }

      if (tail > 0 && tail < hemisphereThreshold) {
        for (let i = 0; i < tail; i++) {
          const cellToClaim = this.bfsQueue[i];
          if (this._setCellOwner(cellToClaim, contenderId)) {
            newlyCaptured++;
          }
        }
      }
    }

    this.syncBuffersToGPU();
    return newlyCaptured;
  }

  /**
   * Finds the nearest 3D point on the sphere belonging to `contenderId`'s `ownedCells`.
   */
  findNearestOwnedPoint(contenderId, currentPos) {
    const dir = currentPos.clone().normalize();
    let bestCell = -1;
    let bestDot = -2.0;

    const ownedSet = this.ownedCellsSets[contenderId];
    if (ownedSet && ownedSet.size > 0) {
      for (const c of ownedSet) {
        const idx = c * 3;
        const dot = dir.x * this.cellNormals[idx] +
                    dir.y * this.cellNormals[idx + 1] +
                    dir.z * this.cellNormals[idx + 2];
        if (dot > bestDot) {
          bestDot = dot;
          bestCell = c;
        }
      }
    } else {
      for (let c = 0; c < this.cellCount; c++) {
        if (this.owner[c] !== contenderId) continue;
        const idx = c * 3;
        const dot = dir.x * this.cellNormals[idx] +
                    dir.y * this.cellNormals[idx + 1] +
                    dir.z * this.cellNormals[idx + 2];
        if (dot > bestDot) {
          bestDot = dot;
          bestCell = c;
        }
      }
    }

    if (bestCell < 0) return null;
    const idx = bestCell * 3;
    return new THREE.Vector3(
      this.cellNormals[idx] * this.radius,
      this.cellNormals[idx + 1] * this.radius,
      this.cellNormals[idx + 2] * this.radius
    );
  }

  getOwnershipPercentage(contenderId) {
    if (contenderId < 0 || contenderId >= this.ownerCounts.length) return 0;
    return (this.ownerCounts[contenderId] / this.navigableCellCount) * 100;
  }

  syncBuffersToGPU() {
    const colors = this.colorArray;
    const alphas = this.alphaArray;
    const borders = this.borderArray;
    const patterns = this.patternArray;
    const borderTypes = this.borderTypeArray;
    const ownerArr = this.owner;
    const edgeArr = this.edgeNeighbors;
    const palette = this.contenderRGB;
    const patIdxArr = this.contenderPatternIndex;
    const brdIdxArr = this.contenderBorderIndex;

    for (let c = 0; c < this.cellCount; c++) {
      const own = ownerArr[c];
      const vBase = c * 3;
      const cBase = c * 9;

      if (own < 0) {
        alphas[vBase]     = 0.0;
        alphas[vBase + 1] = 0.0;
        alphas[vBase + 2] = 0.0;
        borders[vBase]     = 0.0;
        borders[vBase + 1] = 0.0;
        borders[vBase + 2] = 0.0;
        continue;
      }

      const rgb = palette[own] || [1, 1, 1];
      const r = rgb[0], g = rgb[1], b = rgb[2];

      colors[cBase]     = r; colors[cBase + 1] = g; colors[cBase + 2] = b;
      colors[cBase + 3] = r; colors[cBase + 4] = g; colors[cBase + 5] = b;
      colors[cBase + 6] = r; colors[cBase + 7] = g; colors[cBase + 8] = b;

      alphas[vBase]     = 1.0;
      alphas[vBase + 1] = 1.0;
      alphas[vBase + 2] = 1.0;

      const patVal = patIdxArr[own] || 0;
      patterns[vBase]     = patVal;
      patterns[vBase + 1] = patVal;
      patterns[vBase + 2] = patVal;

      const brdTypeVal = brdIdxArr[own] || 0;
      borderTypes[vBase]     = brdTypeVal;
      borderTypes[vBase + 1] = brdTypeVal;
      borderTypes[vBase + 2] = brdTypeVal;

      const n0 = edgeArr[vBase];
      const n1 = edgeArr[vBase + 1];
      const n2 = edgeArr[vBase + 2];

      const isBorder = (n0 < 0 || ownerArr[n0] !== own) ||
                       (n1 < 0 || ownerArr[n1] !== own) ||
                       (n2 < 0 || ownerArr[n2] !== own);

      const borderVal = isBorder ? 1.0 : 0.0;
      borders[vBase]     = borderVal;
      borders[vBase + 1] = borderVal;
      borders[vBase + 2] = borderVal;
    }

    this.colorAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.borderAttr.needsUpdate = true;
    this.patternAttr.needsUpdate = true;
    this.borderTypeAttr.needsUpdate = true;
  }

  update(elapsedTime) {
    this.material.uniforms.uTime.value = elapsedTime;
  }
}

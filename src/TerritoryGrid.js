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
    this.owner = new Int16Array(this.cellCount).fill(-1);          // -1 = neutral water, >= 0 = contenderId
    this.cellBrushWeight = new Float32Array(this.cellCount).fill(0); // Smooth radial brush weight [0..1]
    this.trailOwner = new Int16Array(this.cellCount).fill(-1);     // -1 = none, >= 0 = active trail contenderId
    this.obstacle = new Uint8Array(this.cellCount).fill(0);        // 0 = navigable water, 1 = impassable island/cliff/reef

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

    this.bfsVisited = new Int32Array(this.cellCount);
    this.bfsQueue = new Int32Array(this.cellCount);
    this.bfsStamp = 1;

    this._buildTopologyAndSpatialIndex(posAttr);

    // GPU Vertex Attributes for Organic Freeform Territory Shader (interpolated scalar SDF vWeight)
    const vertexCount = this.cellCount * 3;
    this.colorArray = new Float32Array(vertexCount * 3);
    this.weightArray = new Float32Array(vertexCount);
    this.patternArray = new Float32Array(vertexCount);
    this.borderTypeArray = new Float32Array(vertexCount);

    this.colorAttr = new THREE.BufferAttribute(this.colorArray, 3).setUsage(THREE.DynamicDrawUsage);
    this.weightAttr = new THREE.BufferAttribute(this.weightArray, 1).setUsage(THREE.DynamicDrawUsage);
    this.patternAttr = new THREE.BufferAttribute(this.patternArray, 1).setUsage(THREE.DynamicDrawUsage);
    this.borderTypeAttr = new THREE.BufferAttribute(this.borderTypeArray, 1).setUsage(THREE.DynamicDrawUsage);

    this.geometry.setAttribute('aColor', this.colorAttr);
    this.geometry.setAttribute('aWeight', this.weightAttr);
    this.geometry.setAttribute('aPattern', this.patternAttr);
    this.geometry.setAttribute('aBorderType', this.borderTypeAttr);

    this.material = createTerritoryMaterial(sunDirection);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
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

  /**
   * Builds cell spatial buckets, cell edge-neighbors for BFS flood-fill, AND the welded
   * shared-vertex graph (`V = 16,812` vertices) for 3-pass Gaussian/Laplacian SDF smoothing.
   */
  _buildTopologyAndSpatialIndex(posAttr) {
    const pos = posAttr.array;

    this.bucketRes = 24;
    const totalBuckets = 6 * this.bucketRes * this.bucketRes;
    this.buckets = Array.from({ length: totalBuckets }, () => []);

    const quantScale = 100;
    const vertKeyToId = new Map();
    this.cellVertIds = new Int32Array(this.cellCount * 3);
    let V = 0;

    const getOrCreateVertId = (vx, vy, vz) => {
      const qx = Math.round(vx * quantScale);
      const qy = Math.round(vy * quantScale);
      const qz = Math.round(vz * quantScale);
      const key = `${qx},${qy},${qz}`;
      let id = vertKeyToId.get(key);
      if (id === undefined) {
        id = V++;
        vertKeyToId.set(key, id);
      }
      return id;
    };

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

      const v0 = getOrCreateVertId(ax, ay, az);
      const v1 = getOrCreateVertId(bx, by, bz);
      const v2 = getOrCreateVertId(cx, cy, cz);
      this.cellVertIds[c * 3]     = v0;
      this.cellVertIds[c * 3 + 1] = v1;
      this.cellVertIds[c * 3 + 2] = v2;
    }

    this.weldedVertexCount = V;
    const vCells = Array.from({ length: V }, () => []);
    const vNeighbors = Array.from({ length: V }, () => []);
    const linkVerts = (a, b) => {
      if (vNeighbors[a].indexOf(b) === -1) vNeighbors[a].push(b);
      if (vNeighbors[b].indexOf(a) === -1) vNeighbors[b].push(a);
    };

    for (let c = 0; c < this.cellCount; c++) {
      const v0 = this.cellVertIds[c * 3];
      const v1 = this.cellVertIds[c * 3 + 1];
      const v2 = this.cellVertIds[c * 3 + 2];
      vCells[v0].push(c);
      vCells[v1].push(c);
      vCells[v2].push(c);
      linkVerts(v0, v1);
      linkVerts(v1, v2);
      linkVerts(v2, v0);
    }

    // Build cell edgeNeighbors (cells sharing >= 2 welded vertices)
    this.edgeNeighbors = new Int32Array(this.cellCount * 3).fill(-1);
    for (let c = 0; c < this.cellCount; c++) {
      const v0 = this.cellVertIds[c * 3];
      const v1 = this.cellVertIds[c * 3 + 1];
      const v2 = this.cellVertIds[c * 3 + 2];
      const candidates = new Map();

      for (const v of [v0, v1, v2]) {
        const list = vCells[v];
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

    // Flatten vertex->cells and vertex->neighbors into fast CSR typed arrays for 3-pass smoothing
    this.vCellOffsets = new Int32Array(V + 1);
    this.vAdjOffsets = new Int32Array(V + 1);
    let totalVC = 0;
    let totalVA = 0;
    for (let v = 0; v < V; v++) {
      this.vCellOffsets[v] = totalVC;
      totalVC += vCells[v].length;
      this.vAdjOffsets[v] = totalVA;
      totalVA += vNeighbors[v].length;
    }
    this.vCellOffsets[V] = totalVC;
    this.vAdjOffsets[V] = totalVA;

    this.vCellList = new Int32Array(totalVC);
    this.vAdjList = new Int32Array(totalVA);
    for (let v = 0; v < V; v++) {
      this.vCellList.set(vCells[v], this.vCellOffsets[v]);
      this.vAdjList.set(vNeighbors[v], this.vAdjOffsets[v]);
    }

    // Working buffers for 3-pass Gaussian/Laplacian vertex smoothing
    this.vOwner = new Int16Array(V).fill(-1);
    this.vConflict = new Uint8Array(V);
    this.vWeightA = new Float32Array(V);
    this.vWeightB = new Float32Array(V);
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
   * Clears all obstacle flags on the grid (used when dynamically toggling or regenerating obstacles).
   */
  clearObstacles() {
    this.obstacle.fill(0);
    this.navigableCellCount = this.cellCount;
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
      }
    }
  }

  /**
   * Updates `this.owner[cellIdx]` and synchronizes `this.ownedCellsSets` + `this.ownerCounts`.
   * Obstacles do NOT block territory ownership so loops across or around islands capture cleanly!
   */
  _setCellOwner(cellIdx, newOwnerId, brushWeight = 1.0) {
    const prevOwner = this.owner[cellIdx];
    if (prevOwner === newOwnerId) {
      if (newOwnerId >= 0 && brushWeight > this.cellBrushWeight[cellIdx]) {
        this.cellBrushWeight[cellIdx] = brushWeight;
      }
      return false;
    }

    if (prevOwner >= 0) {
      this.ownerCounts[prevOwner] = Math.max(0, this.ownerCounts[prevOwner] - 1);
      this.ownedCellsSets[prevOwner]?.delete(cellIdx);
    }
    this.owner[cellIdx] = newOwnerId;
    if (newOwnerId >= 0) {
      this.ownerCounts[newOwnerId]++;
      this.ownedCellsSets[newOwnerId]?.add(cellIdx);
      this.cellBrushWeight[cellIdx] = brushWeight;
    } else {
      this.cellBrushWeight[cellIdx] = 0.0;
    }
    return true;
  }

  /**
   * Stamps a smooth circular radial brush at `posOrNormal` with radius `worldRadius`.
   */
  _stampRadialBrush(posOrNormal, worldRadius, contenderId) {
    const len = posOrNormal.length() || 1;
    const nx = posOrNormal.x / len;
    const ny = posOrNormal.y / len;
    const nz = posOrNormal.z / len;

    const cells = this.getCellsInRadius(posOrNormal, worldRadius);
    let newlyClaimed = 0;
    const cn = this.cellNormals;

    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const dot = Math.min(1.0, nx * cn[c * 3] + ny * cn[c * 3 + 1] + nz * cn[c * 3 + 2]);
      const arcDist = Math.acos(Math.max(-1.0, dot)) * this.radius;
      const radialT = Math.max(0.0, Math.min(1.0, 1.0 - (arcDist / Math.max(0.1, worldRadius)) * 0.32));
      if (this._setCellOwner(c, contenderId, radialT)) {
        newlyClaimed++;
      }
    }
    return { newlyClaimed, cells };
  }

  /**
   * Claims a circular disk of cells for `contenderId` using a smooth radial paint brush.
   */
  claimDisk(posOrNormal, worldRadius, contenderId, syncGPU = true) {
    const { newlyClaimed } = this._stampRadialBrush(posOrNormal, worldRadius, contenderId);
    const changed = newlyClaimed > 0;

    if (changed && syncGPU) {
      this.syncBuffersToGPU();
    }
    return changed;
  }

  /**
   * Stamps active trail cells into `this.trailOwner` and `this.activeTrailCellsSets[contenderId]`
   * STRICTLY SEPARATELY from `this.owner` / `ownedCellsSets`!
   * Moving across obstacles never skips cells, ensuring unbroken trails everywhere.
   */
  stampTrailSegment(prevPos, currPos, contenderId, worldWidth, claimImmediately = false) {
    const dist = prevPos.distanceTo(currPos);
    const steps = Math.max(1, Math.ceil(dist / 0.7));
    const tempVec = new THREE.Vector3();
    let changedTerritory = false;

    const brushRadius = Math.max(2.15, worldWidth * 0.82);
    const trailSet = this.activeTrailCellsSets[contenderId];

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      tempVec.lerpVectors(prevPos, currPos, t).normalize();
      const cells = this.getCellsInRadius(tempVec, brushRadius);
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        this.trailOwner[c] = contenderId;
        if (trailSet) trailSet.add(c);
        if (claimImmediately && this._setCellOwner(c, contenderId, 0.95)) {
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
          this.cellBrushWeight[c] = 0.0;
          changed = true;
        }
      }
      ownedSet.clear();
    } else {
      for (let c = 0; c < this.cellCount; c++) {
        if (this.owner[c] === contenderId) {
          this.owner[c] = -1;
          this.cellBrushWeight[c] = 0.0;
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
   * Closes a contender's active trail loop by stamping a smooth circular radial brush along
   * their continuous `CatmullRomCurve3` spline path, then executes the spherical BFS Flood-Fill
   * and 3-pass Gaussian/Laplacian vertex smoothing.
   */
  closeLoopAndFloodFill(contenderId, trailPoints, trailWidth = CONFIG.NORMAL_TRAIL_WIDTH) {
    let newlyCaptured = 0;
    const brushRadius = Math.max(2.35, trailWidth * 0.88);

    // 1. Stamp smooth circular radial brush along the continuous CatmullRomCurve3 spline path
    if (trailPoints && trailPoints.length >= 2) {
      const spline = new THREE.CatmullRomCurve3(trailPoints);
      const sampleCount = Math.max(24, trailPoints.length * 3);
      const samplePt = new THREE.Vector3();

      for (let s = 0; s <= sampleCount; s++) {
        spline.getPoint(s / sampleCount, samplePt);
        const { newlyClaimed } = this._stampRadialBrush(samplePt, brushRadius, contenderId);
        newlyCaptured += newlyClaimed;
      }
    } else if (trailPoints && trailPoints.length === 1) {
      const { newlyClaimed } = this._stampRadialBrush(trailPoints[0], brushRadius, contenderId);
      newlyCaptured += newlyClaimed;
    }

    // 2. Also convert any remaining activeTrailCells into ownedCells
    const trailSet = this.activeTrailCellsSets[contenderId];
    if (trailSet && trailSet.size > 0) {
      for (const c of trailSet) {
        this.trailOwner[c] = -1;
        if (this._setCellOwner(c, contenderId, 0.96)) {
          newlyCaptured++;
        }
      }
      trailSet.clear();
    } else {
      for (let c = 0; c < this.cellCount; c++) {
        if (this.trailOwner[c] === contenderId) {
          this.trailOwner[c] = -1;
          if (this._setCellOwner(c, contenderId, 0.96)) {
            newlyCaptured++;
          }
        }
      }
    }

    // 3. Spherical BFS Flood-Fill of enclosed interior regions
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
          if (this._setCellOwner(cellToClaim, contenderId, 1.0)) {
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

  /**
   * Computes a smooth scalar SDF weight field `aWeight` (`[0..1]`) on the welded vertex graph
   * and applies a 3-pass Gaussian/Laplacian smoothing filter (`smoothWeight`) across neighbor
   * vertices so captured territories render as 100% curvy, liquid freeform paint blobs with
   * a continuous glowing neon tube rim and zero polygonal triangle edges.
   */
  syncBuffersToGPU() {
    const V = this.weldedVertexCount;
    const ownerArr = this.owner;
    const brushArr = this.cellBrushWeight;
    const vCellOffsets = this.vCellOffsets;
    const vCellList = this.vCellList;
    const vAdjOffsets = this.vAdjOffsets;
    const vAdjList = this.vAdjList;

    const vOwner = this.vOwner;
    const vConflict = this.vConflict;
    let srcW = this.vWeightA;
    let dstW = this.vWeightB;

    // Step 1: Project cell ownership & radial brush weights onto shared vertices
    for (let v = 0; v < V; v++) {
      const start = vCellOffsets[v];
      const end = vCellOffsets[v + 1];
      const deg = end - start || 1;

      let domOwner = -1;
      let domWeightSum = 0.0;
      let otherOwnerPresent = 0;

      for (let i = start; i < end; i++) {
        const c = vCellList[i];
        const own = ownerArr[c];
        if (own < 0) continue;
        const bw = brushArr[c] || 1.0;
        if (domOwner === -1) {
          domOwner = own;
          domWeightSum = bw;
        } else if (own === domOwner) {
          domWeightSum += bw;
        } else {
          otherOwnerPresent = 1;
        }
      }

      vOwner[v] = domOwner;
      vConflict[v] = otherOwnerPresent;
      if (domOwner >= 0) {
        const rawW = domWeightSum / deg;
        srcW[v] = otherOwnerPresent ? Math.min(0.36, rawW) : rawW;
      } else {
        srcW[v] = 0.0;
      }
    }

    // Step 2: 3-pass Gaussian/Laplacian smoothing across neighbor vertices
    const passes = CONFIG.TERRITORY_SMOOTH_PASSES || 3;
    const smoothWeight = CONFIG.TERRITORY_SMOOTH_WEIGHT !== undefined ? CONFIG.TERRITORY_SMOOTH_WEIGHT : 0.5;

    for (let pass = 0; pass < passes; pass++) {
      for (let v = 0; v < V; v++) {
        const start = vAdjOffsets[v];
        const end = vAdjOffsets[v + 1];
        let myOwn = vOwner[v];

        // Propagate contender ownership outward into the neutral smoothing halo
        if (myOwn < 0) {
          let bestOwn = -1;
          let bestW = 0.0;
          for (let i = start; i < end; i++) {
            const nb = vAdjList[i];
            if (vOwner[nb] >= 0 && srcW[nb] > bestW) {
              bestW = srcW[nb];
              bestOwn = vOwner[nb];
            }
          }
          if (bestOwn >= 0 && bestW > 0.02) {
            myOwn = bestOwn;
            vOwner[v] = bestOwn;
          }
        }

        if (myOwn < 0) {
          dstW[v] = 0.0;
          continue;
        }

        const deg = end - start || 1;
        let nbSum = 0.0;
        for (let i = start; i < end; i++) {
          const nb = vAdjList[i];
          if (vOwner[nb] === myOwn) {
            nbSum += srcW[nb];
          }
        }
        const nbAvg = nbSum / deg;
        const smoothed = (1.0 - smoothWeight) * srcW[v] + smoothWeight * nbAvg;
        dstW[v] = vConflict[v] ? Math.min(0.36, smoothed) : smoothed;
      }

      const tmp = srcW;
      srcW = dstW;
      dstW = tmp;
    }

    // Step 3: Write smoothed vertex weights (`aWeight`) and contender styles into GPU buffers
    const colors = this.colorArray;
    const weights = this.weightArray;
    const patterns = this.patternArray;
    const borderTypes = this.borderTypeArray;
    const cellVertIds = this.cellVertIds;
    const palette = this.contenderRGB;
    const patIdxArr = this.contenderPatternIndex;
    const brdIdxArr = this.contenderBorderIndex;

    for (let c = 0; c < this.cellCount; c++) {
      const vBase = c * 3;
      const cBase = c * 9;

      const v0 = cellVertIds[vBase];
      const v1 = cellVertIds[vBase + 1];
      const v2 = cellVertIds[vBase + 2];

      const w0 = srcW[v0];
      const w1 = srcW[v1];
      const w2 = srcW[v2];

      // Fast discard for completely empty neutral triangles
      if (w0 < 0.02 && w1 < 0.02 && w2 < 0.02) {
        weights[vBase]     = 0.0;
        weights[vBase + 1] = 0.0;
        weights[vBase + 2] = 0.0;
        continue;
      }

      // Pick consistent contender style for all 3 corners of this triangle so colors never bleed
      let triOwner = ownerArr[c];
      if (triOwner < 0) {
        if (w0 >= w1 && w0 >= w2 && vOwner[v0] >= 0) triOwner = vOwner[v0];
        else if (w1 >= w0 && w1 >= w2 && vOwner[v1] >= 0) triOwner = vOwner[v1];
        else triOwner = vOwner[v2];
      }

      if (triOwner < 0) {
        weights[vBase]     = 0.0;
        weights[vBase + 1] = 0.0;
        weights[vBase + 2] = 0.0;
        continue;
      }

      const rgb = palette[triOwner] || [1, 1, 1];
      const r = rgb[0], g = rgb[1], b = rgb[2];

      colors[cBase]     = r; colors[cBase + 1] = g; colors[cBase + 2] = b;
      colors[cBase + 3] = r; colors[cBase + 4] = g; colors[cBase + 5] = b;
      colors[cBase + 6] = r; colors[cBase + 7] = g; colors[cBase + 8] = b;

      weights[vBase]     = vOwner[v0] === triOwner ? w0 : 0.0;
      weights[vBase + 1] = vOwner[v1] === triOwner ? w1 : 0.0;
      weights[vBase + 2] = vOwner[v2] === triOwner ? w2 : 0.0;

      const patVal = patIdxArr[triOwner] || 0;
      patterns[vBase]     = patVal;
      patterns[vBase + 1] = patVal;
      patterns[vBase + 2] = patVal;

      const brdTypeVal = brdIdxArr[triOwner] || 0;
      borderTypes[vBase]     = brdTypeVal;
      borderTypes[vBase + 1] = brdTypeVal;
      borderTypes[vBase + 2] = brdTypeVal;
    }

    this.colorAttr.needsUpdate = true;
    this.weightAttr.needsUpdate = true;
    this.patternAttr.needsUpdate = true;
    this.borderTypeAttr.needsUpdate = true;
  }

  update(elapsedTime) {
    this.material.uniforms.uTime.value = elapsedTime;
  }
}

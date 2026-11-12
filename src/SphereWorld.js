// ============================================================================
// APUS.IO — SUNNY CLAYMORPHISM OCEAN WORLD, GOD RAYS & SMOOTH CLAY ISLANDS
// ============================================================================
import * as THREE from 'three';
import { CONFIG } from './Config.js';
import {
  createOceanMaterial,
  createFoamRingMaterial,
  createSunbeamsMaterial,
  createAtmosphereMaterial
} from './Shaders.js';

export class SphereWorld {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./TerritoryGrid.js').TerritoryGrid} territoryGrid
   */
  constructor(scene, territoryGrid) {
    this.scene = scene;
    this.territoryGrid = territoryGrid;
    this.radius = CONFIG.SPHERE_RADIUS;

    // Warm golden-amber directional sunlight from top-center / top-left horizon
    this.sunDirection = new THREE.Vector3(-0.32, 0.84, 0.44).normalize();

    this.obstacles = []; // Array of { normal, position, radius, type, mesh }
    this.obstacleMode = CONFIG.OBSTACLE_MODE || 'normal';
    this.obstaclesEnabled = this.obstacleMode !== 'none';

    this.foamMaterial = createFoamRingMaterial();
    this.sunbeamsMaterial = createSunbeamsMaterial();

    this.obstacleGroup = new THREE.Group();
    this.scene.add(this.obstacleGroup);

    this._setupLighting();
    this._createOceanSphere();
    this._createCrepuscularSunbeams();
    this._generateProceduralObstacles(this.obstacleMode);
  }

  _setupLighting() {
    // Rich tropical sky-to-deep-marine-teal HemisphereLight
    this.hemiLight = new THREE.HemisphereLight(0xffefb8, 0x063b5a, 1.25);
    this.scene.add(this.hemiLight);

    // Warm Golden Amber DirectionalLight (#ffd175, intensity 2.8) casting soft shadows
    this.sunLight = new THREE.DirectionalLight(0xffd175, 2.8);
    this.sunLight.position.copy(this.sunDirection).multiplyScalar(250);
    this.sunLight.castShadow = true;

    const d = 135;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 60;
    this.sunLight.shadow.camera.far = 420;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.bias = -0.0006;
    this.scene.add(this.sunLight);

    // Soft teal-turquoise fill light from opposite side so clay shadows stay rich and colorful
    this.rimLight = new THREE.DirectionalLight(0x0ca4bd, 0.75);
    this.rimLight.position.copy(this.sunDirection).multiplyScalar(-200);
    this.scene.add(this.rimLight);
  }

  _createOceanSphere() {
    // High-resolution smooth spherical ocean
    const oceanGeo = new THREE.IcosahedronGeometry(this.radius, 48);
    oceanGeo.computeVertexNormals();
    this.oceanMaterial = createOceanMaterial(this.sunDirection);
    this.oceanMesh = new THREE.Mesh(oceanGeo, this.oceanMaterial);
    this.oceanMesh.receiveShadow = true;
    this.oceanMesh.renderOrder = 1;
    this.scene.add(this.oceanMesh);

    // Subtle warm golden horizon atmospheric rim (#ffe8a3) at the very back edge of the sphere
    const atmosGeo = new THREE.IcosahedronGeometry(this.radius * 1.045, 32);
    atmosGeo.computeVertexNormals();
    this.atmosMaterial = createAtmosphereMaterial();
    this.atmosMesh = new THREE.Mesh(atmosGeo, this.atmosMaterial);
    this.scene.add(this.atmosMesh);
  }

  /**
   * Warm golden-amber diagonal Sunbeam Shafts (God Rays) streaming from the top-left/top-center horizon.
   */
  _createCrepuscularSunbeams() {
    this.sunbeamsGroup = new THREE.Group();

    const rayConfigs = [
      { radiusTop: 7,   radiusBottom: 42, height: 190, offset: new THREE.Vector3(-10, 12, 8) },
      { radiusTop: 4.5, radiusBottom: 28, height: 175, offset: new THREE.Vector3(16, -8, 14) },
      { radiusTop: 5.5, radiusBottom: 34, height: 185, offset: new THREE.Vector3(-22, 16, -10) },
      { radiusTop: 4.0, radiusBottom: 26, height: 170, offset: new THREE.Vector3(10, 22, -18) },
      { radiusTop: 5.0, radiusBottom: 31, height: 180, offset: new THREE.Vector3(-14, -18, 16) }
    ];

    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, this.sunDirection);

    for (let i = 0; i < rayConfigs.length; i++) {
      const cfg = rayConfigs[i];
      const coneGeo = new THREE.CylinderGeometry(
        cfg.radiusTop,
        cfg.radiusBottom,
        cfg.height,
        32,
        1,
        true
      );
      coneGeo.computeVertexNormals();
      const beam = new THREE.Mesh(coneGeo, this.sunbeamsMaterial);
      beam.quaternion.copy(quat);

      const centerPos = this.sunDirection
        .clone()
        .multiplyScalar(this.radius * 0.92)
        .add(cfg.offset);
      beam.position.copy(centerPos);
      beam.renderOrder = 8;
      this.sunbeamsGroup.add(beam);
    }

    this.scene.add(this.sunbeamsGroup);
  }

  /**
   * Dynamically switches or regenerates static obstacles ('none' | 'low' | 'normal' | 'dense')
   * in-game or from the Pre-Game Lobby without crashing the current match!
   */
  setObstacleMode(modeId = 'normal', activeContenders = []) {
    const validMode = CONFIG.OBSTACLE_DENSITY_PRESETS[modeId] ? modeId : 'normal';
    CONFIG.OBSTACLE_MODE = validMode;
    this.obstacleMode = validMode;
    this.obstaclesEnabled = validMode !== 'none';

    this._generateProceduralObstacles(validMode, activeContenders);
    this.territoryGrid.syncBuffersToGPU();
    return CONFIG.OBSTACLE_DENSITY_PRESETS[validMode];
  }

  /**
   * Procedurally populates (or clears) the sphere with smooth clay-styled tropical islands,
   * thick ancient trees, sculpted rocks, and coral reefs according to `modeId`.
   */
  _generateProceduralObstacles(modeId = 'normal', activeContenders = []) {
    // 1. Clear any existing obstacle meshes and reset grid obstacle flags
    while (this.obstacleGroup.children.length > 0) {
      this.obstacleGroup.remove(this.obstacleGroup.children[0]);
    }
    this.obstacles.length = 0;
    this.territoryGrid.clearObstacles();

    const preset = CONFIG.OBSTACLE_DENSITY_PRESETS[modeId] || CONFIG.OBSTACLE_DENSITY_PRESETS.normal;
    const density = preset.density;

    if (density <= 0.001) {
      this._syncOceanIslandUniforms();
      return;
    }

    const treeCount = Math.max(1, Math.round(CONFIG.TREE_ISLAND_COUNT * density));
    const cliffCount = Math.max(1, Math.round(CONFIG.CLIFF_COUNT * density));
    const coralCount = Math.max(1, Math.round(CONFIG.CORAL_REEF_COUNT * density));
    const totalObstacles = treeCount + cliffCount + coralCount;

    const playerStartNormal = new THREE.Vector3(0, 0.15, 0.988).normalize();
    const candidateNormals = [];
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    const sampleCount = totalObstacles + 36;
    const minSpacing = preset.minSpacing || 20.5;

    let seed = 133742;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let i = 0; i < sampleCount; i++) {
      const y = 1 - (i / Math.max(1, sampleCount - 1)) * 2;
      const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = (2 * Math.PI * i) / goldenRatio + (rand() - 0.5) * 0.25;

      const normal = new THREE.Vector3(
        Math.cos(theta) * radiusAtY + (rand() - 0.5) * 0.08,
        y + (rand() - 0.5) * 0.08,
        Math.sin(theta) * radiusAtY + (rand() - 0.5) * 0.08
      ).normalize();

      // Keep clear of player default start zone
      if (normal.angleTo(playerStartNormal) * this.radius < 19.0) continue;

      // Keep clear of any currently living contenders so toggling in-game never traps anyone
      let hitsContender = false;
      for (let c = 0; c < activeContenders.length; c++) {
        const cont = activeContenders[c];
        if (cont && cont.state === 'ALIVE' && cont.normal) {
          if (normal.angleTo(cont.normal) * this.radius < 11.5) {
            hitsContender = true;
            break;
          }
        }
      }
      if (hitsContender) continue;

      let tooClose = false;
      for (let j = 0; j < candidateNormals.length; j++) {
        if (normal.angleTo(candidateNormals[j]) * this.radius < minSpacing) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        candidateNormals.push(normal);
      }
      if (candidateNormals.length >= totalObstacles) break;
    }

    let idx = 0;
    // 1. Giant Thick Ancient Trees on Cream-Sand Islands
    for (let i = 0; i < treeCount && idx < candidateNormals.length; i++, idx++) {
      const normal = candidateNormals[idx];
      const radius = 6.2 + rand() * 1.8;
      this._buildAncientTreeIsland(normal, radius, rand);
    }

    // 2. Smooth Sculpted Sea Cliffs & Sandy Rock Islets
    for (let i = 0; i < cliffCount && idx < candidateNormals.length; i++, idx++) {
      const normal = candidateNormals[idx];
      const radius = 5.4 + rand() * 1.8;
      this._buildJaggedCliff(normal, radius, rand);
    }

    // 3. Vibrant Smooth Coral Reefs
    for (let i = 0; i < coralCount && idx < candidateNormals.length; i++, idx++) {
      const normal = candidateNormals[idx];
      const radius = 4.8 + rand() * 1.6;
      this._buildCoralReef(normal, radius, rand);
    }

    this._syncOceanIslandUniforms();
  }

  /**
   * Passes obstacle normal vectors and angular radii into the Ocean Shader so shallow
   * turquoise lagoon rings (#2ec4b6) and soft dark-teal island shadows appear around every island!
   */
  _syncOceanIslandUniforms() {
    if (!this.oceanMaterial || !this.oceanMaterial.uniforms.uIslands) return;
    const arr = this.oceanMaterial.uniforms.uIslands.value;
    const count = Math.min(arr.length, this.obstacles.length);
    this.oceanMaterial.uniforms.uIslandCount.value = count;

    for (let i = 0; i < arr.length; i++) {
      if (i < count) {
        const obs = this.obstacles[i];
        arr[i].set(obs.normal.x, obs.normal.y, obs.normal.z, obs.radius / this.radius);
      } else {
        arr[i].set(0, 0, 0, 0);
      }
    }
  }

  _createSurfaceAnchor(normal, radius, type) {
    const group = new THREE.Group();
    const pos = normal.clone().multiplyScalar(this.radius);
    group.position.copy(pos);

    const up = new THREE.Vector3(0, 1, 0);
    group.quaternion.setFromUnitVectors(up, normal);

    // Animated bubbly white shoreline foam ring around island base
    const foamGeo = new THREE.PlaneGeometry(radius * 3.15, radius * 3.15, 20, 20);
    foamGeo.rotateX(-Math.PI / 2);
    foamGeo.computeVertexNormals();
    const foamMesh = new THREE.Mesh(foamGeo, this.foamMaterial);
    foamMesh.position.y = 0.08;
    foamMesh.renderOrder = 3;
    group.add(foamMesh);

    this.obstacleGroup.add(group);

    this.obstacles.push({
      normal: normal.clone(),
      position: pos,
      radius,
      type,
      mesh: group
    });

    this.territoryGrid.markObstacleDisk(normal, radius);
    return group;
  }

  /**
   * Helper to build a smooth, rounded clay boulder (`flatShading: false`, `computeVertexNormals()`).
   */
  _createSmoothClayRockGeometry(radius, heightScale, rand) {
    const geo = new THREE.SphereGeometry(radius, 24, 20);
    const pos = geo.attributes.position;
    const p1 = rand() * 6.28;
    const p2 = rand() * 6.28;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const n = 1.0 + 0.14 * Math.sin(x * 2.2 + p1) * Math.cos(z * 2.2 + p2);
      x *= n;
      z *= n;
      y *= heightScale * (y > 0 ? 1.08 : 0.7);
      pos.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * 1. Giant Thick Ancient Trees on Cream-Sand Islands:
   * - Smooth cream-sand beach dome (`#fae39c`)
   * - Smooth clay boulders & cute beach starfish (`#ff5252`)
   * - Thick twisting brown trunk + 8 overlapping high-res smooth spheres (`SphereGeometry(r, 32, 32)`)
   */
  _buildAncientTreeIsland(normal, radius, rand) {
    const group = this._createSurfaceAnchor(normal, radius, 'ANCIENT_TREE');

    const creamSandMat = new THREE.MeshStandardMaterial({
      color: 0xfae39c,
      roughness: 0.65,
      metalness: 0.02,
      flatShading: false
    });
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x7c4d2b,
      roughness: 0.72,
      metalness: 0.04,
      flatShading: false
    });
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x8d867e,
      roughness: 0.68,
      metalness: 0.05,
      flatShading: false
    });
    const foliageColors = [0x558b2f, 0x689f38, 0x7cb342, 0x8bc34a];
    const canopyMats = foliageColors.map(col => new THREE.MeshStandardMaterial({
      color: col,
      roughness: 0.55,
      metalness: 0.02,
      flatShading: false
    }));

    // Smooth cream-sand island dome
    const sandGeo = new THREE.SphereGeometry(radius * 0.98, 32, 24);
    sandGeo.scale(1.0, 0.28, 1.0);
    sandGeo.computeVertexNormals();
    const sandMesh = new THREE.Mesh(sandGeo, creamSandMat);
    sandMesh.position.y = -0.15;
    sandMesh.receiveShadow = true;
    sandMesh.castShadow = true;
    group.add(sandMesh);

    // 2-3 smooth clay beach boulders on the sandy shore
    for (let b = 0; b < 3; b++) {
      const bAngle = (b / 3) * Math.PI * 2 + rand() * 0.9;
      const bDist = radius * (0.46 + rand() * 0.22);
      const bRad = radius * (0.22 + rand() * 0.1);
      const bGeo = this._createSmoothClayRockGeometry(bRad, 0.95 + rand() * 0.35, rand);
      const bMesh = new THREE.Mesh(bGeo, rockMat);
      bMesh.position.set(Math.cos(bAngle) * bDist, bRad * 0.55 + 0.6, Math.sin(bAngle) * bDist);
      bMesh.castShadow = true;
      bMesh.receiveShadow = true;
      group.add(bMesh);
    }

    // Cute little orange-red beach starfish sitting on the cream sand
    const starMat = new THREE.MeshStandardMaterial({
      color: 0xff5252,
      roughness: 0.45,
      flatShading: false
    });
    const starGeo = new THREE.SphereGeometry(0.45, 16, 12);
    starGeo.scale(1.0, 0.25, 1.0);
    starGeo.computeVertexNormals();
    const starMesh = new THREE.Mesh(starGeo, starMat);
    starMesh.position.set(radius * 0.52, 0.95, radius * 0.28);
    group.add(starMesh);

    // Massive thick ancient tree trunk with smooth flaring root buttresses
    const trunkHeight = radius * 1.55;
    const trunkGeo = new THREE.CylinderGeometry(radius * 0.26, radius * 0.48, trunkHeight, 24, 8);
    trunkGeo.computeVertexNormals();
    const trunkMesh = new THREE.Mesh(trunkGeo, trunkMat);
    trunkMesh.position.y = 1.0 + trunkHeight * 0.5;
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    group.add(trunkMesh);

    for (let r = 0; r < 5; r++) {
      const rAngle = (r / 5) * Math.PI * 2 + rand() * 0.3;
      const rootGeo = new THREE.CapsuleGeometry(radius * 0.14, trunkHeight * 0.48, 12, 16);
      rootGeo.computeVertexNormals();
      const rootMesh = new THREE.Mesh(rootGeo, trunkMat);
      rootMesh.position.set(
        Math.cos(rAngle) * radius * 0.32,
        1.6,
        Math.sin(rAngle) * radius * 0.32
      );
      rootMesh.rotation.y = -rAngle + Math.PI / 2;
      rootMesh.rotation.x = 0.48;
      rootMesh.castShadow = true;
      group.add(rootMesh);
    }

    // Lush tree canopy made of 8 overlapping high-res smooth spheres: SphereGeometry(r, 32, 32)
    const canopyPuffs = [
      { x: 0,              y: trunkHeight + 2.5, z: 0,              r: radius * 0.72 },
      { x: radius * 0.44,  y: trunkHeight + 1.8, z: radius * 0.22,  r: radius * 0.56 },
      { x: -radius * 0.44, y: trunkHeight + 1.9, z: -radius * 0.20, r: radius * 0.58 },
      { x: radius * 0.15,  y: trunkHeight + 1.9, z: -radius * 0.46, r: radius * 0.54 },
      { x: -radius * 0.18, y: trunkHeight + 1.7, z: radius * 0.46,  r: radius * 0.52 },
      { x: radius * 0.36,  y: trunkHeight + 2.3, z: -radius * 0.28, r: radius * 0.48 },
      { x: -radius * 0.36, y: trunkHeight + 2.2, z: radius * 0.28,  r: radius * 0.50 },
      { x: 0,              y: trunkHeight + 3.1, z: 0,              r: radius * 0.52 }
    ];

    for (let c = 0; c < canopyPuffs.length; c++) {
      const cp = canopyPuffs[c];
      const puffGeo = new THREE.SphereGeometry(cp.r, 32, 32);
      puffGeo.scale(1.12, 0.86, 1.12);
      puffGeo.computeVertexNormals();
      const puffMesh = new THREE.Mesh(puffGeo, canopyMats[c % canopyMats.length]);
      puffMesh.position.set(cp.x, cp.y, cp.z);
      puffMesh.castShadow = true;
      puffMesh.receiveShadow = true;
      group.add(puffMesh);
    }
  }

  /**
   * 2. Smooth Sculpted Sea Cliffs & Cream-Sand Rock Atolls (`flatShading: false`)
   */
  _buildJaggedCliff(normal, radius, rand) {
    const group = this._createSurfaceAnchor(normal, radius, 'CLIFF');

    const sandMat = new THREE.MeshStandardMaterial({
      color: 0xf9e098,
      roughness: 0.65,
      flatShading: false
    });
    const rockMatDark = new THREE.MeshStandardMaterial({
      color: 0x7c7770,
      roughness: 0.68,
      metalness: 0.05,
      flatShading: false
    });
    const rockMatLight = new THREE.MeshStandardMaterial({
      color: 0x999289,
      roughness: 0.64,
      metalness: 0.04,
      flatShading: false
    });
    const mossMat = new THREE.MeshStandardMaterial({
      color: 0x689f38,
      roughness: 0.58,
      flatShading: false
    });

    // Smooth cream-sand base bank
    const sandGeo = new THREE.SphereGeometry(radius * 0.94, 32, 24);
    sandGeo.scale(1.0, 0.24, 1.0);
    sandGeo.computeVertexNormals();
    const sandMesh = new THREE.Mesh(sandGeo, sandMat);
    sandMesh.position.y = -0.15;
    sandMesh.receiveShadow = true;
    group.add(sandMesh);

    const spireCount = 4 + Math.floor(rand() * 3);
    for (let i = 0; i < spireCount; i++) {
      const isMain = i === 0;
      const cragRadius = isMain ? radius * 0.48 : radius * (0.28 + rand() * 0.16);
      const heightScale = isMain ? 1.85 + rand() * 0.45 : 1.15 + rand() * 0.45;

      const rockGeo = this._createSmoothClayRockGeometry(cragRadius, heightScale, rand);
      const mesh = new THREE.Mesh(rockGeo, i % 2 === 0 ? rockMatDark : rockMatLight);
      const angle = (i / spireCount) * Math.PI * 2 + rand() * 0.5;
      const dist = isMain ? 0 : radius * (0.34 + rand() * 0.22);

      mesh.position.set(
        Math.cos(angle) * dist,
        cragRadius * heightScale * 0.5 + 0.5,
        Math.sin(angle) * dist
      );
      mesh.rotation.y = rand() * Math.PI;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);

      if (isMain || rand() > 0.4) {
        const capGeo = new THREE.SphereGeometry(cragRadius * 0.72, 24, 20);
        capGeo.scale(1.08, 0.42, 1.08);
        capGeo.computeVertexNormals();
        const capMesh = new THREE.Mesh(capGeo, mossMat);
        capMesh.position.copy(mesh.position);
        capMesh.position.y += cragRadius * heightScale * 0.55;
        capMesh.castShadow = true;
        group.add(capMesh);
      }
    }
  }

  /**
   * 3. Vibrant Smooth Clay Coral Reefs (`flatShading: false`)
   */
  _buildCoralReef(normal, radius, rand) {
    const group = this._createSurfaceAnchor(normal, radius, 'CORAL_REEF');

    const reefPalette = [
      0xff5c8a, // Coral Pink
      0xff9f1c, // Sunburst Tang
      0x9b5de5, // Sea Fan Violet
      0x00f5d4, // Lagoon Cyan
      0xf15bb5, // Anemone Magenta
      0xffbe0b  // Golden Sponge
    ];

    const sandShelfMat = new THREE.MeshStandardMaterial({
      color: 0xf4dc96,
      roughness: 0.68,
      flatShading: false
    });
    const shelfGeo = new THREE.SphereGeometry(radius * 0.9, 28, 20);
    shelfGeo.scale(1.0, 0.2, 1.0);
    shelfGeo.computeVertexNormals();
    const shelfMesh = new THREE.Mesh(shelfGeo, sandShelfMat);
    shelfMesh.position.y = -0.12;
    shelfMesh.receiveShadow = true;
    group.add(shelfMesh);

    const clusterCount = 8 + Math.floor(rand() * 4);
    for (let i = 0; i < clusterCount; i++) {
      const col = reefPalette[i % reefPalette.length];
      const coralMat = new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.16,
        roughness: 0.42,
        flatShading: false
      });

      const angle = (i / clusterCount) * Math.PI * 2 + rand() * 0.4;
      const dist = (i === 0 ? 0 : (0.22 + rand() * 0.52)) * radius;

      let geo;
      if (i % 3 === 0) {
        geo = new THREE.SphereGeometry(radius * (0.24 + rand() * 0.12), 24, 24);
      } else if (i % 3 === 1) {
        geo = new THREE.CapsuleGeometry(radius * 0.12, radius * (0.45 + rand() * 0.25), 12, 16);
      } else {
        geo = new THREE.CylinderGeometry(radius * 0.14, radius * 0.19, radius * 0.58, 20);
      }
      geo.computeVertexNormals();

      const mesh = new THREE.Mesh(geo, coralMat);
      mesh.position.set(
        Math.cos(angle) * dist,
        0.65 + rand() * 0.5,
        Math.sin(angle) * dist
      );
      mesh.rotation.set((rand() - 0.5) * 0.35, rand() * Math.PI, (rand() - 0.5) * 0.35);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  /**
   * Finds a safe unit normal on the sphere away from static obstacles, sharks, and active contenders.
   */
  findSafeSpawnNormal(contenders = [], minObstacleClearance = 17.5, minContenderClearance = 24.0, sharks = []) {
    const candidate = new THREE.Vector3();

    for (let attempt = 0; attempt < 140; attempt++) {
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);

      candidate.set(
        Math.sin(phi) * Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi)
      ).normalize();

      // Check obstacle clearance
      let safe = true;
      for (let i = 0; i < this.obstacles.length; i++) {
        const obs = this.obstacles[i];
        const arcDist = candidate.angleTo(obs.normal) * this.radius;
        if (arcDist < obs.radius + minObstacleClearance) {
          safe = false;
          break;
        }
      }
      if (!safe) continue;

      // Check shark clearance
      for (let i = 0; i < sharks.length; i++) {
        const shark = sharks[i];
        if (!shark || !shark.normal) continue;
        const arcDist = candidate.angleTo(shark.normal) * this.radius;
        if (arcDist < 18.0) {
          safe = false;
          break;
        }
      }
      if (!safe) continue;

      // Check contender clearance
      const clearance = attempt < 65 ? minContenderClearance : minContenderClearance * 0.5;
      for (let i = 0; i < contenders.length; i++) {
        const c = contenders[i];
        if (!c || c.state === 'GHOST' || !c.normal) continue;
        const arcDist = candidate.angleTo(c.normal) * this.radius;
        if (arcDist < clearance) {
          safe = false;
          break;
        }
      }

      if (safe) return candidate.clone();
    }

    return candidate.normalize();
  }

  update(elapsedTime) {
    this.oceanMaterial.uniforms.uTime.value = elapsedTime;
    this.foamMaterial.uniforms.uTime.value = elapsedTime;
    this.sunbeamsMaterial.uniforms.uTime.value = elapsedTime;
  }
}

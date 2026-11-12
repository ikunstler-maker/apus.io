// ============================================================================
// APUS.IO — SPHERICAL OCEAN WORLD, SUNBEAMS & PROCEDURAL STATIC OBSTACLES
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

    // Warm tropical sun direction
    this.sunDirection = new THREE.Vector3(0.58, 0.72, 0.38).normalize();

    this.obstacles = []; // Array of { normal, position, radius, type, mesh }
    this.foamMaterial = createFoamRingMaterial();
    this.sunbeamsMaterial = createSunbeamsMaterial();

    this._setupLighting();
    this._createOceanSphere();
    this._createCrepuscularSunbeams();
    this._createStarAndMistField();
    this._generateProceduralObstacles();
  }

  _setupLighting() {
    // Warm tropical sky & deep ocean bounce hemisphere light
    this.hemiLight = new THREE.HemisphereLight(0xfff5db, 0x083d66, 1.15);
    this.scene.add(this.hemiLight);

    // Warm directional sunlight with soft shadow mapping
    this.sunLight = new THREE.DirectionalLight(0xfff0c4, 1.85);
    this.sunLight.position.copy(this.sunDirection).multiplyScalar(260);
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
    this.sunLight.shadow.bias = -0.0008;
    this.scene.add(this.sunLight);

    // Subtle rim fill light on opposite hemisphere so night/shadow side stays vibrant and readable
    this.rimLight = new THREE.DirectionalLight(0x2ec4b6, 0.65);
    this.rimLight.position.copy(this.sunDirection).multiplyScalar(-200);
    this.scene.add(this.rimLight);
  }

  _createOceanSphere() {
    // High-resolution ocean surface sphere
    const oceanGeo = new THREE.IcosahedronGeometry(this.radius, 40);
    this.oceanMaterial = createOceanMaterial(this.sunDirection);
    this.oceanMesh = new THREE.Mesh(oceanGeo, this.oceanMaterial);
    this.oceanMesh.receiveShadow = true;
    this.oceanMesh.renderOrder = 1;
    this.scene.add(this.oceanMesh);

    // Atmospheric horizon halo around the globe
    const atmosGeo = new THREE.IcosahedronGeometry(this.radius * 1.065, 24);
    this.atmosMaterial = createAtmosphereMaterial();
    this.atmosMesh = new THREE.Mesh(atmosGeo, this.atmosMaterial);
    this.scene.add(this.atmosMesh);
  }

  /**
   * Creates volumetric-style crepuscular sunbeams (god rays) streaming from the warm directional sun.
   */
  _createCrepuscularSunbeams() {
    this.sunbeamsGroup = new THREE.Group();

    const rayConfigs = [
      { radiusTop: 6,  radiusBottom: 38, height: 195, offset: new THREE.Vector3(0, 0, 0) },
      { radiusTop: 4,  radiusBottom: 26, height: 175, offset: new THREE.Vector3(24, -12, 16) },
      { radiusTop: 5,  radiusBottom: 32, height: 185, offset: new THREE.Vector3(-28, 10, -14) },
      { radiusTop: 3.5, radiusBottom: 24, height: 170, offset: new THREE.Vector3(14, 22, -22) },
      { radiusTop: 4.5, radiusBottom: 29, height: 180, offset: new THREE.Vector3(-18, -24, 20) }
    ];

    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, this.sunDirection);

    for (let i = 0; i < rayConfigs.length; i++) {
      const cfg = rayConfigs[i];
      const coneGeo = new THREE.CylinderGeometry(
        cfg.radiusTop,
        cfg.radiusBottom,
        cfg.height,
        28,
        1,
        true
      );
      const beam = new THREE.Mesh(coneGeo, this.sunbeamsMaterial);
      beam.quaternion.copy(quat);

      // Position shaft along the sunlit hemisphere
      const centerPos = this.sunDirection
        .clone()
        .multiplyScalar(this.radius * 0.95)
        .add(cfg.offset);
      beam.position.copy(centerPos);
      beam.renderOrder = 8;
      this.sunbeamsGroup.add(beam);
    }

    this.scene.add(this.sunbeamsGroup);
  }

  /**
   * Subtle atmospheric sparkles and distant sky backdrop around the spherical ocean.
   */
  _createStarAndMistField() {
    const count = 450;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const r = this.radius * (1.18 + Math.random() * 1.45);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      const c = new THREE.Color().setHSL(0.48 + Math.random() * 0.14, 0.85, 0.72 + Math.random() * 0.25);
      colors[i * 3]     = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 1.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.mistParticles = new THREE.Points(geo, mat);
    this.scene.add(this.mistParticles);
  }

  /**
   * Procedurally populates the sphere with:
   * 1. Jagged Sea Cliffs & Rocks
   * 2. Giant Thick Ancient Trees on sandy islets
   * 3. Vibrant Coral Reefs slightly submerged
   */
  _generateProceduralObstacles() {
    this.obstacleGroup = new THREE.Group();
    this.scene.add(this.obstacleGroup);

    const totalObstacles =
      CONFIG.CLIFF_COUNT + CONFIG.TREE_ISLAND_COUNT + CONFIG.CORAL_REEF_COUNT;

    // Generate well-spaced candidate normals using perturbed Fibonacci sphere sampling
    // Reserve a clear spawn zone near (0, 0, 1) for the local player's initial spawn
    const playerStartNormal = new THREE.Vector3(0, 0.15, 0.988).normalize();
    const candidateNormals = [];
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    const sampleCount = totalObstacles + 18;

    // Seeded pseudo-random helper for deterministic scenic layout
    let seed = 133742;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let i = 0; i < sampleCount; i++) {
      const y = 1 - (i / (sampleCount - 1)) * 2;
      const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = (2 * Math.PI * i) / goldenRatio + (rand() - 0.5) * 0.25;

      const normal = new THREE.Vector3(
        Math.cos(theta) * radiusAtY + (rand() - 0.5) * 0.08,
        y + (rand() - 0.5) * 0.08,
        Math.sin(theta) * radiusAtY + (rand() - 0.5) * 0.08
      ).normalize();

      // Keep clear of player default start zone
      if (normal.angleTo(playerStartNormal) * this.radius < 22) continue;

      // Ensure minimum spacing from already chosen obstacle normals
      let tooClose = false;
      for (let j = 0; j < candidateNormals.length; j++) {
        if (normal.angleTo(candidateNormals[j]) * this.radius < 20.5) {
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
    // 1. Jagged Sea Cliffs & Rocks
    for (let i = 0; i < CONFIG.CLIFF_COUNT && idx < candidateNormals.length; i++, idx++) {
      const normal = candidateNormals[idx];
      const radius = 5.4 + rand() * 2.2;
      this._buildJaggedCliff(normal, radius, rand);
    }

    // 2. Giant Thick Ancient Trees on sandy islets
    for (let i = 0; i < CONFIG.TREE_ISLAND_COUNT && idx < candidateNormals.length; i++, idx++) {
      const normal = candidateNormals[idx];
      const radius = 5.8 + rand() * 2.0;
      this._buildAncientTreeIsland(normal, radius, rand);
    }

    // 3. Vibrant Coral Reefs
    for (let i = 0; i < CONFIG.CORAL_REEF_COUNT && idx < candidateNormals.length; i++, idx++) {
      const normal = candidateNormals[idx];
      const radius = 5.0 + rand() * 1.8;
      this._buildCoralReef(normal, radius, rand);
    }
  }

  /**
   * Aligns a local obstacle group to sit on the sphere surface at `normal`
   * with its local +Y axis pointing along the outward surface normal.
   */
  _createSurfaceAnchor(normal, radius, type) {
    const group = new THREE.Group();
    const pos = normal.clone().multiplyScalar(this.radius);
    group.position.copy(pos);

    const up = new THREE.Vector3(0, 1, 0);
    group.quaternion.setFromUnitVectors(up, normal);

    // Animated coastline foam ring around obstacle base
    const foamGeo = new THREE.PlaneGeometry(radius * 3.1, radius * 3.1, 16, 16);
    foamGeo.rotateX(-Math.PI / 2);
    const foamMesh = new THREE.Mesh(foamGeo, this.foamMaterial);
    foamMesh.position.y = 0.08;
    foamMesh.renderOrder = 3;
    group.add(foamMesh);

    this.obstacleGroup.add(group);

    // Register obstacle in logical list and mark cells impassable in TerritoryGrid
    this.obstacles.push({
      normal: normal.clone(),
      position: pos,
      radius,
      type,
      mesh: group
    });

    this.territoryGrid.markObstacleDisk(normal, radius * 0.92);
    return group;
  }

  /**
   * 1. Jagged Sea Cliffs & Rocks:
   * Stylized low-poly rock spires emerging from the water with mossy crowns.
   */
  _buildJaggedCliff(normal, radius, rand) {
    const group = this._createSurfaceAnchor(normal, radius, 'CLIFF');

    const rockMatDark = new THREE.MeshStandardMaterial({
      color: 0x3d4856,
      roughness: 0.85,
      metalness: 0.08,
      flatShading: true
    });
    const rockMatLight = new THREE.MeshStandardMaterial({
      color: 0x596677,
      roughness: 0.8,
      metalness: 0.05,
      flatShading: true
    });
    const mossMat = new THREE.MeshStandardMaterial({
      color: 0x3b8c52,
      roughness: 0.75,
      flatShading: true
    });

    // Central tall jagged spire + 3–4 surrounding crags
    const spireCount = 4 + Math.floor(rand() * 3);
    for (let i = 0; i < spireCount; i++) {
      const isMain = i === 0;
      const cragRadius = isMain ? radius * 0.65 : radius * (0.32 + rand() * 0.26);
      const cragHeight = isMain ? radius * (1.8 + rand() * 0.6) : radius * (0.85 + rand() * 0.85);

      const coneGeo = new THREE.ConeGeometry(cragRadius, cragHeight, 5 + Math.floor(rand() * 3), 2);
      // Perturb vertices for jagged low-poly cliff silhouette
      const posAttr = coneGeo.attributes.position;
      for (let v = 0; v < posAttr.count; v++) {
        const vx = posAttr.getX(v);
        const vy = posAttr.getY(v);
        const vz = posAttr.getZ(v);
        const jitter = 0.82 + rand() * 0.36;
        posAttr.setXYZ(v, vx * jitter, vy, vz * jitter);
      }
      coneGeo.computeVertexNormals();

      const mesh = new THREE.Mesh(coneGeo, i % 2 === 0 ? rockMatDark : rockMatLight);
      const angle = (i / spireCount) * Math.PI * 2 + rand() * 0.5;
      const dist = isMain ? 0 : radius * (0.32 + rand() * 0.25);

      mesh.position.set(
        Math.cos(angle) * dist,
        cragHeight * 0.35 - 0.8,
        Math.sin(angle) * dist
      );
      mesh.rotation.set((rand() - 0.5) * 0.28, rand() * Math.PI, (rand() - 0.5) * 0.28);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);

      // Mossy cap on taller spires
      if (isMain || rand() > 0.45) {
        const capGeo = new THREE.DodecahedronGeometry(cragRadius * 0.58, 0);
        const capMesh = new THREE.Mesh(capGeo, mossMat);
        capMesh.position.copy(mesh.position);
        capMesh.position.y += cragHeight * 0.22;
        capMesh.scale.set(1.1, 0.45, 1.1);
        capMesh.castShadow = true;
        group.add(capMesh);
      }
    }
  }

  /**
   * 2. Giant Thick Ancient Trees:
   * Massive, wide-trunked tropical canopy trees rooted on warm sandy islets.
   */
  _buildAncientTreeIsland(normal, radius, rand) {
    const group = this._createSurfaceAnchor(normal, radius, 'ANCIENT_TREE');

    // Warm sandy islet mound
    const sandMat = new THREE.MeshStandardMaterial({
      color: 0xf4d58d,
      roughness: 0.88,
      flatShading: true
    });
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x38b000,
      roughness: 0.78,
      flatShading: true
    });
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x6c462b,
      roughness: 0.9,
      flatShading: true
    });
    const canopyMat1 = new THREE.MeshStandardMaterial({
      color: 0x1b9aaa,
      roughness: 0.65,
      flatShading: true
    });
    const canopyMat2 = new THREE.MeshStandardMaterial({
      color: 0x2ec4b6,
      roughness: 0.65,
      flatShading: true
    });
    const canopyMat3 = new THREE.MeshStandardMaterial({
      color: 0x52b788,
      roughness: 0.65,
      flatShading: true
    });

    const sandGeo = new THREE.CylinderGeometry(radius * 0.68, radius * 0.95, 2.2, 10);
    const sandMesh = new THREE.Mesh(sandGeo, sandMat);
    sandMesh.position.y = 0.2;
    sandMesh.receiveShadow = true;
    group.add(sandMesh);

    const turfGeo = new THREE.CylinderGeometry(radius * 0.52, radius * 0.68, 0.9, 9);
    const turfMesh = new THREE.Mesh(turfGeo, grassMat);
    turfMesh.position.y = 1.25;
    turfMesh.receiveShadow = true;
    group.add(turfMesh);

    // Massive thick ancient trunk + flaring buttress roots
    const trunkHeight = radius * 1.45;
    const trunkGeo = new THREE.CylinderGeometry(radius * 0.24, radius * 0.44, trunkHeight, 8);
    const trunkMesh = new THREE.Mesh(trunkGeo, trunkMat);
    trunkMesh.position.y = 1.4 + trunkHeight * 0.5;
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    group.add(trunkMesh);

    // Buttress roots radiating from trunk base
    for (let r = 0; r < 5; r++) {
      const rAngle = (r / 5) * Math.PI * 2 + rand() * 0.3;
      const rootGeo = new THREE.BoxGeometry(radius * 0.16, trunkHeight * 0.55, radius * 0.48);
      const rootMesh = new THREE.Mesh(rootGeo, trunkMat);
      rootMesh.position.set(
        Math.cos(rAngle) * radius * 0.28,
        1.8,
        Math.sin(rAngle) * radius * 0.28
      );
      rootMesh.rotation.y = -rAngle + Math.PI / 2;
      rootMesh.rotation.x = 0.42;
      rootMesh.castShadow = true;
      group.add(rootMesh);
    }

    // Lush layered tropical canopy crowns
    const canopyMats = [canopyMat1, canopyMat2, canopyMat3];
    const crownOffsets = [
      { x: 0, y: trunkHeight + 2.4, z: 0, s: radius * 0.78 },
      { x: radius * 0.35, y: trunkHeight + 1.5, z: radius * 0.2, s: radius * 0.56 },
      { x: -radius * 0.35, y: trunkHeight + 1.6, z: -radius * 0.18, s: radius * 0.58 },
      { x: 0.1, y: trunkHeight + 1.7, z: -radius * 0.36, s: radius * 0.52 },
      { x: -0.1, y: trunkHeight + 1.4, z: radius * 0.36, s: radius * 0.5 }
    ];

    for (let c = 0; c < crownOffsets.length; c++) {
      const co = crownOffsets[c];
      const crownGeo = new THREE.IcosahedronGeometry(co.s, 1);
      const crownMesh = new THREE.Mesh(crownGeo, canopyMats[c % canopyMats.length]);
      crownMesh.position.set(co.x, co.y, co.z);
      crownMesh.scale.set(1.18, 0.65, 1.18);
      crownMesh.castShadow = true;
      crownMesh.receiveShadow = true;
      group.add(crownMesh);
    }
  }

  /**
   * 3. Vibrant Coral Reefs:
   * Shallow, colorful reef clusters slightly submerged/breaking the water surface.
   */
  _buildCoralReef(normal, radius, rand) {
    const group = this._createSurfaceAnchor(normal, radius, 'CORAL_REEF');

    const reefPalette = [
      0xff4d6d, // Coral Pink
      0xff9f1c, // Sunburst Tang
      0x7209b7, // Sea Fan Violet
      0x00f5d4, // Bioluminescent Cyan
      0xf72585, // Neon Anemone
      0xffbe0b  // Golden Sponge
    ];

    // Shallow limestone reef shelf
    const shelfMat = new THREE.MeshStandardMaterial({
      color: 0x2b7a78,
      roughness: 0.85,
      flatShading: true
    });
    const shelfGeo = new THREE.CylinderGeometry(radius * 0.82, radius * 0.96, 1.4, 9);
    const shelfMesh = new THREE.Mesh(shelfGeo, shelfMat);
    shelfMesh.position.y = -0.15;
    group.add(shelfMesh);

    const clusterCount = 8 + Math.floor(rand() * 5);
    for (let i = 0; i < clusterCount; i++) {
      const col = reefPalette[i % reefPalette.length];
      const coralMat = new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.22,
        roughness: 0.5,
        flatShading: true
      });

      const angle = (i / clusterCount) * Math.PI * 2 + rand() * 0.4;
      const dist = (i === 0 ? 0 : (0.2 + rand() * 0.58)) * radius;

      let geo;
      if (i % 3 === 0) {
        // Brain coral dome
        geo = new THREE.DodecahedronGeometry(radius * (0.24 + rand() * 0.14), 1);
      } else if (i % 3 === 1) {
        // Staghorn coral branch
        geo = new THREE.ConeGeometry(radius * 0.16, radius * (0.65 + rand() * 0.35), 6);
      } else {
        // Tubular sponge cluster
        geo = new THREE.CylinderGeometry(radius * 0.14, radius * 0.2, radius * 0.6, 6);
      }

      const mesh = new THREE.Mesh(geo, coralMat);
      mesh.position.set(
        Math.cos(angle) * dist,
        0.55 + rand() * 0.65,
        Math.sin(angle) * dist
      );
      mesh.rotation.set((rand() - 0.5) * 0.4, rand() * Math.PI, (rand() - 0.5) * 0.4);
      mesh.castShadow = true;
      group.add(mesh);
    }
  }

  /**
   * Finds a safe unit normal on the sphere away from static obstacles and active contenders.
   */
  findSafeSpawnNormal(contenders = [], minObstacleClearance = 16.5, minContenderClearance = 24.0) {
    const candidate = new THREE.Vector3();

    for (let attempt = 0; attempt < 120; attempt++) {
      // Uniform random point on unit sphere
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

      // Check contender clearance (becomes progressively more permissive on late attempts)
      const clearance = attempt < 60 ? minContenderClearance : minContenderClearance * 0.55;
      for (let i = 0; i < contenders.length; i++) {
        const c = contenders[i];
        if (!c || c.isEliminated || !c.normal) continue;
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

  update(elapsedTime, deltaTime) {
    this.oceanMaterial.uniforms.uTime.value = elapsedTime;
    this.foamMaterial.uniforms.uTime.value = elapsedTime;
    this.sunbeamsMaterial.uniforms.uTime.value = elapsedTime;

    if (this.mistParticles) {
      this.mistParticles.rotation.y = elapsedTime * 0.015;
    }
  }
}

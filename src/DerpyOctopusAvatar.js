// ============================================================================
// APUS.IO — 1.8X CLAYMORPHISM DERPY CHIBI OCTOPUS & CATMULL-ROM TUBE TENTACLES
// ============================================================================
import * as THREE from 'three';
import { CONFIG } from './Config.js';
import { createGhostEctoplasmMaterial } from './Shaders.js';

export class DerpyOctopusAvatar {
  /**
   * @param {Object} options
   * @param {number|string} options.baseColor
   * @param {string} options.figurineId
   * @param {number} options.seed
   * @param {number} options.scale
   */
  constructor({
    baseColor = 0xff5c8a,
    figurineId = 'tin_colander',
    seed = 1,
    scale = CONFIG.OCTOPUS_SCALE || 1.8
  } = {}) {
    this.seed = seed;
    this.baseColor = new THREE.Color(baseColor);
    this.figurineId = figurineId;
    this.isGhost = false;
    this.opacity = 1.0;

    // Root group scaled by 1.8x (Big Derpy Chibi Octopus!)
    this.root = new THREE.Group();
    this.root.scale.setScalar(scale);

    // Squash & stretch / wobble physics state
    this.squashImpact = 0;
    this.booSpinTimer = 0;
    this.propellerAngle = 0;

    // Independent eye blink timers (out-of-sync!)
    this.blinkTimerL = 1.2 + (seed % 3) * 0.7;
    this.blinkTimerR = 2.1 + (seed % 5) * 0.5;

    this._initMaterials();
    this._buildLopsidedMantleAndFace();
    this._buildCatmullRomTubeTentacles();
    this._buildHeadgearContainer();
    this.setFigurine(this.figurineId);
  }

  _initMaterials() {
    const darker = this.baseColor.clone().multiplyScalar(0.55);
    const lighter = this.baseColor.clone().lerp(new THREE.Color(0xffffff), 0.48);

    // Soft tactile Sunny Claymorphism material (smooth normals, warm studio sheen)
    this.skinMat = new THREE.MeshStandardMaterial({
      color: this.baseColor,
      emissive: darker,
      emissiveIntensity: 0.18,
      roughness: 0.36,
      metalness: 0.04,
      flatShading: false,
      transparent: true,
      opacity: 1.0
    });

    this.underbellyMat = new THREE.MeshStandardMaterial({
      color: lighter,
      emissive: this.baseColor,
      emissiveIntensity: 0.14,
      roughness: 0.42,
      metalness: 0.02,
      flatShading: false,
      transparent: true,
      opacity: 1.0
    });

    this.eyeWhiteMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.12,
      metalness: 0.05,
      flatShading: false,
      transparent: true,
      opacity: 1.0
    });

    this.pupilMat = new THREE.MeshStandardMaterial({
      color: 0x0d1321,
      roughness: 0.1,
      flatShading: false
    });

    this.tongueMat = new THREE.MeshStandardMaterial({
      color: 0xff5c8a,
      roughness: 0.38,
      flatShading: false,
      transparent: true,
      opacity: 1.0
    });

    this.toothMat = new THREE.MeshStandardMaterial({
      color: 0xfffdf5,
      roughness: 0.22,
      flatShading: false
    });

    this.ghostMat = createGhostEctoplasmMaterial();
  }

  setColor(colorHexOrInt) {
    this.baseColor.set(colorHexOrInt);
    const darker = this.baseColor.clone().multiplyScalar(0.55);
    const lighter = this.baseColor.clone().lerp(new THREE.Color(0xffffff), 0.48);
    this.skinMat.color.copy(this.baseColor);
    this.skinMat.emissive.copy(darker);
    this.underbellyMat.color.copy(lighter);
    this.underbellyMat.emissive.copy(this.baseColor);
  }

  setGhostMode(isGhost) {
    if (this.isGhost === isGhost) return;
    this.isGhost = isGhost;

    const activeBodyMat = isGhost ? this.ghostMat : this.skinMat;
    const activeCupMat = isGhost ? this.ghostMat : this.underbellyMat;

    this.mantleMesh.material = activeBodyMat;
    this.snoutMesh.material = activeBodyMat;
    this.eyelidL.material = activeBodyMat;
    this.eyelidR.material = activeBodyMat;

    for (let i = 0; i < this.tentacles.length; i++) {
      const t = this.tentacles[i];
      t.tubeMesh.material = activeBodyMat;
      t.tipMesh.material = activeBodyMat;
      for (const c of t.cupMeshes) {
        c.material = activeCupMat;
      }
    }
  }

  setCloakOpacity(opacity) {
    if (this.isGhost) return;
    this.opacity = opacity;
    this.skinMat.opacity = opacity;
    this.underbellyMat.opacity = opacity;
    this.eyeWhiteMat.opacity = opacity;
  }

  triggerSquashImpulse(strength = 0.45) {
    this.squashImpact = Math.min(0.85, this.squashImpact + strength);
  }

  triggerGhostBooEmote() {
    this.booSpinTimer = 0.85;
    this.triggerSquashImpulse(0.55);
  }

  /**
   * 1. Builds the Squishy Lopsided Clay Mantle, Mismatched Googly Eyes,
   * Out-of-Sync Eyelids, Crooked Tongue, and Buck-Tooth.
   */
  _buildLopsidedMantleAndFace() {
    this.mantleGroup = new THREE.Group();
    this.mantleGroup.position.set(0, 1.25, 0);
    this.mantleGroup.rotation.z = 0.08;
    this.root.add(this.mantleGroup);

    const headGeo = new THREE.SphereGeometry(1.36, 32, 28);
    const pos = headGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);

      if (y > 0) {
        x *= 1.0 + y * 0.13;
        z *= 1.0 + y * 0.1;
        if (x < 0) x *= 1.09;
      } else {
        x *= 0.94;
        z *= 0.94;
      }
      pos.setXYZ(i, x, y * 1.06, z);
    }
    headGeo.computeVertexNormals();

    this.mantleMesh = new THREE.Mesh(headGeo, this.skinMat);
    this.mantleMesh.castShadow = true;
    this.mantleMesh.receiveShadow = true;
    this.mantleGroup.add(this.mantleMesh);

    // Chubby clay siphon/mouth ring
    const snoutGeo = new THREE.CylinderGeometry(0.26, 0.36, 0.42, 20);
    snoutGeo.rotateX(Math.PI / 2);
    snoutGeo.computeVertexNormals();
    this.snoutMesh = new THREE.Mesh(snoutGeo, this.skinMat);
    this.snoutMesh.position.set(0.16, -0.22, 1.26);
    this.snoutMesh.rotation.y = 0.14;
    this.mantleGroup.add(this.snoutMesh);

    // --- DERPY GOOGLY EYES (Mismatched sizes!) ---
    // Left eye (+X): Oversized bulging eye
    this.eyeGroupL = new THREE.Group();
    this.eyeGroupL.position.set(0.50, 0.22, 1.16);
    this.mantleGroup.add(this.eyeGroupL);

    const eyeRadiusL = 0.46;
    const eyeGeoL = new THREE.SphereGeometry(eyeRadiusL, 24, 20);
    eyeGeoL.computeVertexNormals();
    const eyeSphereL = new THREE.Mesh(eyeGeoL, this.eyeWhiteMat);
    eyeSphereL.scale.set(1.0, 1.05, 0.86);
    this.eyeGroupL.add(eyeSphereL);

    const pupilGeoL = new THREE.SphereGeometry(0.20, 18, 16);
    pupilGeoL.computeVertexNormals();
    this.pupilL = new THREE.Mesh(pupilGeoL, this.pupilMat);
    this.pupilL.scale.set(1.0, 1.0, 0.48);
    this.pupilL.position.set(-0.08, 0.02, eyeRadiusL * 0.84);
    this.eyeGroupL.add(this.pupilL);

    const lidGeoL = new THREE.SphereGeometry(eyeRadiusL * 1.06, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.52);
    lidGeoL.computeVertexNormals();
    this.eyelidL = new THREE.Mesh(lidGeoL, this.skinMat);
    this.eyelidL.rotation.x = -Math.PI * 0.45;
    this.eyeGroupL.add(this.eyelidL);

    // Right eye (-X): Smaller, lower googly eye
    this.eyeGroupR = new THREE.Group();
    this.eyeGroupR.position.set(-0.46, 0.04, 1.18);
    this.mantleGroup.add(this.eyeGroupR);

    const eyeRadiusR = 0.30;
    const eyeGeoR = new THREE.SphereGeometry(eyeRadiusR, 22, 18);
    eyeGeoR.computeVertexNormals();
    const eyeSphereR = new THREE.Mesh(eyeGeoR, this.eyeWhiteMat);
    eyeSphereR.scale.set(1.0, 1.0, 0.86);
    this.eyeGroupR.add(eyeSphereR);

    const pupilGeoR = new THREE.SphereGeometry(0.14, 16, 14);
    pupilGeoR.computeVertexNormals();
    this.pupilR = new THREE.Mesh(pupilGeoR, this.pupilMat);
    this.pupilR.scale.set(1.0, 1.0, 0.48);
    this.pupilR.position.set(0.06, -0.03, eyeRadiusR * 0.84);
    this.eyeGroupR.add(this.pupilR);

    const lidGeoR = new THREE.SphereGeometry(eyeRadiusR * 1.07, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.52);
    lidGeoR.computeVertexNormals();
    this.eyelidR = new THREE.Mesh(lidGeoR, this.skinMat);
    this.eyelidR.rotation.x = -Math.PI * 0.42;
    this.eyeGroupR.add(this.eyelidR);

    // Crooked Tongue & Buck-Tooth
    const tongueGeo = new THREE.SphereGeometry(0.22, 16, 14);
    tongueGeo.scale(0.85, 0.38, 1.35);
    tongueGeo.computeVertexNormals();
    this.tongueMesh = new THREE.Mesh(tongueGeo, this.tongueMat);
    this.tongueMesh.position.set(-0.22, -0.38, 1.26);
    this.tongueMesh.rotation.set(0.45, -0.25, -0.3);
    this.mantleGroup.add(this.tongueMesh);

    const toothGeo = new THREE.BoxGeometry(0.14, 0.18, 0.08);
    toothGeo.computeVertexNormals();
    this.buckTooth = new THREE.Mesh(toothGeo, this.toothMat);
    this.buckTooth.position.set(0.02, -0.32, 1.32);
    this.buckTooth.rotation.set(0.15, 0, 0.18);
    this.mantleGroup.add(this.buckTooth);
  }

  /**
   * 2. Builds 8 Thick, Sprawling, Asymmetrical Tentacles using
   * `THREE.CatmullRomCurve3` + `THREE.TubeGeometry(curve, 20, 0.24, 12, false)`
   * with independent spring-lag physics so they flop, wiggle, and drag behind comically!
   */
  _buildCatmullRomTubeTentacles() {
    this.tentacles = [];
    this.tentacleRoot = new THREE.Group();
    this.tentacleRoot.position.set(0, 0.42, 0);
    this.root.add(this.tentacleRoot);

    let s = (this.seed + 1) * 48271;
    const rand = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };

    const irregularAngles = [
      0.22,
      0.92,
      1.74,
      2.46,
      3.32,
      4.08,
      4.88,
      5.56
    ];
    const lengthScales = [1.26, 0.92, 1.34, 0.96, 1.22, 0.88, 1.30, 1.06];

    this.tubularSegments = 20;
    this.tubeRadius = 0.24;
    this.radialSegments = 12;

    for (let i = 0; i < 8; i++) {
      const baseAngle = irregularAngles[i] + (rand() - 0.5) * 0.22;
      const lenMult = lengthScales[i];
      const totalLen = 2.65 * lenMult;

      const anchor = new THREE.Group();
      const radialDist = 0.78 + (rand() - 0.5) * 0.22;
      anchor.position.set(
        Math.sin(baseAngle) * radialDist,
        (rand() - 0.5) * 0.12,
        Math.cos(baseAngle) * radialDist
      );
      anchor.rotation.y = baseAngle + (rand() - 0.5) * 0.28;
      this.tentacleRoot.add(anchor);

      // 5 CatmullRomCurve3 control points along local +Z
      const ctrlPts = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, -0.08, totalLen * 0.26),
        new THREE.Vector3((rand() - 0.5) * 0.35, -0.14, totalLen * 0.54),
        new THREE.Vector3((rand() - 0.5) * 0.55, -0.05, totalLen * 0.80),
        new THREE.Vector3((rand() - 0.5) * 0.70, 0.12, totalLen)
      ];

      const curve = new THREE.CatmullRomCurve3(ctrlPts);
      // Exact requested geometry: THREE.TubeGeometry(curve, 20, 0.24, 12, false)
      const tubeGeo = new THREE.TubeGeometry(
        curve,
        this.tubularSegments,
        this.tubeRadius,
        this.radialSegments,
        false
      );
      tubeGeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
      tubeGeo.computeVertexNormals();

      const tubeMesh = new THREE.Mesh(tubeGeo, this.skinMat);
      tubeMesh.castShadow = true;
      tubeMesh.receiveShadow = true;
      anchor.add(tubeMesh);

      // Smooth rounded tentacle tip cap
      const tipGeo = new THREE.SphereGeometry(this.tubeRadius * 0.72, 16, 16);
      tipGeo.computeVertexNormals();
      const tipMesh = new THREE.Mesh(tipGeo, this.skinMat);
      tipMesh.position.copy(ctrlPts[4]);
      anchor.add(tipMesh);

      // Suction cup bumps along the tentacle underside
      const cupMeshes = [];
      for (let c = 1; c <= 3; c++) {
        const cupGeo = new THREE.SphereGeometry(this.tubeRadius * (0.48 - c * 0.06), 12, 10);
        cupGeo.scale(1.0, 0.55, 1.0);
        cupGeo.computeVertexNormals();
        const cupMesh = new THREE.Mesh(cupGeo, this.underbellyMat);
        anchor.add(cupMesh);
        cupMeshes.push(cupMesh);
      }

      this.tentacles.push({
        index: i,
        anchor,
        ctrlPts,
        curve,
        tubeGeo,
        tubeMesh,
        tipMesh,
        cupMeshes,
        baseAngle,
        totalLen,
        phase: rand() * Math.PI * 2,
        freq: 2.4 + rand() * 2.8,
        stiffness: 6.5 + rand() * 7.0,
        damping: 0.78 + rand() * 0.14,
        curlBiasX: (rand() - 0.45) * 0.55,
        curlBiasY: (rand() - 0.5) * 0.75,
        flailHabit: rand(),
        swingYaw: 0,
        swingVel: 0,
        slapPitch: 0,
        slapVel: 0
      });
    }

    // Pre-allocate helper vectors for fast zero-GC Catmull-Rom tube vertex updates
    this._tmpPt = new THREE.Vector3();
    this._tmpTan = new THREE.Vector3();
    this._tmpNorm = new THREE.Vector3();
    this._tmpBinorm = new THREE.Vector3();
    this._tmpUp = new THREE.Vector3(0, 1, 0);
  }

  /**
   * Re-skins the `TubeGeometry` vertex buffer in-place along the live `CatmullRomCurve3`
   * with a plump organic taper from base to tip.
   */
  _updateTentacleTubeVertices(t) {
    const posAttr = t.tubeGeo.attributes.position;
    const normAttr = t.tubeGeo.attributes.normal;
    const posArr = posAttr.array;
    const normArr = normAttr.array;

    const tubSegs = this.tubularSegments;
    const radSegs = this.radialSegments;
    const baseR = this.tubeRadius;

    for (let i = 0; i <= tubSegs; i++) {
      const u = i / tubSegs;
      t.curve.getPoint(u, this._tmpPt);
      t.curve.getTangent(u, this._tmpTan);

      // Build stable orthogonal cross-section frame along the spline
      this._tmpBinorm.crossVectors(this._tmpTan, this._tmpUp);
      if (this._tmpBinorm.lengthSq() < 1e-4) {
        this._tmpBinorm.set(1, 0, 0);
      } else {
        this._tmpBinorm.normalize();
      }
      this._tmpNorm.crossVectors(this._tmpBinorm, this._tmpTan).normalize();

      // Plump clay tentacle taper (thick at root 1.15x -> rounded 0.68x at tip)
      const radiusAtU = baseR * (1.15 - u * 0.46);

      for (let j = 0; j <= radSegs; j++) {
        const v = (j / radSegs) * Math.PI * 2;
        const cosV = Math.cos(v);
        const sinV = Math.sin(v);

        const nx = cosV * this._tmpNorm.x + sinV * this._tmpBinorm.x;
        const ny = cosV * this._tmpNorm.y + sinV * this._tmpBinorm.y;
        const nz = cosV * this._tmpNorm.z + sinV * this._tmpBinorm.z;

        const vIdx = (i * (radSegs + 1) + j) * 3;
        posArr[vIdx]     = this._tmpPt.x + radiusAtU * nx;
        posArr[vIdx + 1] = this._tmpPt.y + radiusAtU * ny;
        posArr[vIdx + 2] = this._tmpPt.z + radiusAtU * nz;

        normArr[vIdx]     = nx;
        normArr[vIdx + 1] = ny;
        normArr[vIdx + 2] = nz;
      }
    }

    posAttr.needsUpdate = true;
    normAttr.needsUpdate = true;

    // Sync rounded tip sphere & suction cups along the spline
    t.tipMesh.position.copy(t.ctrlPts[4]);
    for (let c = 0; c < t.cupMeshes.length; c++) {
      const cupU = (c + 1) * 0.24;
      t.curve.getPoint(cupU, this._tmpPt);
      t.cupMeshes[c].position.set(this._tmpPt.x, this._tmpPt.y - baseR * 0.65, this._tmpPt.z);
    }
  }

  _buildHeadgearContainer() {
    this.headgearGroup = new THREE.Group();
    this.headgearGroup.position.set(0, 1.24, 0);
    this.mantleGroup.add(this.headgearGroup);
  }

  setFigurine(figurineId) {
    this.figurineId = figurineId;
    while (this.headgearGroup.children.length > 0) {
      this.headgearGroup.remove(this.headgearGroup.children[0]);
    }
    this.propellerBladeGroup = null;
    this.rubberDuckGroup = null;

    switch (figurineId) {
      case 'tin_colander':
        this._buildTinColander();
        break;
      case 'sliding_crown':
        this._buildSlidingCrown();
        break;
      case 'cracked_fishbowl':
        this._buildCrackedFishbowl();
        break;
      case 'soggy_pirate':
        this._buildSoggyPirate();
        break;
      case 'traffic_cone':
        this._buildTrafficCone();
        break;
      case 'propeller_beanie':
        this._buildPropellerBeanie();
        break;
      default:
        this._buildTinColander();
        break;
    }
  }

  _buildTinColander() {
    const group = new THREE.Group();
    group.position.set(-0.12, -0.05, -0.05);
    group.rotation.set(-0.20, 0.3, 0.24);

    const tinMat = new THREE.MeshStandardMaterial({
      color: 0xd8e2e8,
      roughness: 0.26,
      metalness: 0.72,
      flatShading: false,
      side: THREE.DoubleSide
    });
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x263238 });

    const bowlGeo = new THREE.SphereGeometry(1.18, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.54);
    bowlGeo.computeVertexNormals();
    const bowlMesh = new THREE.Mesh(bowlGeo, tinMat);
    bowlMesh.position.y = -0.35;
    group.add(bowlMesh);

    const rimGeo = new THREE.TorusGeometry(1.16, 0.085, 12, 28);
    rimGeo.rotateX(Math.PI / 2);
    rimGeo.computeVertexNormals();
    const rimMesh = new THREE.Mesh(rimGeo, tinMat);
    rimMesh.position.y = -0.35;
    group.add(rimMesh);

    for (const sign of [-1, 1]) {
      const handleGeo = new THREE.TorusGeometry(0.24, 0.06, 10, 18);
      handleGeo.computeVertexNormals();
      const handle = new THREE.Mesh(handleGeo, tinMat);
      handle.position.set(sign * 1.24, -0.18, 0);
      handle.rotation.z = sign * 0.4;
      group.add(handle);
    }

    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.08, 12), holeMat);
      dot.position.set(Math.cos(ang) * 0.85, 0.22, Math.sin(ang) * 0.85);
      dot.lookAt(Math.cos(ang) * 2, 1.0, Math.sin(ang) * 2);
      group.add(dot);
    }

    const spoonGroup = new THREE.Group();
    spoonGroup.position.set(0.68, 0.55, 0.35);
    spoonGroup.rotation.set(0.4, 0.2, -0.65);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.95, 12), tinMat);
    const scoopGeo = new THREE.SphereGeometry(0.2, 16, 14);
    scoopGeo.scale(0.8, 1.25, 0.35);
    scoopGeo.computeVertexNormals();
    const scoop = new THREE.Mesh(scoopGeo, tinMat);
    scoop.position.set(0.06, 0.52, 0);
    scoop.rotation.z = -0.35;
    spoonGroup.add(stem, scoop);
    group.add(spoonGroup);

    this.headgearGroup.add(group);
  }

  _buildSlidingCrown() {
    const group = new THREE.Group();
    group.position.set(0.42, -0.05, 0.25);
    group.rotation.set(0.32, 0.15, -0.52);

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffd100,
      emissive: 0x996b00,
      emissiveIntensity: 0.25,
      roughness: 0.22,
      metalness: 0.78,
      flatShading: false
    });
    const rubyMat = new THREE.MeshStandardMaterial({
      color: 0xff1744,
      emissive: 0xaa0022,
      emissiveIntensity: 0.4,
      roughness: 0.15,
      flatShading: false
    });

    const bandGeo = new THREE.CylinderGeometry(0.88, 0.78, 0.42, 24, 1, true);
    bandGeo.computeVertexNormals();
    const band = new THREE.Mesh(bandGeo, goldMat);
    group.add(band);

    const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.08, 12, 24).rotateX(Math.PI / 2), goldMat);
    baseRing.position.y = -0.18;
    group.add(baseRing);

    const spikes = 5;
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2;
      const spikeGeo = new THREE.ConeGeometry(0.24, 0.58, 16);
      spikeGeo.computeVertexNormals();
      const spike = new THREE.Mesh(spikeGeo, goldMat);
      spike.position.set(Math.cos(a) * 0.82, 0.44, Math.sin(a) * 0.82);
      spike.rotation.y = -a;
      group.add(spike);

      const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 14), rubyMat);
      pearl.position.set(Math.cos(a) * 0.84, 0.74, Math.sin(a) * 0.84);
      group.add(pearl);
    }

    this.headgearGroup.add(group);
  }

  _buildCrackedFishbowl() {
    const group = new THREE.Group();
    group.position.set(0.05, 0.28, -0.05);
    group.rotation.set(-0.18, 0.1, -0.22);

    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xd8f8ff,
      roughness: 0.08,
      metalness: 0.1,
      flatShading: false,
      transparent: true,
      opacity: 0.42
    });
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x00bbf9,
      flatShading: false,
      transparent: true,
      opacity: 0.55
    });
    const duckMat = new THREE.MeshStandardMaterial({
      color: 0xffea00,
      roughness: 0.3,
      flatShading: false
    });
    const beakMat = new THREE.MeshStandardMaterial({
      color: 0xff6d00,
      roughness: 0.3,
      flatShading: false
    });

    const bowl = new THREE.Mesh(new THREE.SphereGeometry(1.12, 24, 20), glassMat);
    group.add(bowl);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.09, 12, 24).rotateX(Math.PI / 2), glassMat);
    rim.position.y = 0.88;
    group.add(rim);

    const waterGeo = new THREE.SphereGeometry(0.98, 22, 16, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55);
    waterGeo.computeVertexNormals();
    const water = new THREE.Mesh(waterGeo, waterMat);
    group.add(water);

    this.rubberDuckGroup = new THREE.Group();
    this.rubberDuckGroup.position.set(0.1, 0.12, 0.15);

    const duckBody = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 14), duckMat);
    duckBody.scale.set(0.9, 0.75, 1.2);
    const duckHead = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 14), duckMat);
    duckHead.position.set(0, 0.24, 0.18);
    const duckBeak = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 12).rotateX(Math.PI / 2), beakMat);
    duckBeak.position.set(0, 0.22, 0.38);

    this.rubberDuckGroup.add(duckBody, duckHead, duckBeak);
    group.add(this.rubberDuckGroup);

    this.headgearGroup.add(group);
  }

  _buildSoggyPirate() {
    const group = new THREE.Group();
    group.position.set(0, 0.05, 0);

    const paperMat = new THREE.MeshStandardMaterial({
      color: 0xe6dfd3,
      roughness: 0.78,
      flatShading: false
    });
    const strapMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.7,
      flatShading: false
    });

    const hatGroup = new THREE.Group();
    hatGroup.position.set(-0.08, 0.15, -0.05);
    hatGroup.rotation.set(-0.14, 0.18, 0.22);

    const brimGeo = new THREE.CylinderGeometry(0.35, 1.25, 0.45, 20);
    brimGeo.scale(1.0, 1.0, 0.45);
    brimGeo.computeVertexNormals();
    const brim = new THREE.Mesh(brimGeo, paperMat);
    const peakGeo = new THREE.ConeGeometry(0.95, 0.92, 20);
    peakGeo.scale(1.25, 1.0, 0.45);
    peakGeo.computeVertexNormals();
    const peak = new THREE.Mesh(peakGeo, paperMat);
    peak.position.y = 0.45;
    hatGroup.add(brim, peak);
    group.add(hatGroup);

    const bandGeo = new THREE.TorusGeometry(1.18, 0.045, 10, 24);
    bandGeo.rotateX(Math.PI / 2);
    bandGeo.computeVertexNormals();
    const band = new THREE.Mesh(bandGeo, strapMat);
    band.position.set(0, -0.45, 0.06);
    band.rotation.z = -0.18;
    group.add(band);

    const patchGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.08, 18);
    patchGeo.rotateX(Math.PI / 2);
    patchGeo.computeVertexNormals();
    const patch = new THREE.Mesh(patchGeo, strapMat);
    patch.position.set(-0.18, -0.35, 1.22);
    patch.rotation.z = -0.25;
    group.add(patch);

    this.headgearGroup.add(group);
  }

  _buildTrafficCone() {
    const group = new THREE.Group();
    group.position.set(0.12, 0.02, -0.12);
    group.rotation.set(-0.28, 0.1, -0.26);

    const orangeMat = new THREE.MeshStandardMaterial({
      color: 0xff6d00,
      emissive: 0x993300,
      emissiveIntensity: 0.18,
      roughness: 0.36,
      flatShading: false
    });
    const whiteStripeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xcccccc,
      emissiveIntensity: 0.22,
      roughness: 0.28,
      flatShading: false
    });

    const flange = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.16, 1.85), orangeMat);
    flange.position.y = -0.2;
    group.add(flange);

    const coneGeo = new THREE.ConeGeometry(0.76, 1.95, 24);
    coneGeo.computeVertexNormals();
    const cone = new THREE.Mesh(coneGeo, orangeMat);
    cone.position.y = 0.72;
    group.add(cone);

    const stripe1 = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.54, 0.28, 24), whiteStripeMat);
    stripe1.position.y = 0.55;
    const stripe2 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.22, 24), whiteStripeMat);
    stripe2.position.y = 1.05;
    group.add(stripe1, stripe2);

    this.headgearGroup.add(group);
  }

  _buildPropellerBeanie() {
    const group = new THREE.Group();
    group.position.set(-0.05, -0.12, 0);
    group.rotation.set(-0.1, 0, 0.14);

    const capMat1 = new THREE.MeshStandardMaterial({ color: 0xffbe0b, roughness: 0.42, flatShading: false });
    const capMat2 = new THREE.MeshStandardMaterial({ color: 0x00bbf9, roughness: 0.42, flatShading: false });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xff0055, roughness: 0.32, flatShading: false });

    const capDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.96, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.52),
      capMat1
    );
    group.add(capDome);

    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.1, 0.65), capMat2);
    brim.position.set(0, 0.08, 0.88);
    brim.rotation.x = 0.2;
    group.add(brim);

    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.42, 12), redMat);
    spindle.position.y = 1.05;
    group.add(spindle);

    this.propellerBladeGroup = new THREE.Group();
    this.propellerBladeGroup.position.y = 1.24;

    const bladeGeo = new THREE.BoxGeometry(1.45, 0.05, 0.22);
    const blade1 = new THREE.Mesh(bladeGeo, redMat);
    const blade2 = new THREE.Mesh(bladeGeo, capMat2);
    blade2.rotation.y = Math.PI * 0.5;
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 14), capMat1);
    this.propellerBladeGroup.add(blade1, blade2, hub);
    group.add(this.propellerBladeGroup);

    this.headgearGroup.add(group);
  }

  /**
   * Updates the squishy mantle, googly eyes, headgear, and the 8 CatmullRomCurve3 + TubeGeometry tentacles!
   */
  update(dt, elapsedTime, {
    turnRate = 0,
    speedRatio = 1.0,
    isBoost = false,
    isStunned = false
  } = {}) {
    if (this.isGhost) {
      this.ghostMat.uniforms.uTime.value = elapsedTime;
    }

    // 1. Squishy mantle wobble
    this.squashImpact = Math.max(0, this.squashImpact - dt * 2.6);
    const turnWobble = Math.abs(turnRate) * 0.09;
    const waveJiggle = Math.sin(elapsedTime * 7.2 + this.seed) * (0.055 + turnWobble + this.squashImpact * 0.26);

    const sx = 1.0 + waveJiggle + this.squashImpact * 0.22;
    const sy = Math.max(0.7, 1.0 - waveJiggle * 1.12 - this.squashImpact * 0.26);
    const sz = 1.0 + waveJiggle * 0.8 + this.squashImpact * 0.18;
    this.mantleGroup.scale.set(sx, sy, sz);

    const stunShake = isStunned ? Math.sin(elapsedTime * 38.0) * 0.32 : 0;
    this.mantleGroup.rotation.z = 0.08 - turnRate * 0.14 + stunShake;
    this.mantleGroup.rotation.x = (isBoost ? 0.16 : 0.04) + Math.cos(elapsedTime * 5.0 + this.seed) * 0.05;

    if (this.booSpinTimer > 0) {
      this.booSpinTimer = Math.max(0, this.booSpinTimer - dt);
      const spinProgress = 1.0 - this.booSpinTimer / 0.85;
      this.mantleGroup.rotation.y = spinProgress * Math.PI * 2;
    } else {
      this.mantleGroup.rotation.y = Math.sin(elapsedTime * 2.6 + this.seed) * 0.07;
    }

    // 2. Derpy Googly Eyes & out-of-sync blinking
    const targetPupilLX = THREE.MathUtils.clamp(-0.07 - turnRate * 0.06 + Math.sin(elapsedTime * 3.1) * 0.05, -0.18, 0.16);
    const targetPupilLY = THREE.MathUtils.clamp(0.02 + Math.cos(elapsedTime * 2.7) * 0.06, -0.14, 0.14);
    const targetPupilRX = THREE.MathUtils.clamp(0.05 + turnRate * 0.05 - Math.cos(elapsedTime * 2.3) * 0.04, -0.11, 0.11);
    const targetPupilRY = THREE.MathUtils.clamp(-0.03 - Math.sin(elapsedTime * 3.4) * 0.05, -0.1, 0.1);

    this.pupilL.position.x = THREE.MathUtils.lerp(this.pupilL.position.x, targetPupilLX, dt * 7.0);
    this.pupilL.position.y = THREE.MathUtils.lerp(this.pupilL.position.y, targetPupilLY, dt * 7.0);
    this.pupilR.position.x = THREE.MathUtils.lerp(this.pupilR.position.x, targetPupilRX, dt * 4.5);
    this.pupilR.position.y = THREE.MathUtils.lerp(this.pupilR.position.y, targetPupilRY, dt * 4.5);

    this.blinkTimerL -= dt;
    if (this.blinkTimerL <= 0) this.blinkTimerL = 2.4 + Math.random() * 2.8;
    this.eyelidL.rotation.x = this.blinkTimerL < 0.14 ? 0.05 : -Math.PI * 0.45;

    this.blinkTimerR -= dt;
    if (this.blinkTimerR <= 0) this.blinkTimerR = 1.9 + Math.random() * 3.1;
    this.eyelidR.rotation.x = this.blinkTimerR < 0.14 ? 0.05 : -Math.PI * 0.42;

    this.tongueMesh.rotation.z = -0.3 + Math.sin(elapsedTime * 8.0 + this.seed) * 0.16;

    // 3. Headgear animations
    if (this.propellerBladeGroup) {
      const spinSpeed = (isBoost ? 28.0 : 14.0) * speedRatio;
      this.propellerAngle += dt * spinSpeed;
      this.propellerBladeGroup.rotation.y = this.propellerAngle;
      this.propellerBladeGroup.rotation.z = Math.sin(elapsedTime * 10.0) * 0.12;
    }
    if (this.rubberDuckGroup) {
      this.rubberDuckGroup.position.y = 0.12 + Math.sin(elapsedTime * 5.5) * 0.05;
      this.rubberDuckGroup.rotation.z = -turnRate * 0.18 + Math.cos(elapsedTime * 4.0) * 0.12;
      this.rubberDuckGroup.rotation.y = elapsedTime * 1.1;
    }

    // 4. Independent Spring-Lag Physics on the 8 CatmullRomCurve3 + TubeGeometry Tentacles!
    for (let i = 0; i < this.tentacles.length; i++) {
      const t = this.tentacles[i];
      const cosBack = Math.cos(t.baseAngle);

      const dragBehindYaw = -turnRate * (0.45 + (1.0 - cosBack) * 0.25)
        + Math.sin(elapsedTime * t.freq + t.phase) * (isBoost ? 0.65 : 0.42)
        + t.curlBiasY * 0.55;

      const yawForce = (dragBehindYaw - t.swingYaw) * t.stiffness;
      t.swingVel = (t.swingVel + yawForce * dt) * Math.pow(t.damping, dt * 60);
      t.swingYaw += t.swingVel * dt;

      let targetPitch = -0.05 + Math.cos(elapsedTime * (t.freq * 1.15) + t.phase * 1.7) * 0.22;
      if (this.isGhost) {
        targetPitch = 0.22 + Math.sin(elapsedTime * 2.8 + t.phase) * 0.42;
      } else if (isBoost || Math.abs(turnRate) > 1.1 || t.flailHabit > 0.6) {
        const flailWave = Math.sin(elapsedTime * (t.freq * 1.75) + i * 2.1);
        targetPitch += Math.max(0, flailWave) * (isBoost ? 0.55 : 0.35);
      }

      const pitchForce = (targetPitch - t.slapPitch) * (t.stiffness * 1.1);
      t.slapVel = (t.slapVel + pitchForce * dt) * Math.pow(t.damping, dt * 60);
      t.slapPitch += t.slapVel * dt;

      // Update the 5 CatmullRomCurve3 control points with cascading phase lag
      const len = t.totalLen;
      for (let k = 1; k < 5; k++) {
        const frac = k / 4;
        const wavePhase = elapsedTime * t.freq - k * 0.72 + t.phase;
        const sideWiggle = Math.sin(wavePhase) * (0.28 + frac * 0.55) + t.swingYaw * frac * 1.25;
        const vertFlop = Math.cos(wavePhase * 1.1) * (0.14 + frac * 0.26)
          + t.slapPitch * frac * 0.95
          + (k === 4 ? 0.16 : -0.10);

        t.ctrlPts[k].set(
          sideWiggle,
          vertFlop,
          len * frac * (1.0 - Math.min(0.28, Math.abs(sideWiggle) * 0.12))
        );
      }

      this._updateTentacleTubeVertices(t);
    }
  }
}

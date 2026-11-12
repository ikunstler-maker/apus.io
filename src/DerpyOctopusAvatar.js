// ============================================================================
// APUS.IO — PROCEDURAL DERPY, CLUMSY CHIBI OCTOPUS AVATAR & GOOFY HEADGEAR
// ============================================================================
import * as THREE from 'three';
import { createGhostEctoplasmMaterial } from './Shaders.js';

export class DerpyOctopusAvatar {
  /**
   * @param {Object} options
   * @param {number|string} options.baseColor
   * @param {string} options.figurineId
   * @param {number} options.seed
   */
  constructor({
    baseColor = 0x00f5d4,
    figurineId = 'tin_colander',
    seed = 1
  } = {}) {
    this.seed = seed;
    this.baseColor = new THREE.Color(baseColor);
    this.figurineId = figurineId;
    this.isGhost = false;
    this.opacity = 1.0;

    // Root group aligned to sphere surface normal
    this.root = new THREE.Group();

    // Squash & stretch / wobble physics state
    this.squashImpact = 0;
    this.booSpinTimer = 0;
    this.propellerAngle = 0;

    // Independent eye blink timers (out-of-sync!)
    this.blinkTimerL = 1.2 + (seed % 3) * 0.7;
    this.blinkTimerR = 2.1 + (seed % 5) * 0.5;
    this.pupilOffsetL = new THREE.Vector2(0.06, -0.03);
    this.pupilOffsetR = new THREE.Vector2(-0.05, 0.04);

    // Materials
    this._initMaterials();

    // Build anatomy
    this._buildLopsidedMantleAndFace();
    this._buildMessySprawlingTentacles();
    this._buildHeadgearContainer();
    this.setFigurine(this.figurineId);
  }

  _initMaterials() {
    const darker = this.baseColor.clone().multiplyScalar(0.65);
    const lighter = this.baseColor.clone().lerp(new THREE.Color(0xffffff), 0.45);

    this.skinMat = new THREE.MeshStandardMaterial({
      color: this.baseColor,
      emissive: darker,
      emissiveIntensity: 0.28,
      roughness: 0.32,
      metalness: 0.08,
      transparent: true,
      opacity: 1.0
    });

    this.underbellyMat = new THREE.MeshStandardMaterial({
      color: lighter,
      emissive: this.baseColor,
      emissiveIntensity: 0.18,
      roughness: 0.4,
      transparent: true,
      opacity: 1.0
    });

    this.eyeWhiteMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.15,
      transparent: true,
      opacity: 1.0
    });

    this.pupilMat = new THREE.MeshBasicMaterial({
      color: 0x090c14
    });

    this.tongueMat = new THREE.MeshStandardMaterial({
      color: 0xff5c8a,
      roughness: 0.4,
      transparent: true,
      opacity: 1.0
    });

    this.toothMat = new THREE.MeshStandardMaterial({
      color: 0xfffdf5,
      roughness: 0.25
    });

    this.ghostMat = createGhostEctoplasmMaterial();
  }

  /**
   * Updates the octopus base paint color dynamically (e.g. from the Pre-Game Lobby customizer).
   */
  setColor(colorHexOrInt) {
    this.baseColor.set(colorHexOrInt);
    const darker = this.baseColor.clone().multiplyScalar(0.65);
    const lighter = this.baseColor.clone().lerp(new THREE.Color(0xffffff), 0.45);
    this.skinMat.color.copy(this.baseColor);
    this.skinMat.emissive.copy(darker);
    this.underbellyMat.color.copy(lighter);
    this.underbellyMat.emissive.copy(this.baseColor);
  }

  /**
   * Switches between Living glossy skin and Ethereal Ghost Ectoplasm shader.
   */
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
      for (const m of t.skinMeshes) {
        m.material = activeBodyMat;
      }
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

  /**
   * Triggers a comical squash-and-stretch impulse (when bumping an obstacle, closing a loop, or respawning).
   */
  triggerSquashImpulse(strength = 0.45) {
    this.squashImpact = Math.min(0.85, this.squashImpact + strength);
  }

  /**
   * Triggers a goofy 360° Ghost Spin / Boo! emote.
   */
  triggerGhostBooEmote() {
    this.booSpinTimer = 0.85;
    this.triggerSquashImpulse(0.55);
  }

  /**
   * 1. Builds the Squishy Lopsided Mantle, Mismatched Derpy Googly Eyes,
   * Out-of-Sync Eyelids, Crooked Tongue, and Buck-Tooth.
   */
  _buildLopsidedMantleAndFace() {
    this.mantleGroup = new THREE.Group();
    this.mantleGroup.position.set(0, 1.35, 0);
    // Slight permanent derpy head tilt
    this.mantleGroup.rotation.z = 0.09;
    this.root.add(this.mantleGroup);

    // Bulbous lopsided head geometry (deformed sphere so one cheek is puffier)
    const headGeo = new THREE.SphereGeometry(1.38, 20, 16);
    const pos = headGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);

      // Bulbous top dome + wide squishy cheeks
      if (y > 0) {
        x *= 1.0 + y * 0.14;
        z *= 1.0 + y * 0.1;
        // Asymmetrical lopsided bulge toward back-left
        if (x < 0) x *= 1.11;
      } else {
        // Taper slightly at neck
        x *= 0.92;
        z *= 0.92;
      }
      pos.setXYZ(i, x, y * 1.08, z);
    }
    headGeo.computeVertexNormals();

    this.mantleMesh = new THREE.Mesh(headGeo, this.skinMat);
    this.mantleMesh.castShadow = true;
    this.mantleMesh.receiveShadow = true;
    this.mantleGroup.add(this.mantleMesh);

    // Chubby little siphon/snout on the front face (+Z is forward)
    const snoutGeo = new THREE.CylinderGeometry(0.28, 0.38, 0.45, 10);
    snoutGeo.rotateX(Math.PI / 2);
    this.snoutMesh = new THREE.Mesh(snoutGeo, this.skinMat);
    this.snoutMesh.position.set(0.18, -0.22, 1.28);
    this.snoutMesh.rotation.y = 0.15;
    this.mantleGroup.add(this.snoutMesh);

    // --- DERPY GOOGLY EYES (Mismatched sizes!) ---
    // Left eye (+X in local space): HUGE bulging eye
    this.eyeGroupL = new THREE.Group();
    this.eyeGroupL.position.set(0.52, 0.24, 1.15);
    this.mantleGroup.add(this.eyeGroupL);

    const eyeRadiusL = 0.46;
    const eyeSphereL = new THREE.Mesh(new THREE.SphereGeometry(eyeRadiusL, 14, 12), this.eyeWhiteMat);
    eyeSphereL.scale.set(1.0, 1.05, 0.85);
    this.eyeGroupL.add(eyeSphereL);

    this.pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 10), this.pupilMat);
    this.pupilL.scale.set(1.0, 1.0, 0.45);
    this.pupilL.position.set(-0.08, 0.02, eyeRadiusL * 0.82);
    this.eyeGroupL.add(this.pupilL);

    // Eyelid for Left Eye
    const lidGeoL = new THREE.SphereGeometry(eyeRadiusL * 1.06, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52);
    this.eyelidL = new THREE.Mesh(lidGeoL, this.skinMat);
    this.eyelidL.rotation.x = -Math.PI * 0.45;
    this.eyeGroupL.add(this.eyelidL);

    // Right eye (-X in local space): Noticeably SMALLER, lower, slightly wonky eye
    this.eyeGroupR = new THREE.Group();
    this.eyeGroupR.position.set(-0.48, 0.04, 1.18);
    this.mantleGroup.add(this.eyeGroupR);

    const eyeRadiusR = 0.29;
    const eyeSphereR = new THREE.Mesh(new THREE.SphereGeometry(eyeRadiusR, 12, 10), this.eyeWhiteMat);
    eyeSphereR.scale.set(1.0, 1.0, 0.85);
    this.eyeGroupR.add(eyeSphereR);

    this.pupilR = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), this.pupilMat);
    this.pupilR.scale.set(1.0, 1.0, 0.45);
    this.pupilR.position.set(0.06, -0.03, eyeRadiusR * 0.82);
    this.eyeGroupR.add(this.pupilR);

    // Eyelid for Right Eye
    const lidGeoR = new THREE.SphereGeometry(eyeRadiusR * 1.07, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52);
    this.eyelidR = new THREE.Mesh(lidGeoR, this.skinMat);
    this.eyelidR.rotation.x = -Math.PI * 0.42;
    this.eyeGroupR.add(this.eyelidR);

    // --- CROOKED TONGUE & BUCK-TOOTH ---
    const tongueGeo = new THREE.SphereGeometry(0.22, 10, 8);
    tongueGeo.scale(0.85, 0.38, 1.35);
    this.tongueMesh = new THREE.Mesh(tongueGeo, this.tongueMat);
    this.tongueMesh.position.set(-0.22, -0.38, 1.26);
    this.tongueMesh.rotation.set(0.45, -0.25, -0.3);
    this.mantleGroup.add(this.tongueMesh);

    const toothGeo = new THREE.BoxGeometry(0.14, 0.18, 0.08);
    this.buckTooth = new THREE.Mesh(toothGeo, this.toothMat);
    this.buckTooth.position.set(0.02, -0.32, 1.32);
    this.buckTooth.rotation.set(0.15, 0, 0.18);
    this.mantleGroup.add(this.buckTooth);
  }

  /**
   * 2. Builds 8 Sprawling, Unruly Multi-Segmented Tentacles (No Neat Skirt!).
   * Each tentacle has 4 articulated joints, asymmetrical lengths, random base angles,
   * and independent spring-damper ragdoll physics parameters.
   */
  _buildMessySprawlingTentacles() {
    this.tentacles = [];
    this.tentacleRoot = new THREE.Group();
    this.tentacleRoot.position.set(0, 0.52, 0);
    this.root.add(this.tentacleRoot);

    // Pseudo-random generator for chaotic asymmetrical tentacle layout
    let s = (this.seed + 1) * 48271;
    const rand = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };

    // Irregular angular offsets, uneven lengths, and chaotic curl biases
    const irregularAngles = [
      0.18,
      0.88,
      1.78,
      2.42,
      3.35,
      4.05,
      4.92,
      5.58
    ];
    const lengthScales = [1.28, 0.84, 1.36, 0.92, 1.18, 0.79, 1.32, 1.04];

    for (let i = 0; i < 8; i++) {
      const baseAngle = irregularAngles[i] + (rand() - 0.5) * 0.26;
      const lenMult = lengthScales[i];

      const anchor = new THREE.Group();
      // Place tentacle root asymmetrically around the mantle base
      const radialDist = 0.85 + (rand() - 0.5) * 0.28;
      anchor.position.set(
        Math.sin(baseAngle) * radialDist,
        (rand() - 0.5) * 0.16,
        Math.cos(baseAngle) * radialDist
      );
      // Point tentacle outward at a messy splay angle
      anchor.rotation.y = baseAngle + (rand() - 0.5) * 0.35;
      this.tentacleRoot.add(anchor);

      const joints = [];
      const skinMeshes = [];
      const cupMeshes = [];

      let parentNode = anchor;
      const segmentCount = 4;
      const baseSegLen = 0.72 * lenMult;

      for (let j = 0; j < segmentCount; j++) {
        const jointPivot = new THREE.Group();
        if (j > 0) {
          jointPivot.position.set(0, 0, baseSegLen * (1.0 - (j - 1) * 0.12));
        }
        parentNode.add(jointPivot);

        const segLen = baseSegLen * (1.0 - j * 0.12);
        const rStart = 0.36 * (1.0 - j * 0.19);
        const rEnd = 0.36 * (1.0 - (j + 1) * 0.21);

        // Tapered tentacle limb cylinder along +Z of jointPivot
        const limbGeo = new THREE.CylinderGeometry(rEnd, rStart, segLen, 8);
        limbGeo.rotateX(Math.PI / 2);
        limbGeo.translate(0, 0, segLen * 0.5);
        const limbMesh = new THREE.Mesh(limbGeo, this.skinMat);
        limbMesh.castShadow = true;
        jointPivot.add(limbMesh);
        skinMeshes.push(limbMesh);

        // Rounded knuckle / tip sphere
        const tipGeo = new THREE.SphereGeometry(j === segmentCount - 1 ? rEnd * 1.15 : rEnd, 8, 8);
        const tipMesh = new THREE.Mesh(tipGeo, this.skinMat);
        tipMesh.position.set(0, 0, segLen);
        jointPivot.add(tipMesh);
        skinMeshes.push(tipMesh);

        // Suction cup bumps along the underside/side of the tentacle segment
        if (j < 3) {
          const cupGeo = new THREE.CylinderGeometry(rStart * 0.52, rStart * 0.45, 0.12, 7);
          const cupMesh = new THREE.Mesh(cupGeo, this.underbellyMat);
          cupMesh.position.set((j % 2 === 0 ? 1 : -1) * rStart * 0.3, -rStart * 0.72, segLen * 0.55);
          cupMesh.rotation.z = (j % 2 === 0 ? -0.35 : 0.35);
          jointPivot.add(cupMesh);
          cupMeshes.push(cupMesh);
        }

        joints.push(jointPivot);
        parentNode = jointPivot;
      }

      // Independent chaotic ragdoll parameters per tentacle
      this.tentacles.push({
        index: i,
        anchor,
        joints,
        skinMeshes,
        cupMeshes,
        baseAngle,
        lenMult,
        phase: rand() * Math.PI * 2,
        freq: 2.3 + rand() * 3.1,
        stiffness: 6.5 + rand() * 7.5,
        damping: 0.78 + rand() * 0.14,
        curlBiasX: (rand() - 0.45) * 0.55,
        curlBiasY: (rand() - 0.5) * 0.75,
        flailHabit: rand(), // > 0.65 means this tentacle loves flailing high into the air!
        swingYaw: 0,
        swingVel: 0,
        slapPitch: 0,
        slapVel: 0
      });
    }
  }

  _buildHeadgearContainer() {
    this.headgearGroup = new THREE.Group();
    this.headgearGroup.position.set(0, 1.26, 0);
    this.mantleGroup.add(this.headgearGroup);
  }

  /**
   * 3. Builds one of the 6 Selectable Goofy Figurines / Headgear on the octopus's head:
   * - `tin_colander`
   * - `sliding_crown`
   * - `cracked_fishbowl`
   * - `soggy_pirate`
   * - `traffic_cone`
   * - `propeller_beanie`
   */
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
    // Worn lopsided at a crooked angle
    group.position.set(-0.14, -0.08, -0.05);
    group.rotation.set(-0.22, 0.3, 0.28);

    const tinMat = new THREE.MeshStandardMaterial({
      color: 0xcfd8dc,
      roughness: 0.28,
      metalness: 0.78,
      side: THREE.DoubleSide
    });
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x263238 });

    // Inverted strainer bowl
    const bowlGeo = new THREE.SphereGeometry(1.18, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.54);
    const bowlMesh = new THREE.Mesh(bowlGeo, tinMat);
    bowlMesh.position.y = -0.35;
    group.add(bowlMesh);

    // Colander rim lip
    const rimGeo = new THREE.TorusGeometry(1.16, 0.08, 8, 22);
    rimGeo.rotateX(Math.PI / 2);
    const rimMesh = new THREE.Mesh(rimGeo, tinMat);
    rimMesh.position.y = -0.35;
    group.add(rimMesh);

    // Side loop handles
    for (const sign of [-1, 1]) {
      const handleGeo = new THREE.TorusGeometry(0.24, 0.055, 6, 12);
      const handle = new THREE.Mesh(handleGeo, tinMat);
      handle.position.set(sign * 1.24, -0.18, 0);
      handle.rotation.z = sign * 0.4;
      group.add(handle);
    }

    // Little dark strainer dots around the dome
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.08, 6), holeMat);
      dot.position.set(Math.cos(ang) * 0.85, 0.22, Math.sin(ang) * 0.85);
      dot.lookAt(Math.cos(ang) * 2, 1.0, Math.sin(ang) * 2);
      group.add(dot);
    }

    // Bent kitchen spoon stuck magnetically/awkwardly to the side
    const spoonGroup = new THREE.Group();
    spoonGroup.position.set(0.68, 0.55, 0.35);
    spoonGroup.rotation.set(0.4, 0.2, -0.65);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.95, 6), tinMat);
    const scoopGeo = new THREE.SphereGeometry(0.2, 8, 8);
    scoopGeo.scale(0.8, 1.25, 0.35);
    const scoop = new THREE.Mesh(scoopGeo, tinMat);
    scoop.position.set(0.06, 0.52, 0);
    scoop.rotation.z = -0.35;
    spoonGroup.add(stem, scoop);
    group.add(spoonGroup);

    this.headgearGroup.add(group);
  }

  _buildSlidingCrown() {
    const group = new THREE.Group();
    // Slipping heavily sideways right over the bulging left googly eye!
    group.position.set(0.42, -0.05, 0.25);
    group.rotation.set(0.32, 0.15, -0.52);

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffd100,
      emissive: 0x996b00,
      emissiveIntensity: 0.25,
      roughness: 0.22,
      metalness: 0.82
    });
    const rubyMat = new THREE.MeshStandardMaterial({
      color: 0xff1744,
      emissive: 0xaa0022,
      emissiveIntensity: 0.4,
      roughness: 0.15
    });

    const bandGeo = new THREE.CylinderGeometry(0.88, 0.78, 0.42, 12, 1, true);
    const band = new THREE.Mesh(bandGeo, goldMat);
    group.add(band);

    const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.08, 8, 16).rotateX(Math.PI / 2), goldMat);
    baseRing.position.y = -0.18;
    group.add(baseRing);

    // 5 tall crown spikes with jewel spheres
    const spikes = 5;
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2;
      const spikeGeo = new THREE.ConeGeometry(0.24, 0.58, 4);
      const spike = new THREE.Mesh(spikeGeo, goldMat);
      spike.position.set(Math.cos(a) * 0.82, 0.44, Math.sin(a) * 0.82);
      spike.rotation.y = -a;
      group.add(spike);

      const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), rubyMat);
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
      transparent: true,
      opacity: 0.42
    });
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x00bbf9,
      transparent: true,
      opacity: 0.55
    });
    const duckMat = new THREE.MeshStandardMaterial({
      color: 0xffea00,
      roughness: 0.3
    });
    const beakMat = new THREE.MeshStandardMaterial({
      color: 0xff6d00,
      roughness: 0.3
    });

    // Outer glass bowl
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(1.12, 16, 14), glassMat);
    group.add(bowl);

    // Rim lip at top of fishbowl
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.09, 8, 18).rotateX(Math.PI / 2), glassMat);
    rim.position.y = 0.88;
    group.add(rim);

    // Sloshing half-sphere of water inside
    const waterGeo = new THREE.SphereGeometry(0.98, 14, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55);
    const water = new THREE.Mesh(waterGeo, waterMat);
    group.add(water);

    // Tiny Yellow Rubber Duck floating inside!
    this.rubberDuckGroup = new THREE.Group();
    this.rubberDuckGroup.position.set(0.1, 0.12, 0.15);

    const duckBody = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), duckMat);
    duckBody.scale.set(0.9, 0.75, 1.2);
    const duckHead = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), duckMat);
    duckHead.position.set(0, 0.24, 0.18);
    const duckBeak = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 6).rotateX(Math.PI / 2), beakMat);
    duckBeak.position.set(0, 0.22, 0.38);

    this.rubberDuckGroup.add(duckBody, duckHead, duckBeak);
    group.add(this.rubberDuckGroup);

    this.headgearGroup.add(group);
  }

  _buildSoggyPirate() {
    const group = new THREE.Group();
    group.position.set(0, 0.05, 0);

    const paperMat = new THREE.MeshStandardMaterial({
      color: 0xdcd6c8,
      roughness: 0.92,
      flatShading: true
    });
    const strapMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.8
    });

    // Crumpled folded-newspaper pirate hat
    const hatGroup = new THREE.Group();
    hatGroup.position.set(-0.08, 0.15, -0.05);
    hatGroup.rotation.set(-0.14, 0.18, 0.22);

    const brimGeo = new THREE.BoxGeometry(2.35, 0.42, 0.65);
    const brim = new THREE.Mesh(brimGeo, paperMat);
    const peakGeo = new THREE.ConeGeometry(0.95, 0.92, 4);
    peakGeo.scale(1.3, 1.0, 0.45);
    const peak = new THREE.Mesh(peakGeo, paperMat);
    peak.position.y = 0.55;
    peak.rotation.y = Math.PI * 0.25;
    hatGroup.add(brim, peak);
    group.add(hatGroup);

    // Eyepatch strapped awkwardly across its FOREHEAD instead of its eye!
    const bandGeo = new THREE.TorusGeometry(1.18, 0.045, 6, 20);
    bandGeo.rotateX(Math.PI / 2);
    const band = new THREE.Mesh(bandGeo, strapMat);
    band.position.set(0, -0.45, 0.06);
    band.rotation.z = -0.18;
    group.add(band);

    const patchGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.08, 10);
    patchGeo.rotateX(Math.PI / 2);
    const patch = new THREE.Mesh(patchGeo, strapMat);
    patch.position.set(-0.18, -0.35, 1.22);
    patch.rotation.z = -0.25;
    group.add(patch);

    this.headgearGroup.add(group);
  }

  _buildTrafficCone() {
    const group = new THREE.Group();
    // Jammed crookedly onto its head like a wizard hat
    group.position.set(0.12, 0.02, -0.12);
    group.rotation.set(-0.28, 0.1, -0.26);

    const orangeMat = new THREE.MeshStandardMaterial({
      color: 0xff5400,
      emissive: 0x992b00,
      emissiveIntensity: 0.2,
      roughness: 0.45
    });
    const whiteStripeMat = new THREE.MeshStandardMaterial({
      color: 0xf8f9fa,
      emissive: 0xcccccc,
      emissiveIntensity: 0.25,
      roughness: 0.3
    });

    // Square base flange
    const flange = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.16, 1.85), orangeMat);
    flange.position.y = -0.2;
    group.add(flange);

    // Tall orange cone
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.76, 1.95, 14), orangeMat);
    cone.position.y = 0.72;
    group.add(cone);

    // Reflective white band stripes
    const stripe1 = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.54, 0.28, 14), whiteStripeMat);
    stripe1.position.y = 0.55;
    const stripe2 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.22, 14), whiteStripeMat);
    stripe2.position.y = 1.05;
    group.add(stripe1, stripe2);

    this.headgearGroup.add(group);
  }

  _buildPropellerBeanie() {
    const group = new THREE.Group();
    group.position.set(-0.05, -0.12, 0);
    group.rotation.set(-0.1, 0, 0.14);

    const capMat1 = new THREE.MeshStandardMaterial({ color: 0xffbe0b, roughness: 0.5 });
    const capMat2 = new THREE.MeshStandardMaterial({ color: 0x3a86ff, roughness: 0.5 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xff0055, roughness: 0.3 });

    const capDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.96, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
      capMat1
    );
    group.add(capDome);

    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.1, 0.65), capMat2);
    brim.position.set(0, 0.08, 0.88);
    brim.rotation.x = 0.2;
    group.add(brim);

    // Vertical spindle + spinning propeller blades
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.42, 8), redMat);
    spindle.position.y = 1.05;
    group.add(spindle);

    this.propellerBladeGroup = new THREE.Group();
    this.propellerBladeGroup.position.y = 1.24;

    const bladeGeo = new THREE.BoxGeometry(1.45, 0.05, 0.22);
    const blade1 = new THREE.Mesh(bladeGeo, redMat);
    const blade2 = new THREE.Mesh(bladeGeo, capMat2);
    blade2.rotation.y = Math.PI * 0.5;
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), capMat1);
    this.propellerBladeGroup.add(blade1, blade2, hub);
    group.add(this.propellerBladeGroup);

    this.headgearGroup.add(group);
  }

  /**
   * Advances procedural floppy tentacle ragdoll kinematics, squishy mantle wobble,
   * derpy googly eyes, out-of-sync blinking, and headgear animation.
   *
   * @param {number} dt Delta time (seconds)
   * @param {number} elapsedTime Total elapsed time (seconds)
   * @param {Object} motionState
   * @param {number} motionState.turnRate Angular steering rate
   * @param {number} motionState.speedRatio Current speed / baseSpeed
   * @param {boolean} motionState.isBoost Whether Speed Surge is active
   * @param {boolean} motionState.isStunned Whether stunned by a shark
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

    // 1. Decay squash-and-stretch impulse + compute jelly mantle wobble
    this.squashImpact = Math.max(0, this.squashImpact - dt * 2.6);
    const turnWobble = Math.abs(turnRate) * 0.09;
    const waveJiggle = Math.sin(elapsedTime * 7.5 + this.seed) * (0.06 + turnWobble + this.squashImpact * 0.28);

    const sx = 1.0 + waveJiggle + this.squashImpact * 0.22;
    const sy = Math.max(0.68, 1.0 - waveJiggle * 1.15 - this.squashImpact * 0.28);
    const sz = 1.0 + waveJiggle * 0.8 + this.squashImpact * 0.18;
    this.mantleGroup.scale.set(sx, sy, sz);

    // Lopsided head pitch & roll during turns or stun
    const stunShake = isStunned ? Math.sin(elapsedTime * 38.0) * 0.35 : 0;
    this.mantleGroup.rotation.z = 0.09 - turnRate * 0.14 + stunShake;
    this.mantleGroup.rotation.x = (isBoost ? 0.18 : 0.05) + Math.cos(elapsedTime * 5.2 + this.seed) * 0.06;

    // Ghost Boo Spin emote
    if (this.booSpinTimer > 0) {
      this.booSpinTimer = Math.max(0, this.booSpinTimer - dt);
      const spinProgress = 1.0 - this.booSpinTimer / 0.85;
      this.mantleGroup.rotation.y = spinProgress * Math.PI * 2;
    } else {
      this.mantleGroup.rotation.y = Math.sin(elapsedTime * 2.8 + this.seed) * 0.08;
    }

    // 2. Derpy Googly Eyes (independent cross-eyed drift & out-of-sync blinking)
    const targetPupilLX = THREE.MathUtils.clamp(-0.07 - turnRate * 0.06 + Math.sin(elapsedTime * 3.1) * 0.05, -0.18, 0.16);
    const targetPupilLY = THREE.MathUtils.clamp(0.02 + Math.cos(elapsedTime * 2.7) * 0.06, -0.14, 0.14);
    // Right pupil drifts lazily in the OPPOSITE direction for maximum derp!
    const targetPupilRX = THREE.MathUtils.clamp(0.05 + turnRate * 0.05 - Math.cos(elapsedTime * 2.3) * 0.04, -0.11, 0.11);
    const targetPupilRY = THREE.MathUtils.clamp(-0.03 - Math.sin(elapsedTime * 3.4) * 0.05, -0.1, 0.1);

    this.pupilL.position.x = THREE.MathUtils.lerp(this.pupilL.position.x, targetPupilLX, dt * 7.0);
    this.pupilL.position.y = THREE.MathUtils.lerp(this.pupilL.position.y, targetPupilLY, dt * 7.0);
    this.pupilR.position.x = THREE.MathUtils.lerp(this.pupilR.position.x, targetPupilRX, dt * 4.5);
    this.pupilR.position.y = THREE.MathUtils.lerp(this.pupilR.position.y, targetPupilRY, dt * 4.5);

    // Out-of-sync independent blinking
    this.blinkTimerL -= dt;
    if (this.blinkTimerL <= 0) {
      this.blinkTimerL = 2.4 + Math.random() * 2.8;
    }
    const isBlinkingL = this.blinkTimerL < 0.14;
    this.eyelidL.rotation.x = isBlinkingL ? 0.05 : -Math.PI * 0.45;

    this.blinkTimerR -= dt;
    if (this.blinkTimerR <= 0) {
      this.blinkTimerR = 1.9 + Math.random() * 3.1;
    }
    const isBlinkingR = this.blinkTimerR < 0.14;
    this.eyelidR.rotation.x = isBlinkingR ? 0.05 : -Math.PI * 0.42;

    // Wiggle crooked tongue
    this.tongueMesh.rotation.z = -0.3 + Math.sin(elapsedTime * 8.0 + this.seed) * 0.16;

    // 3. Headgear animations (Propeller Beanie & Cracked Fishbowl Rubber Duck)
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

    // 4. Procedural Floppy Ragdoll Tentacle Kinematics (8 independent unruly tentacles!)
    for (let i = 0; i < this.tentacles.length; i++) {
      const t = this.tentacles[i];

      // Determine whether this tentacle is pointing forward, sideways, or dragging behind
      const cosBack = Math.cos(t.baseAngle); // +1 = front (+Z), -1 = back (-Z)
      const sinSide = Math.sin(t.baseAngle); // +1 = left (+X), -1 = right (-X)

      // Target yaw lag from turning & chaotic dragging
      const dragBehindYaw = -turnRate * (0.28 + (1.0 - cosBack) * 0.18)
        + Math.sin(elapsedTime * t.freq + t.phase) * (isBoost ? 0.48 : 0.32)
        + t.curlBiasY * 0.45;

      // Spring-damper integration for independent tentacle yaw whip
      const yawForce = (dragBehindYaw - t.swingYaw) * t.stiffness;
      t.swingVel = (t.swingVel + yawForce * dt) * Math.pow(t.damping, dt * 60);
      t.swingYaw += t.swingVel * dt;

      // Target pitch (water slap / chaotic flail into the air)
      let targetPitch = -0.12 + Math.cos(elapsedTime * (t.freq * 1.15) + t.phase * 1.7) * 0.28;
      if (this.isGhost) {
        // Zero-gravity floating tentacles in Ghost Mode!
        targetPitch = 0.15 + Math.sin(elapsedTime * 2.6 + t.phase) * 0.38;
      } else if (isBoost || Math.abs(turnRate) > 1.2 || t.flailHabit > 0.62) {
        // Some tentacles flail wildly into the air or slap the water surface!
        const flailWave = Math.sin(elapsedTime * (t.freq * 1.8) + i * 2.1);
        targetPitch += Math.max(0, flailWave) * (isBoost ? 0.68 : 0.42);
      }

      const pitchForce = (targetPitch - t.slapPitch) * (t.stiffness * 1.1);
      t.slapVel = (t.slapVel + pitchForce * dt) * Math.pow(t.damping, dt * 60);
      t.slapPitch += t.slapVel * dt;

      // Apply cascading floppy curl across the 4 joints of this tentacle
      for (let j = 0; j < t.joints.length; j++) {
        const joint = t.joints[j];
        const jointFactor = (j + 1) / t.joints.length;
        const phaseLag = elapsedTime * t.freq - j * 0.65 + t.phase;

        const pitch = t.slapPitch * (0.65 + jointFactor * 0.7)
          + Math.sin(phaseLag) * (0.22 + j * 0.09)
          + (j === 0 ? -0.18 : t.curlBiasX * 0.35);

        const yaw = t.swingYaw * (0.6 + jointFactor * 0.85)
          + Math.cos(phaseLag * 0.9) * (0.24 + j * 0.11)
          + sinSide * turnRate * -0.08 * j;

        const roll = Math.sin(phaseLag * 1.3 + i) * 0.25;

        joint.rotation.set(pitch, yaw, roll);
      }
    }
  }
}

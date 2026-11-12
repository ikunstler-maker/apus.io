// ============================================================================
// APUS.IO — CUSTOM GLSL SHADERS (OCEAN, TRIPLANAR PATTERNS, BORDERS, GHOST)
// ============================================================================
import * as THREE from 'three';

// Shared GLSL wave displacement snippet so Ocean & Territory Mats move in lockstep
const SPHERICAL_WAVE_GLSL = /* glsl */ `
  // Seamless 3D spherical wave height at a unit normal direction p
  float computeWaveHeight(vec3 n, float time) {
    float w1 = sin(n.x * 18.0 + n.z * 14.0 + time * 1.8) * cos(n.y * 16.0 - time * 1.3);
    float w2 = sin(n.y * 28.0 - n.x * 22.0 + time * 2.5) * 0.5;
    float w3 = cos((n.x + n.y + n.z) * 34.0 - time * 3.1) * 0.28;
    return (w1 + w2 + w3) * 0.34;
  }

  // Seamless 3D procedural caustics / foam noise on sphere
  float sphericalCaustics(vec3 p, float time) {
    vec3 q = p * 22.0 + vec3(time * 0.6, -time * 0.45, time * 0.5);
    float v1 = sin(q.x + sin(q.y + sin(q.z)));
    vec3 r = p * 37.0 - vec3(time * 0.8, time * 0.55, -time * 0.7);
    float v2 = cos(r.y + cos(r.z + cos(r.x)));
    return smoothstep(0.45, 0.98, (v1 * v2) * 0.5 + 0.5);
  }
`;

/**
 * 1. Warm Stylized Ocean Surface Shader
 */
export function createOceanMaterial(sunDirection = new THREE.Vector3(0.6, 0.8, 0.4).normalize()) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: sunDirection.clone() },
      uDeepColor: { value: new THREE.Color(0x062c59) },
      uMidColor: { value: new THREE.Color(0x0c698e) },
      uShallowColor: { value: new THREE.Color(0x16b8b2) },
      uFoamColor: { value: new THREE.Color(0xf4fcff) },
      uSunColor: { value: new THREE.Color(0xfff1c9) }
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying vec3 vSphereDir;
      varying float vWaveHeight;

      ${SPHERICAL_WAVE_GLSL}

      void main() {
        vec3 sphereDir = normalize(position);
        float waveH = computeWaveHeight(sphereDir, uTime);

        vec3 tangent1 = normalize(cross(sphereDir, abs(sphereDir.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        vec3 tangent2 = cross(sphereDir, tangent1);
        float eps = 0.015;
        float h1 = computeWaveHeight(normalize(sphereDir + tangent1 * eps), uTime);
        float h2 = computeWaveHeight(normalize(sphereDir + tangent2 * eps), uTime);

        vec3 displacedPos = position + sphereDir * waveH;
        vec3 perturbedNormal = normalize(sphereDir - tangent1 * ((h1 - waveH) * 1.9) - tangent2 * ((h2 - waveH) * 1.9));

        vSphereDir = sphereDir;
        vWaveHeight = waveH;
        vNormal = normalize(normalMatrix * perturbedNormal);
        vec4 worldPos = modelMatrix * vec4(displacedPos, 1.0);
        vWorldPos = worldPos.xyz;

        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uDeepColor;
      uniform vec3 uMidColor;
      uniform vec3 uShallowColor;
      uniform vec3 uFoamColor;
      uniform vec3 uSunColor;

      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying vec3 vSphereDir;
      varying float vWaveHeight;

      ${SPHERICAL_WAVE_GLSL}

      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 worldNormal = normalize(vSphereDir);

        float ndotv = clamp(dot(worldNormal, viewDir), 0.0, 1.0);
        float fresnel = pow(1.0 - ndotv, 2.6);

        float shoalNoise = sin(vSphereDir.x * 5.0 + vSphereDir.z * 4.0) * cos(vSphereDir.y * 6.0 - vSphereDir.x * 3.0);
        float shallowMask = smoothstep(-0.4, 0.75, shoalNoise + vWaveHeight * 0.95);

        vec3 baseWater = mix(uDeepColor, uMidColor, smoothstep(0.0, 0.7, ndotv));
        baseWater = mix(baseWater, uShallowColor, shallowMask * 0.68);

        float sunDiff = max(dot(worldNormal, uSunDir), 0.0);
        float sss = pow(clamp(dot(viewDir, -uSunDir + worldNormal * 0.6), 0.0, 1.0), 3.0) * 0.35;
        baseWater += uShallowColor * (sss + sunDiff * 0.18);

        float caustics = sphericalCaustics(vSphereDir, uTime);
        float crestFoam = smoothstep(0.28, 0.56, vWaveHeight + caustics * 0.25);
        baseWater = mix(baseWater, uShallowColor * 1.25, caustics * 0.22 * (0.4 + 0.6 * sunDiff));
        baseWater = mix(baseWater, uFoamColor, crestFoam * 0.32);

        vec3 halfVec = normalize(uSunDir + viewDir);
        float specBroad = pow(max(dot(normalize(vSphereDir + (vNormal - vSphereDir) * 0.4), halfVec), 0.0), 36.0);
        float specSparkle = smoothstep(0.86, 0.96, pow(max(dot(vSphereDir, halfVec), 0.0), 22.0) + caustics * 0.18);

        vec3 finalColor = baseWater
          + uSunColor * specBroad * 0.42
          + uFoamColor * specSparkle * 0.55
          + mix(uMidColor, uSunColor, 0.35) * fresnel * 0.45;

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `
  });
}

/**
 * 2. Upgraded Territory Surface Mat Shader with Spherical Triplanar Patterns & Border Effects
 * Supports:
 * - 6 Surface Paint Patterns (`aPattern` = 0..5):
 *   0: solid_gloss, 1: messy_splatter, 2: bubble_polka, 3: dizzy_swirls, 4: star_doodles, 5: suction_rings
 * - 4 Territory Border Effects (`aBorderType` = 0..3):
 *   0: bubbly_foam, 1: neon_biolum, 2: electric_zap, 3: golden_crust
 */
export function createTerritoryMaterial(sunDirection = new THREE.Vector3(0.6, 0.8, 0.4).normalize()) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: sunDirection.clone() }
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute vec3 aColor;
      attribute float aAlpha;
      attribute float aBorder;
      attribute float aPattern;
      attribute float aBorderType;

      varying vec3 vColor;
      varying float vAlpha;
      varying float vBorder;
      varying float vPattern;
      varying float vBorderType;
      varying vec3 vSphereDir;
      varying vec3 vWorldPos;

      ${SPHERICAL_WAVE_GLSL}

      void main() {
        vColor = aColor;
        vAlpha = aAlpha;
        vBorder = aBorder;
        vPattern = aPattern;
        vBorderType = aBorderType;

        vec3 sphereDir = normalize(position);
        vSphereDir = sphereDir;
        float waveH = computeWaveHeight(sphereDir, uTime);

        vec3 displacedPos = position + sphereDir * (waveH + 0.28);
        vec4 worldPos = modelMatrix * vec4(displacedPos, 1.0);
        vWorldPos = worldPos.xyz;

        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;

      varying vec3 vColor;
      varying float vAlpha;
      varying float vBorder;
      varying float vPattern;
      varying float vBorderType;
      varying vec3 vSphereDir;
      varying vec3 vWorldPos;

      // 2D hash helper for procedural patterns
      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      // Evaluates a 2D procedural paint pattern [0..1] for pattern ID patId
      float evalPattern2D(vec2 uv, int patId, float time) {
        if (patId == 0) {
          // 0: solid_gloss — smooth glossy wave sheen
          return sin(uv.x * 6.0 + time * 1.4) * cos(uv.y * 6.0 - time * 1.1) * 0.08 + 0.1;
        }
        if (patId == 1) {
          // 1: messy_splatter — chaotic comic paint splotches and drips
          vec2 cell = floor(uv * 3.2);
          vec2 f = fract(uv * 3.2) - 0.5;
          float rnd = hash21(cell);
          vec2 offset = vec2(fract(rnd * 13.7) - 0.5, fract(rnd * 29.3) - 0.5) * 0.35;
          float ang = atan(f.y - offset.y, f.x - offset.x);
          float rad = 0.24 + 0.09 * sin(ang * 5.0 + rnd * 12.0) + 0.06 * cos(ang * 3.0);
          float d = length(f - offset);
          float mainSplat = 1.0 - smoothstep(rad - 0.04, rad + 0.03, d);
          float drip = 1.0 - smoothstep(0.06, 0.09, length(f + offset * 0.9));
          return clamp(mainSplat + drip * 0.8, 0.0, 1.0);
        }
        if (patId == 2) {
          // 2: bubble_polka — floating polka-dot bubbles with specular ring
          vec2 g = uv * 3.8;
          vec2 id = floor(g);
          vec2 f = fract(g) - 0.5;
          f.y += sin(time * 2.0 + id.x * 1.7) * 0.08;
          float r = length(f);
          float ring = smoothstep(0.34, 0.30, r) * smoothstep(0.16, 0.25, r);
          float spec = 1.0 - smoothstep(0.0, 0.09, length(f - vec2(-0.1, 0.1)));
          return clamp(ring * 0.85 + spec * 0.7, 0.0, 1.0);
        }
        if (patId == 3) {
          // 3: dizzy_swirls — wobbly hypnotic spiral motifs
          vec2 f = fract(uv * 2.4) - 0.5;
          float r = length(f);
          float a = atan(f.y, f.x);
          float swirl = sin(r * 22.0 - a * 2.0 - time * 3.2);
          return smoothstep(0.15, 0.75, swirl) * (1.0 - smoothstep(0.38, 0.49, r));
        }
        if (patId == 4) {
          // 4: star_doodles — hand-drawn crooked 5-pointed star patterns
          vec2 f = fract(uv * 3.0) - 0.5;
          float a = atan(f.y, f.x) + 0.3 * sin(time * 1.5);
          float r = length(f);
          float starR = 0.25 + 0.11 * cos(a * 5.0);
          return 1.0 - smoothstep(starR - 0.03, starR + 0.03, r);
        }
        // 5: suction_rings — scatter of octopus suction-cup rings
        vec2 g = uv * 3.5;
        vec2 id = floor(g);
        vec2 f = fract(g) - 0.5;
        float rnd = hash21(id);
        vec2 off = (vec2(rnd, fract(rnd * 7.13)) - 0.5) * 0.22;
        float d = length(f - off);
        float outerCup = 1.0 - smoothstep(0.28, 0.33, d);
        float innerHole = 1.0 - smoothstep(0.11, 0.16, d);
        return clamp(outerCup - innerHole * 0.85, 0.0, 1.0);
      }

      // Spherical Triplanar Projection of the selected pattern
      float sampleSphericalPattern(vec3 sphereDir, int patId, float time) {
        vec3 blend = pow(abs(sphereDir), vec3(4.0));
        blend /= max(blend.x + blend.y + blend.z, 0.0001);

        float scale = 4.2;
        float px = evalPattern2D(sphereDir.yz * scale, patId, time);
        float py = evalPattern2D(sphereDir.xz * scale, patId, time);
        float pz = evalPattern2D(sphereDir.xy * scale, patId, time);
        return px * blend.x + py * blend.y + pz * blend.z;
      }

      void main() {
        if (vAlpha < 0.02) discard;

        int patId = int(floor(vPattern + 0.5));
        int borderId = int(floor(vBorderType + 0.5));

        vec3 worldNormal = normalize(vSphereDir);
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float sunLight = 0.76 + 0.24 * max(dot(worldNormal, uSunDir), 0.0);

        // Evaluate surface paint pattern via spherical triplanar mapping
        float patMask = sampleSphericalPattern(worldNormal, patId, uTime);

        // Glossy wet specular sheen
        vec3 halfVec = normalize(uSunDir + viewDir);
        float wetSpec = pow(max(dot(worldNormal, halfVec), 0.0), 28.0) * 0.32;

        vec3 basePaint = vColor * sunLight;
        vec3 patternTint = mix(vColor * 1.38, vec3(1.0, 0.99, 0.96), 0.52);
        vec3 matColor = mix(basePaint, patternTint, patMask * 0.55) + vec3(wetSpec);

        // Evaluate Territory Border Effect along perimeter cells
        float borderFactor = smoothstep(0.12, 0.82, vBorder);
        vec3 borderColor = matColor;
        float extraAlpha = 0.0;

        if (borderId == 0) {
          // 0: bubbly_foam — animated frothy white sea foam edge
          float bubbles = 0.75 + 0.25 * sin(uTime * 5.0 + (worldNormal.x + worldNormal.z) * 55.0);
          borderColor = mix(vColor * 1.25, vec3(0.96, 0.99, 1.0), 0.84 * bubbles);
          extraAlpha = 0.22;
        } else if (borderId == 1) {
          // 1: neon_biolum — pulsing bioluminescent rim glow
          float pulse = 0.8 + 0.35 * sin(uTime * 6.5);
          borderColor = mix(vColor * 1.65, vec3(0.55, 1.0, 0.95), 0.55) * pulse;
          extraAlpha = 0.26;
        } else if (borderId == 2) {
          // 2: electric_zap — crackling cartoon lightning contour
          float zap = step(0.15, sin(uTime * 18.0 + (worldNormal.x * 70.0 - worldNormal.y * 65.0)));
          borderColor = mix(vec3(0.35, 0.95, 1.0), vec3(1.0, 0.95, 0.3), zap);
          extraAlpha = 0.28;
        } else {
          // 3: golden_crust — shiny raised metallic gold border
          float glint = 0.75 + 0.35 * sin(uTime * 4.0 + (worldNormal.x + worldNormal.y + worldNormal.z) * 40.0);
          borderColor = vec3(1.0, 0.84, 0.28) * glint;
          extraAlpha = 0.28;
        }

        vec3 finalRGB = mix(matColor, borderColor, borderFactor);
        float finalAlpha = clamp(vAlpha * (0.78 + borderFactor * extraAlpha), 0.0, 0.97);

        gl_FragColor = vec4(finalRGB, finalAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide
  });
}

/**
 * 3. Ethereal Holographic / Ectoplasm Ghost Shader
 * Used when an eliminated player or bot enters the Ghost Realm.
 */
export function createGhostEctoplasmMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCyan: { value: new THREE.Color(0x64dfdf) },
      uViolet: { value: new THREE.Color(0xb565ff) }
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        vec3 pos = position;
        // Subtle ghostly ectoplasm ripple
        pos += normal * (sin(pos.y * 5.0 + uTime * 4.5) * 0.04);
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uCyan;
      uniform vec3 uViolet;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying vec2 vUv;

      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 1.8);
        float wave = 0.5 + 0.5 * sin(vWorldPos.y * 3.5 - uTime * 5.0 + vWorldPos.x * 2.0);
        vec3 col = mix(uCyan, uViolet, wave * 0.65) + vec3(0.35, 0.95, 1.0) * fresnel * 0.7;
        float alpha = clamp(0.36 + fresnel * 0.52, 0.25, 0.88);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
}

/**
 * 4. Animated Coastline Foam Ring Shader (around islands, cliffs, coral reefs)
 */
export function createFoamRingMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xf2fbff) }
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      ${SPHERICAL_WAVE_GLSL}

      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vec3 sphereDir = normalize(worldPos.xyz);
        float waveH = computeWaveHeight(sphereDir, uTime);
        worldPos.xyz += sphereDir * (waveH + 0.18);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;

      void main() {
        vec2 centered = (vUv - 0.5) * 2.0;
        float r = length(centered);
        if (r > 1.0 || r < 0.35) discard;

        float angle = atan(centered.y, centered.x);
        float wave1 = sin(r * 26.0 - uTime * 3.2 + sin(angle * 7.0 + uTime) * 0.6);
        float wave2 = cos(r * 18.0 - uTime * 2.1 - cos(angle * 5.0) * 0.5);

        float rings = smoothstep(0.15, 0.75, wave1 * 0.55 + wave2 * 0.45);
        float radialFade = smoothstep(0.35, 0.55, r) * (1.0 - smoothstep(0.72, 1.0, r));
        float alpha = rings * radialFade * 0.82;

        if (alpha < 0.03) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
}

/**
 * 5. Whirlpool Vortex Shader
 */
export function createWhirlpoolMaterial(portalColor = new THREE.Color(0x00f5d4)) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPortalColor: { value: portalColor }
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        vec2 c = (uv - 0.5) * 2.0;
        float r = length(c);
        float depth = -smoothstep(1.0, 0.05, r) * 2.4;
        vec3 pos = position + vec3(0.0, 0.0, depth);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uPortalColor;
      varying vec2 vUv;

      void main() {
        vec2 c = (vUv - 0.5) * 2.0;
        float r = length(c);
        if (r > 1.0) discard;

        float angle = atan(c.y, c.x);
        float spiral1 = sin(angle * 4.0 + log(max(r, 0.04)) * 11.0 - uTime * 6.5);
        float spiral2 = cos(angle * 3.0 + r * 16.0 - uTime * 4.8);

        float foamBand = smoothstep(0.25, 0.88, spiral1 * 0.65 + spiral2 * 0.35);
        vec3 abyssColor = vec3(0.01, 0.06, 0.16);
        vec3 midVortex = mix(vec3(0.04, 0.35, 0.58), uPortalColor, 0.55);
        vec3 foamWhite = vec3(0.92, 0.99, 1.0);

        vec3 col = mix(abyssColor, midVortex, smoothstep(0.08, 0.75, r));
        col = mix(col, foamWhite, foamBand * smoothstep(0.12, 0.9, r) * 0.85);
        float coreRing = smoothstep(0.32, 0.16, abs(r - 0.24));
        col += uPortalColor * coreRing * 0.75;

        float edgeFade = 1.0 - smoothstep(0.78, 1.0, r);
        gl_FragColor = vec4(col, edgeFade * 0.95);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
}

/**
 * 6. Volumetric Crepuscular Sunbeams (God Rays) Shader
 */
export function createSunbeamsMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xffe6a3) }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        float edgeFade = pow(abs(dot(normalize(vNormal), normalize(vViewDir))), 1.5);
        float verticalFade = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
        float rayStreak = 0.65 + 0.35 * sin(vUv.x * 25.1327 + uTime * 0.9) * cos(vUv.x * 12.566 - uTime * 0.6);

        float alpha = edgeFade * verticalFade * rayStreak * 0.13;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
}

/**
 * 7. Atmospheric Rim Halo Shader around the Ocean Sphere
 */
export function createAtmosphereMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x5ce1e6) },
      uSunColor: { value: new THREE.Color(0xffe599) },
      uSunDir: { value: new THREE.Vector3(0.6, 0.8, 0.4).normalize() }
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      void main() {
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      varying vec3 vNormal;
      varying vec3 vWorldPos;

      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float rim = 1.0 - clamp(dot(viewDir, -vNormal), 0.0, 1.0);
        float glow = pow(rim, 3.2) * 0.58;
        float sunTint = clamp(dot(vNormal, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(uColor, uSunColor, sunTint * 0.45);
        gl_FragColor = vec4(col, glow);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide
  });
}

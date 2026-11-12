// ============================================================================
// APUS.IO — SUNNY CLAYMORPHISM GLSL SHADERS (CAUSTIC OCEAN, PATTERNS, TRAILS)
// ============================================================================
import * as THREE from 'three';

// Shared GLSL wave displacement & Voronoi/Simplex cellular caustics
const SPHERICAL_WAVE_GLSL = /* glsl */ `
  // Seamless 3D spherical wave height at a unit normal direction n
  float computeWaveHeight(vec3 n, float time) {
    float w1 = sin(n.x * 16.0 + n.z * 14.0 + time * 1.7) * cos(n.y * 15.0 - time * 1.25);
    float w2 = sin(n.y * 26.0 - n.x * 20.0 + time * 2.3) * 0.45;
    float w3 = cos((n.x + n.y + n.z) * 32.0 - time * 2.8) * 0.25;
    return (w1 + w2 + w3) * 0.28;
  }

  vec3 hash33(vec3 p) {
    p = fract(p * vec3(443.8975, 397.2973, 491.1871));
    p += dot(p.zxy, p.yxz + 19.27);
    return fract(vec3(p.x * p.y, p.z * p.x, p.y * p.z));
  }

  // 3D Voronoi cellular water caustics on sphere
  float voronoiCaustics(vec3 p, float time) {
    vec3 x = p * 18.0 + vec3(sin(time * 0.55), cos(time * 0.48), sin(time * 0.62)) * 1.35;
    vec3 i = floor(x);
    vec3 f = fract(x);

    float f1 = 8.0;
    float f2 = 8.0;

    for (int k = -1; k <= 1; k++) {
      for (int j = -1; j <= 1; j++) {
        for (int l = -1; l <= 1; l++) {
          vec3 g = vec3(float(l), float(j), float(k));
          vec3 o = hash33(i + g);
          o = 0.5 + 0.42 * sin(time * 1.45 + 6.2831 * o);
          vec3 r = g + o - f;
          float d = dot(r, r);
          if (d < f1) {
            f2 = f1;
            f1 = d;
          } else if (d < f2) {
            f2 = d;
          }
        }
      }
    }
    // Cellular ridge network (bright caustic filaments where f2 - f1 is small)
    float edge = smoothstep(0.02, 0.28, sqrt(f2) - sqrt(f1));
    return 1.0 - edge;
  }
`;

/**
 * 1. Sunny Tropical Caustic Ocean Shader
 * Multi-tone turquoise gradients (#064273, #00b4d8, #48cae4), Voronoi caustics & sun sparkles.
 */
export function createOceanMaterial(sunDirection = new THREE.Vector3(-0.45, 0.82, 0.35).normalize()) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: sunDirection.clone() },
      uDeepColor: { value: new THREE.Color('#064273') },     // Deep Ocean Cobalt-Teal
      uMidColor: { value: new THREE.Color('#00b4d8') },      // Vibrant Tropical Turquoise
      uShallowColor: { value: new THREE.Color('#48cae4') },  // Sunny Lagoon Aqua
      uFoamColor: { value: new THREE.Color('#ffffff') },     // Crisp Bubbly White Foam
      uSunColor: { value: new THREE.Color('#fff5d6') }       // Warm Golden Sun Sparkle
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
        vec3 perturbedNormal = normalize(sphereDir - tangent1 * ((h1 - waveH) * 1.7) - tangent2 * ((h2 - waveH) * 1.7));

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
        float fresnel = pow(1.0 - ndotv, 2.2);

        // Organic tropical lagoon depth patches
        float lagoonPatch = sin(vSphereDir.x * 6.0 + vSphereDir.z * 5.0)
                          * cos(vSphereDir.y * 6.5 - vSphereDir.x * 4.0) * 0.5 + 0.5;
        float shallowMask = smoothstep(0.15, 0.85, lagoonPatch + vWaveHeight * 0.75);

        vec3 baseWater = mix(uDeepColor, uMidColor, smoothstep(0.05, 0.65, ndotv));
        baseWater = mix(baseWater, uShallowColor, shallowMask * 0.65);

        // Warm sunlit subsurface scatter
        float sunDiff = max(dot(worldNormal, uSunDir), 0.0);
        baseWater += uShallowColor * (sunDiff * 0.22);

        // Animated Voronoi cellular water caustics
        float caustics = voronoiCaustics(vSphereDir, uTime);
        vec3 causticTint = mix(uShallowColor, uFoamColor, 0.55);
        baseWater = mix(baseWater, causticTint, caustics * 0.34 * (0.45 + 0.55 * sunDiff));

        // Soft bubbly wave crests
        float crest = smoothstep(0.24, 0.48, vWaveHeight + caustics * 0.16);
        baseWater = mix(baseWater, uFoamColor, crest * 0.26);

        // Golden sun sparkles & glossy clay-water specular sheen
        vec3 halfVec = normalize(uSunDir + viewDir);
        float specBroad = pow(max(dot(normalize(vSphereDir + (vNormal - vSphereDir) * 0.45), halfVec), 0.0), 32.0);
        float specSparkle = smoothstep(0.82, 0.94, pow(max(dot(vSphereDir, halfVec), 0.0), 18.0) + caustics * 0.22);

        vec3 skyHorizonTint = vec3(0.66, 0.90, 1.0);
        vec3 finalColor = baseWater
          + uSunColor * specBroad * 0.48
          + uFoamColor * specSparkle * 0.62
          + skyHorizonTint * fresnel * 0.38;

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `
  });
}

/**
 * 2. Territory Surface Mat Shader (+0.18 units above water, opacity 0.88, high-contrast patterns & frothy glowing borders)
 */
export function createTerritoryMaterial(sunDirection = new THREE.Vector3(-0.45, 0.82, 0.35).normalize()) {
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

        // Render captured territory mats +0.18 units above water surface
        vec3 displacedPos = position + sphereDir * (waveH + 0.18);
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

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      // High-contrast 2D procedural paint pattern [0..1]
      float evalPattern2D(vec2 uv, int patId, float time) {
        if (patId == 0) {
          // 0: solid_gloss — smooth glossy paint with subtle polka shimmer
          vec2 g = fract(uv * 2.5) - 0.5;
          return smoothstep(0.32, 0.18, length(g)) * 0.28;
        }
        if (patId == 1) {
          // 1: messy_splatter — bold comic paint splotches and drips
          vec2 cell = floor(uv * 2.8);
          vec2 f = fract(uv * 2.8) - 0.5;
          float rnd = hash21(cell);
          vec2 offset = vec2(fract(rnd * 13.7) - 0.5, fract(rnd * 29.3) - 0.5) * 0.28;
          float ang = atan(f.y - offset.y, f.x - offset.x);
          float rad = 0.27 + 0.10 * sin(ang * 5.0 + rnd * 12.0) + 0.06 * cos(ang * 3.0);
          float d = length(f - offset);
          float mainSplat = 1.0 - smoothstep(rad - 0.025, rad + 0.02, d);
          float drip1 = 1.0 - smoothstep(0.07, 0.095, length(f + offset * 0.95));
          float drip2 = 1.0 - smoothstep(0.05, 0.075, length(f - vec2(offset.y, -offset.x) * 1.1));
          return clamp(mainSplat + drip1 + drip2, 0.0, 1.0);
        }
        if (patId == 2) {
          // 2: bubble_polka — high-contrast polka-dot bubbles
          vec2 g = uv * 3.4;
          vec2 id = floor(g);
          vec2 f = fract(g) - 0.5;
          f.y += sin(time * 1.8 + id.x * 1.7) * 0.06;
          float r = length(f);
          float disc = 1.0 - smoothstep(0.28, 0.32, r);
          float inner = 1.0 - smoothstep(0.14, 0.18, r);
          return clamp(disc * 0.85 + inner * 0.35, 0.0, 1.0);
        }
        if (patId == 3) {
          // 3: dizzy_swirls — bold hypnotic spiral motifs
          vec2 f = fract(uv * 1.9) - 0.5;
          float r = length(f);
          float a = atan(f.y, f.x);
          float swirl = sin(r * 24.0 - a * 2.0 - time * 2.8);
          return smoothstep(0.05, 0.55, swirl) * (1.0 - smoothstep(0.38, 0.48, r));
        }
        if (patId == 4) {
          // 4: star_doodles — hand-drawn crooked 5-pointed star patterns
          vec2 f = fract(uv * 2.8) - 0.5;
          float a = atan(f.y, f.x) + 0.25 * sin(time * 1.5);
          float r = length(f);
          float starR = 0.27 + 0.11 * cos(a * 5.0);
          return 1.0 - smoothstep(starR - 0.025, starR + 0.025, r);
        }
        // 5: suction_rings — scatter of octopus suction-cup rings
        vec2 g = uv * 3.2;
        vec2 id = floor(g);
        vec2 f = fract(g) - 0.5;
        float rnd = hash21(id);
        vec2 off = (vec2(rnd, fract(rnd * 7.13)) - 0.5) * 0.2;
        float d = length(f - off);
        float outerCup = 1.0 - smoothstep(0.30, 0.34, d);
        float innerHole = 1.0 - smoothstep(0.12, 0.16, d);
        return clamp(outerCup - innerHole * 0.85, 0.0, 1.0);
      }

      float sampleSphericalPattern(vec3 sphereDir, int patId, float time) {
        vec3 blend = pow(abs(sphereDir), vec3(4.0));
        blend /= max(blend.x + blend.y + blend.z, 0.0001);

        float scale = 4.6;
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
        float sunLight = 0.84 + 0.16 * max(dot(worldNormal, uSunDir), 0.0);

        float patMask = sampleSphericalPattern(worldNormal, patId, uTime);

        vec3 halfVec = normalize(uSunDir + viewDir);
        float wetSpec = pow(max(dot(worldNormal, halfVec), 0.0), 26.0) * 0.38;

        // Semi-translucent dark teal base cushion + high-contrast vibrant pattern fill
        vec3 deepCushion = mix(vec3(0.06, 0.22, 0.38), vColor * 0.78, 0.72) * sunLight;
        vec3 brightMotif = mix(vColor * 1.28, vec3(1.0, 0.99, 0.96), 0.38);
        vec3 matColor = mix(deepCushion, brightMotif, patMask * 0.85) + vec3(wetSpec);

        // Glowing frothy white + neon perimeter border
        float borderFactor = smoothstep(0.10, 0.75, vBorder);
        vec3 borderColor = matColor;

        if (borderId == 0) {
          // 0: bubbly_foam — frothy white + glowing neon outer rim
          float bubbles = 0.82 + 0.18 * sin(uTime * 5.5 + (worldNormal.x + worldNormal.z) * 65.0);
          borderColor = mix(vColor * 1.45, vec3(1.0, 1.0, 1.0), 0.78 * bubbles);
        } else if (borderId == 1) {
          // 1: neon_biolum — pulsing bioluminescent rim glow
          float pulse = 0.88 + 0.25 * sin(uTime * 6.5);
          borderColor = mix(vColor * 1.65, vec3(0.88, 1.0, 0.98), 0.65) * pulse;
        } else if (borderId == 2) {
          // 2: electric_zap — crackling cartoon lightning contour
          float zap = step(0.1, sin(uTime * 18.0 + (worldNormal.x * 70.0 - worldNormal.y * 65.0)));
          borderColor = mix(vec3(0.55, 0.98, 1.0), vec3(1.0, 0.96, 0.38), zap);
        } else {
          // 3: golden_crust — shiny raised metallic gold border
          float glint = 0.85 + 0.28 * sin(uTime * 4.5 + (worldNormal.x + worldNormal.y + worldNormal.z) * 40.0);
          borderColor = vec3(1.0, 0.88, 0.32) * glint;
        }

        vec3 finalRGB = mix(matColor, borderColor, borderFactor);
        // Base opacity 0.88, up to 0.98 on the glowing frothy border
        float finalAlpha = clamp(vAlpha * mix(0.88, 0.98, borderFactor), 0.0, 0.98);

        gl_FragColor = vec4(finalRGB, finalAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide
  });
}

/**
 * 3. Thick Neon-Core Active Trail Ribbon Shader
 * Renders a 3.5x wider glowing ribbon with a bright white/neon centerline core and smooth outer glow.
 */
export function createTrailRibbonMaterial(baseColor = new THREE.Color(0x00f5d4)) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: baseColor.clone() },
      uOpacity: { value: 0.95 }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;

      void main() {
        // Distance from ribbon centerline (vUv.x == 0.5)
        float distFromCenter = abs(vUv.x - 0.5) * 2.0;
        // Bright neon white-tinted core along center + saturated outer glow
        float coreMask = 1.0 - smoothstep(0.0, 0.42, distFromCenter);
        float edgeFade = 1.0 - smoothstep(0.68, 1.0, distFromCenter);

        float pulse = 0.9 + 0.1 * sin(vUv.y * 24.0 - uTime * 8.0);
        vec3 coreColor = mix(uColor * 1.35, vec3(1.0, 1.0, 1.0), 0.72);
        vec3 col = mix(uColor * 1.15, coreColor, coreMask * pulse);

        float alpha = edgeFade * uOpacity;
        if (alpha < 0.03) discard;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
}

/**
 * 4. Ethereal Holographic / Ectoplasm Ghost Shader
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
        float alpha = clamp(0.38 + fresnel * 0.52, 0.28, 0.90);
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
 * 5. Animated Bubbly White Shoreline Foam Ring Shader (around islands, rocks, coral reefs)
 */
export function createFoamRingMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#ffffff') }
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
        worldPos.xyz += sphereDir * (waveH + 0.16);
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
        if (r > 1.0 || r < 0.32) discard;

        float angle = atan(centered.y, centered.x);
        float bubbleScallop = sin(angle * 14.0 + uTime * 2.4) * 0.04 + cos(angle * 9.0 - uTime * 1.8) * 0.03;
        float rPerturbed = r + bubbleScallop;

        float wave1 = sin(rPerturbed * 28.0 - uTime * 3.4);
        float wave2 = cos(rPerturbed * 18.0 - uTime * 2.2 + sin(angle * 8.0) * 0.5);

        float frothyBands = smoothstep(0.05, 0.65, wave1 * 0.55 + wave2 * 0.45);
        float innerShore = smoothstep(0.32, 0.50, rPerturbed) * (1.0 - smoothstep(0.68, 0.98, rPerturbed));
        float alpha = frothyBands * innerShore * 0.92;

        if (alpha < 0.04) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
}

/**
 * 6. Whirlpool Vortex Shader (Sunny Turquoise & Frothy White Spiral)
 */
export function createWhirlpoolMaterial(portalColor = new THREE.Color(0x48cae4)) {
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

        float foamBand = smoothstep(0.18, 0.82, spiral1 * 0.65 + spiral2 * 0.35);
        vec3 deepCore = vec3(0.02, 0.16, 0.30);
        vec3 midVortex = mix(vec3(0.05, 0.52, 0.72), uPortalColor, 0.55);
        vec3 foamWhite = vec3(0.98, 1.0, 1.0);

        vec3 col = mix(deepCore, midVortex, smoothstep(0.08, 0.75, r));
        col = mix(col, foamWhite, foamBand * smoothstep(0.10, 0.92, r) * 0.92);

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
 * 7. Volumetric Golden Sunbeams (God Rays) Shader
 */
export function createSunbeamsMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xfff0b8) }
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
        float edgeFade = pow(abs(dot(normalize(vNormal), normalize(vViewDir))), 1.4);
        float verticalFade = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
        float rayStreak = 0.68 + 0.32 * sin(vUv.x * 25.1327 + uTime * 0.9) * cos(vUv.x * 12.566 - uTime * 0.6);

        float alpha = edgeFade * verticalFade * rayStreak * 0.16;
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
 * 8. Warm Sunny Horizon Glow Shader
 */
export function createAtmosphereMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#a8e6ff') },
      uSunColor: { value: new THREE.Color('#fff4cc') },
      uSunDir: { value: new THREE.Vector3(-0.45, 0.82, 0.35).normalize() }
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
        float glow = pow(rim, 2.4) * 0.68;
        float sunTint = clamp(dot(vNormal, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(uColor, uSunColor, sunTint * 0.55);
        gl_FragColor = vec4(col, glow);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide
  });
}

// ============================================================================
// APUS.IO — CORE CONFIGURATION, CUSTOMIZATION CATALOGS & GAMEPLAY CONSTANTS
// ============================================================================

export const CONFIG = {
  // Spherical World
  SPHERE_RADIUS: 100,
  SUBDIVISION_DETAIL: 27, // Icosahedron subdivision: 20 * (27+1)^2 = 15,680 geodesic cells

  // Gameplay Rules & Toggles (Requested Configurable Flags)
  ALLOW_SELF_CROSS: false,        // Crossing one's own active trail severs it and triggers elimination
  STRICT_OBSTACLE_CRASH: false,   // false = smooth sliding deflection along obstacle perimeter; true = breaks active trail / eliminates
  SHARK_LETHAL_BITE: false,       // false = destroys active trail + 0.8s shockwave stun without eliminating base; true = full elimination
  DOMINATION_TARGET: 35.0,        // 35% of navigable sphere surface triggers Victory Celebration

  // Contenders & Movement
  MAX_PLAYERS: 10,                // Total contenders in a full room (1 Local + up to 9 Bots/Peers)
  BOT_COUNT: 9,                   // Default AI competitors
  BASE_SPEED: 22.0,               // Units per second along sphere surface
  GHOST_SPEED_MULTIPLIER: 1.35,   // Ghosts glide freely at +35% base speed
  GHOST_FLOAT_OFFSET: 2.5,        // Ghosts float 2.5 units above the water surface
  TURN_SPEED: 2.65,               // Max angular steering velocity (rad/s in tangent plane)
  STARTER_ZONE_RADIUS: 8.2,       // Initial circular territory radius on spawn
  SPAWN_IMMUNITY_DURATION: 2.0,   // Seconds of immunity after fresh spawn
  WHIRLPOOL_IMMUNITY_DURATION: 1.5, // 1.5s immunity after teleporting through a whirlpool
  SHARK_STUN_DURATION: 0.8,       // 0.8s stun when a shark bites an active trail (if SHARK_LETHAL_BITE === false)

  // Trail & Capture
  TRAIL_SAMPLE_DISTANCE: 0.9,     // Arc distance between trail ribbon nodes
  NORMAL_TRAIL_WIDTH: 1.35,       // Standard ribbon width
  BROAD_BRUSH_MULTIPLIER: 3.0,    // Triples trail width during Wide Wake power-up
  TRAIL_HIT_RADIUS: 1.55,         // Collision radius for severing an active trail

  // Camera (Isometric Spherical Perspective)
  CAMERA_FOV: 32,                 // Narrow FOV (30–35 deg) for orthographic-like isometric feel
  CAMERA_TILT_DEG: 48,            // Polar tilt angle (45–55 deg)
  CAMERA_DISTANCE: 92,            // Orbit distance from player on sphere
  CAMERA_SMOOTHNESS: 7.5,         // Damping factor for camera orbit follow

  // World Obstacles
  CLIFF_COUNT: 14,
  TREE_ISLAND_COUNT: 12,
  CORAL_REEF_COUNT: 16,

  // Dynamic Hazards & Power-Ups
  WHIRLPOOL_PAIR_COUNT: 3,        // 3 pairs = 6 linked vortexes on opposite hemispheres
  SHARK_COUNT: 7,                 // Autonomous trail-cutting sharks
  MAX_POWERUPS: 18,               // Luminous floating buoys across the sphere
  POWERUP_RESPAWN_TIME: 7.0,

  // Power-Up Durations & Multipliers
  POWERUPS: {
    SPEED_BOOST: {
      id: 'SPEED_BOOST',
      name: 'Speed Surge',
      subtitle: '+45% Speed & Golden Wake',
      duration: 6.0,
      speedMultiplier: 1.45,
      color: 0xffd147,
      hex: '#ffd147',
      icon: '⚡'
    },
    SEMI_TRANSPARENCY: {
      id: 'SEMI_TRANSPARENCY',
      name: 'Phantom Cloak',
      subtitle: '80% Stealth vs Sharks & Bots',
      duration: 7.0,
      opacity: 0.2,
      color: 0x70f3ff,
      hex: '#70f3ff',
      icon: '👻'
    },
    INSTANT_ANCHOR: {
      id: 'INSTANT_ANCHOR',
      name: 'Snap Anchor',
      subtitle: 'Instant Tether Retract & Claim',
      duration: 1.2,
      color: 0x4dff91,
      hex: '#4dff91',
      icon: '⚓'
    },
    BROAD_BRUSH: {
      id: 'BROAD_BRUSH',
      name: 'Wide Wake',
      subtitle: '3x Trail Corridor Width',
      duration: 8.0,
      widthMultiplier: 3.0,
      color: 0xff66cc,
      hex: '#ff66cc',
      icon: '🌊'
    },
    SONAR_WAVE: {
      id: 'SONAR_WAVE',
      name: 'Repulsor Pulse',
      subtitle: 'Spherical Shockwave Push',
      duration: 2.0,
      radius: 26.0,
      pushStrength: 34.0,
      color: 0x5ce1e6,
      hex: '#5ce1e6',
      icon: '📡'
    }
  },

  // 1. 12 High-Contrast Vibrant & Pastel Paint Colors
  CONTENDER_PALETTE: [
    { id: 'seafoam',   name: 'Electric Seafoam', color: 0x00f5d4, hex: '#00f5d4', emissive: 0x00a896 },
    { id: 'crimson',   name: 'Coral Crimson',    color: 0xff3864, hex: '#ff3864', emissive: 0xb81d41 },
    { id: 'sunburst',  name: 'Sunburst Amber',   color: 0xffbe0b, hex: '#ffbe0b', emissive: 0xc99300 },
    { id: 'violet',    name: 'Abyssal Violet',   color: 0x9b5de5, hex: '#9b5de5', emissive: 0x6229b5 },
    { id: 'azure',     name: 'Azure Surge',      color: 0x3a86ff, hex: '#3a86ff', emissive: 0x1b56bd },
    { id: 'magenta',   name: 'Bubblegum Pop',    color: 0xff4791, hex: '#ff4791', emissive: 0xb31b59 },
    { id: 'mint',      name: 'Pastel Mint',      color: 0x64dfdf, hex: '#64dfdf', emissive: 0x289696 },
    { id: 'tangerine', name: 'Tangy Sherbet',    color: 0xfb5607, hex: '#fb5607', emissive: 0xb83b00 },
    { id: 'peach',     name: 'Pastel Peach',     color: 0xff9ebb, hex: '#ff9ebb', emissive: 0xc45b7a },
    { id: 'lavender',  name: 'Dreamy Lilac',     color: 0xc77dff, hex: '#c77dff', emissive: 0x853ec2 },
    { id: 'lime',      name: 'Radioactive Kelp', color: 0xaacc00, hex: '#aacc00', emissive: 0x738a00 },
    { id: 'lemon',     name: 'Banana Custard',   color: 0xffee70, hex: '#ffee70', emissive: 0xb8a425 }
  ],

  // 2. 6 Selectable Goofy Figurines / Headgear
  FIGURINES: [
    {
      id: 'tin_colander',
      name: 'Tin Colander',
      icon: '🥣',
      desc: 'Crooked strainer helmet + bent spoon'
    },
    {
      id: 'sliding_crown',
      name: 'Sliding Crown',
      icon: '👑',
      desc: 'Oversized gold crown slipping over one eye'
    },
    {
      id: 'cracked_fishbowl',
      name: 'Cracked Fishbowl',
      icon: '🦆',
      desc: 'Tilted glass bowl with a tiny rubber duck'
    },
    {
      id: 'soggy_pirate',
      name: 'Soggy Pirate',
      icon: '🏴‍☠️',
      desc: 'Newspaper hat & forehead eyepatch'
    },
    {
      id: 'traffic_cone',
      name: 'Traffic Cone',
      icon: '🚧',
      desc: 'Street cone jammed like a wizard hat'
    },
    {
      id: 'propeller_beanie',
      name: 'Propeller Beanie',
      icon: '🚁',
      desc: 'Striped cap with frantic spinning prop'
    }
  ],

  // 3. 6 Surface Paint Patterns (mapped to integer index 0..5 for GLSL shader)
  PATTERNS: [
    { id: 'solid_gloss',    index: 0, name: 'Solid Gloss',    icon: '💧', desc: 'Smooth glossy paint' },
    { id: 'messy_splatter', index: 1, name: 'Messy Splatter', icon: '🎨', desc: 'Comic paint splotches & drips' },
    { id: 'bubble_polka',   index: 2, name: 'Bubble Polka',   icon: '🫧', desc: 'Floating polka-dot bubbles' },
    { id: 'dizzy_swirls',   index: 3, name: 'Dizzy Swirls',   icon: '🌀', desc: 'Wobbly hypnotic spirals' },
    { id: 'star_doodles',   index: 4, name: 'Star Doodles',   icon: '⭐', desc: 'Hand-drawn crooked stars' },
    { id: 'suction_rings',  index: 5, name: 'Suction Rings',  icon: '🐙', desc: 'Octopus suction-cup rings' }
  ],

  // 4. 4 Territory Border Effects (mapped to integer index 0..3 for GLSL shader)
  BORDER_EFFECTS: [
    { id: 'bubbly_foam',   index: 0, name: 'Bubbly Foam',   icon: '🌊', desc: 'Frothy white sea foam edge' },
    { id: 'neon_biolum',   index: 1, name: 'Neon Biolum',   icon: '✨', desc: 'Pulsing bioluminescent rim' },
    { id: 'electric_zap',  index: 2, name: 'Electric Zap',  icon: '⚡', desc: 'Crackling lightning contour' },
    { id: 'golden_crust',  index: 3, name: 'Golden Crust',  icon: '🥇', desc: 'Shiny metallic gold border' }
  ],

  // Pool of Derpy Random Nicknames for Players & AI Bots
  DERPY_NICKNAMES: [
    'Sir Flops-a-Lot',
    'NoodleBrain',
    'SoggySquid',
    'Captain Tangled',
    'Derp Tentacle',
    'Dr. Suction',
    'WobbleBlob',
    'Lord Googly',
    'InkSpiller',
    'ClumsyKraken',
    'SpaghettiArms',
    'BonkOctopus',
    'DizzyCephalopod',
    'SquishyMcFlop',
    'ColanderKnight',
    'RubberDuckHead',
    'ConeWizard',
    'PropellerPulp',
    'SplatMaster',
    'BarnacleBrain'
  ]
};

export function getPatternIndex(patternId) {
  const found = CONFIG.PATTERNS.find(p => p.id === patternId);
  return found ? found.index : 0;
}

export function getBorderEffectIndex(borderEffectId) {
  const found = CONFIG.BORDER_EFFECTS.find(b => b.id === borderEffectId);
  return found ? found.index : 0;
}

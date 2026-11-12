// ============================================================================
// APUS.IO — CORE CONFIGURATION, MATCH SETTINGS & CUSTOMIZATION CATALOGS
// ============================================================================

export const CONFIG = {
  // Spherical World
  SPHERE_RADIUS: 100,
  SUBDIVISION_DETAIL: 27, // Icosahedron subdivision: 20 * (27+1)^2 = 15,680 geodesic cells

  // Gameplay Rules & Toggles
  ALLOW_SELF_CROSS: false,        // Crossing one's own active trail severs it and triggers elimination
  STRICT_OBSTACLE_CRASH: false,   // Solid obstacles NEVER kill or break trails (always smooth sliding collision)
  SHARK_LETHAL_BITE: false,       // Shark bites ONLY snap active trail & never wipe owned territory
  DOMINATION_TARGET: 35.0,        // 35% of navigable sphere surface triggers Victory Celebration

  // Match & Hazard Settings (Configurable in Pre-Game Lobby & Settings Modal)
  GAME_SPEED_MULTIPLIER: 1.0,     // 0.5x (Chill) -> 1.0x (Normal) -> 1.5x (Fast) -> 2.0x (Turbo)
  DIFFICULTY: 'normal',           // 'easy' | 'normal' | 'hard'
  SHARK_COUNT: 5,                 // Slider from 0 to 15 patrolling sharks (default: 5)
  SHARK_SPEED_MULTIPLIER: 1.0,    // Slider from 0.5x (Lazy) to 2.0x (Frenzy)

  // Contenders & Movement
  MAX_PLAYERS: 10,                // Total contenders in a full room (1 Local + up to 9 Bots/Peers)
  BOT_COUNT: 9,                   // Default AI competitors
  BASE_SPEED: 20.0,               // Base units per second along sphere surface (scaled by GAME_SPEED_MULTIPLIER)
  GHOST_SPEED_MULTIPLIER: 1.35,   // Ghosts glide freely at +35% base speed
  GHOST_FLOAT_OFFSET: 2.5,        // Ghosts float 2.5 units above the water surface
  TURN_SPEED: 2.75,               // Max angular steering velocity (rad/s in tangent plane)
  STARTER_ZONE_RADIUS: 8.5,       // Initial circular territory radius on spawn (~4+ cells radius)
  SPAWN_IMMUNITY_DURATION: 2.0,   // Seconds of immunity after fresh spawn
  WHIRLPOOL_IMMUNITY_DURATION: 1.5, // 1.5s immunity after teleporting through a whirlpool
  SHARK_STUN_DURATION: 0.65,      // Brief stun when a shark snaps an active trail

  // Avatar & Trail Visual Scale (Sunny Claymorphism Overhaul)
  OCTOPUS_SCALE: 1.8,             // 1.8x big derpy chibi octopus scale
  NAMEPLATE_HEIGHT_OFFSET: 7.8,   // Raised +3.5 units higher so UI labels NEVER cover headgear
  TRAIL_SAMPLE_DISTANCE: 0.75,    // Arc distance between trail ribbon nodes
  NORMAL_TRAIL_WIDTH: 2.65,       // 3.5x wider active trail ribbon with bright neon core
  BROAD_BRUSH_MULTIPLIER: 2.4,    // Extra wide corridor during Wide Wake power-up
  TRAIL_HIT_RADIUS: 1.75,         // Collision radius for severing an active trail

  // Camera Framing (Fill 95-100% of Screen with Ocean)
  CAMERA_FOV: 28,                 // Narrow isometric FOV = 28 deg
  CAMERA_ELEVATION_DEG: 58,       // Elevation angle ~58 deg above local tangent plane (32 deg from normal)
  CAMERA_DISTANCE: 42,            // Close orbit distance (42 units) so turquoise ocean fills 95-100% of screen
  CAMERA_SMOOTHNESS: 8.0,         // Smooth damping factor for camera orbit follow

  // World Obstacles
  CLIFF_COUNT: 12,
  TREE_ISLAND_COUNT: 14,
  CORAL_REEF_COUNT: 14,

  // Dynamic Hazards & Power-Ups
  WHIRLPOOL_PAIR_COUNT: 3,        // 3 pairs = 6 linked vortexes on opposite hemispheres
  MAX_POWERUPS: 18,               // Luminous floating buoys across the sphere
  POWERUP_RESPAWN_TIME: 6.5,

  // Difficulty Presets Lookup
  DIFFICULTY_PRESETS: {
    easy: {
      id: 'easy',
      name: 'Easy (Cozy Reef)',
      botAggressionMult: 0.45,
      botTurnMult: 0.78,
      powerUpRespawnMult: 0.65,
      whirlpoolPull: 0.6
    },
    normal: {
      id: 'normal',
      name: 'Normal (Balanced Ocean)',
      botAggressionMult: 1.0,
      botTurnMult: 1.0,
      powerUpRespawnMult: 1.0,
      whirlpoolPull: 1.0
    },
    hard: {
      id: 'hard',
      name: 'Hard (Apex Chaos)',
      botAggressionMult: 1.65,
      botTurnMult: 1.25,
      powerUpRespawnMult: 1.15,
      whirlpoolPull: 1.5
    }
  },

  // Power-Up Durations & Multipliers
  POWERUPS: {
    SPEED_BOOST: {
      id: 'SPEED_BOOST',
      name: 'Jet Ink Surge',
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
      opacity: 0.25,
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
      subtitle: 'Mega Trail Corridor Width',
      duration: 8.0,
      widthMultiplier: 2.4,
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

  // 1. 12 High-Contrast Vibrant & Pastel Claymorphism Paint Colors
  CONTENDER_PALETTE: [
    { id: 'coral_pink', name: 'Coral Flamingo',   color: 0xff5c8a, hex: '#ff5c8a', emissive: 0xc92a5b },
    { id: 'violet',     name: 'Grape Jelly',      color: 0x9b5de5, hex: '#9b5de5', emissive: 0x6229b5 },
    { id: 'lime',       name: 'Key Lime Splash',  color: 0x8ac926, hex: '#8ac926', emissive: 0x588a0c },
    { id: 'seafoam',    name: 'Electric Seafoam', color: 0x00f5d4, hex: '#00f5d4', emissive: 0x00a896 },
    { id: 'sunburst',   name: 'Mango Sorbet',     color: 0xffbe0b, hex: '#ffbe0b', emissive: 0xc99300 },
    { id: 'magenta',    name: 'Bubblegum Pop',    color: 0xf15bb5, hex: '#f15bb5', emissive: 0xb31b79 },
    { id: 'azure',      name: 'Lagoon Blue',      color: 0x00bbf9, hex: '#00bbf9', emissive: 0x0077b6 },
    { id: 'tangerine',  name: 'Tangerine Clay',   color: 0xfb5607, hex: '#fb5607', emissive: 0xb83b00 },
    { id: 'mint',       name: 'Pastel Mint',      color: 0x64dfdf, hex: '#64dfdf', emissive: 0x289696 },
    { id: 'lavender',   name: 'Dreamy Lilac',     color: 0xc77dff, hex: '#c77dff', emissive: 0x853ec2 },
    { id: 'crimson',    name: 'Ruby Starfish',    color: 0xff3864, hex: '#ff3864', emissive: 0xb81d41 },
    { id: 'lemon',      name: 'Banana Custard',   color: 0xffee70, hex: '#ffee70', emissive: 0xb8a425 }
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
    { id: 'solid_gloss',    index: 0, name: 'Solid Gloss',    icon: '💧', desc: 'Smooth glossy clay paint' },
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
    'Octo-Pete',
    'DerpyMcDerp',
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
    'PropellerPulp'
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

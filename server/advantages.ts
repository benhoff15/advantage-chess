import type { Advantage } from "../shared/types";

export const ADVANTAGE_POOL: Advantage[] = [
  // 🔹 Common (70%)
  { id: "silent_shield", name: "Silent Shield", description: "One random piece (excluding king) cannot be captured.", rarity: "common" },
  { id: "pawn_rush", name: "Pawn Rush", description: "All your pawns can move 2 squares at any time.", rarity: "common" },
  { id: "castle_master", name: "Castle Master", description: "You may castle even if the king or rook has moved once.", rarity: "common" },
  { id: "lightning_capture", name: "Lightning Capture", description: "One piece captures and instantly moves again.", rarity: "common" },
  { id: "auto_deflect", name: "Auto-Deflect", description: "Your king cannot be checked by knights.", rarity: "common" },
  { id: "bluffing_rights", name: "Bluffing Rights", description: "You may highlight a square each turn as a fake intent.", rarity: "common" },
  { id: "royal_escort", name: "Royal Escort", description: "Your king may move two squares in any direction once.", rarity: "common" },
  { id: "recall", name: "Recall", description: "Teleport any piece to its position 3 turns ago, once.", rarity: "common" },
  { id: "time_bubble", name: "Time Bubble", description: "Freeze your clock for 10 seconds once automatically.", rarity: "common" },
  { id: "corner_blitz", name: "Corner Blitz", description: "Your rooks may leap over pawns on their first move.", rarity: "common"},
  { id: "shield_wall", name: "Shield Wall", description: "Your pawns cannot be captured during the first 5 moves.", rarity: "common"},
  { id: "focused_bishop", name: "Focused Bishop", description: "One of your bishops may move like a rook once.", rarity: "common"},
  { id: "opening_swap", name: "Opening Swap", description: "You may swap two non-king pieces on your back rank before turn 1.", rarity: "common"},


  // 🔸 Rare (25%)
  { id: "pawn_ambush", name: "Pawn Ambush", description: "A pawn promotes on reaching 6th rank.", rarity: "rare" },
  { id: "loyal_bishop", name: "Loyal Bishop", description: "One bishop can move like a queen once.", rarity: "rare" },
  { id: "cloak", name: "Cloak", description: "One piece starts invisible to the opponent.", rarity: "rare" },
  { id: "counterplay", name: "Counterplay", description: "If your queen is captured, she reappears at home.", rarity: "rare" },
  { id: "knightmare", name: "Knightmare", description: "Each knight may make a double L-move once.", rarity: "rare" },
  { id: "twin_shadows", name: "Twin Shadows", description: "One piece has a mirrored twin that mimics its moves.", rarity: "rare" },
  { id: "ghost_move", name: "Ghost Move", description: "Play one hidden move that appears later.", rarity: "rare" },
  { id: "void_step", name: "Void Step", description: "One piece can pass through other pieces once.", rarity: "rare"},

  // 🔶 Legendary (5%)
  { id: "second_wind", name: "Second Wind", description: "After checkmate, get one move to counter-mate.", rarity: "legendary" },
  { id: "quantum_leap", name: "Quantum Leap", description: "Swap any two of your pieces once.", rarity: "legendary" },
  { id: "secret_weapon", name: "Secret Weapon", description: "One pawn is secretly a queen in disguise.", rarity: "legendary" },
  { id: "royal_clone", name: "Royal Clone", description: "Spawn a second king that must be captured before the opponent can checkmate.", rarity: "legendary" },
  { id: "ethereal_gambit", name: "Ethereal Gambit", description: "Start with an extra bishop placed randomly.", rarity: "legendary" },
  { id: "time_rewind", name: "Time Rewind", description: "Undo both players’ last full moves after a capture.", rarity: "legendary" },
  { id: "piece_fusion", name: "Piece Fusion", description: "Once, fuse two adjacent pieces into one hybrid powerhouse.", rarity: "legendary"},
  { id: "flash_forward", name: "Flash Forward", description: "Skip your opponent’s turn once. Time bends for you.", rarity: "legendary"},
  { id: "doppelganger", name: "Doppelgänger", description: "Choose a piece to mimic the abilities of an enemy piece it's facing.", rarity: "legendary"},
  { id: "phantom_king", name: "Phantom King", description: "Your king is invisible to your opponent for the first 10 turns.", rarity: "legendary"},
];

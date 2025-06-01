import type { Advantage } from "../shared/types";

export const ADVANTAGE_POOL: Advantage[] = [
  // 🔹 Common (70%)
  { id: "silent_shield", name: "Silent Shield", description: "One random piece (excluding king) cannot be captured.", rarity: "common" },
  { id: "pawn_rush", name: "Pawn Rush", description: "All your pawns can move 2 squares at any time.", rarity: "common" },
  { id: "castle_master", name: "Castle Master", description: "You may castle even if the king or rook has moved once.", rarity: "common" },
  { id: "promo_boost", name: "Promo Boost", description: "You may promote to queen even if you already have one.", rarity: "common" },
  { id: "auto_deflect", name: "Auto-Deflect", description: "Your king cannot be checked by knights.", rarity: "common" },
  { id: "unseen_undo", name: "Unseen Undo", description: "Undo your last move once. Opponent sees nothing unusual.", rarity: "common" },
  { id: "bluffing_rights", name: "Bluffing Rights", description: "You may highlight a square each turn as a fake intent.", rarity: "common" },
  { id: "royal_escort", name: "Royal Escort", description: "Your king may move two squares in any direction once.", rarity: "common" },
  { id: "recall", name: "Recall", description: "Teleport any piece to its position 3 turns ago, once.", rarity: "common" },
  { id: "time_bubble", name: "Time Bubble", description: "Freeze your clock for 10 seconds once automatically.", rarity: "common" },

  // 🔸 Rare (25%)
  { id: "pawn_ambush", name: "Pawn Ambush", description: "A pawn promotes on reaching 6th rank.", rarity: "rare" },
  { id: "loyal_bishop", name: "Loyal Bishop", description: "One bishop can move like a queen once.", rarity: "rare" },
  { id: "cloak", name: "Cloak", description: "One piece starts invisible to the opponent.", rarity: "rare" },
  { id: "counterplay", name: "Counterplay", description: "If your queen is captured, she reappears at home.", rarity: "rare" },
  { id: "knightmare", name: "Knightmare", description: "Each knight may make a double L-move once.", rarity: "rare" },
  { id: "twin_shadows", name: "Twin Shadows", description: "One piece has a mirrored twin that mimics its moves.", rarity: "rare" },
  { id: "ghost_move", name: "Ghost Move", description: "Play one hidden move that appears later.", rarity: "rare" },
  { id: "psych_out", name: "Psych-Out", description: "See the square your opponent hovered on longest.", rarity: "rare" },

  // 🔶 Legendary (5%)
  { id: "second_wind", name: "Second Wind", description: "After checkmate, get one move to counter-mate.", rarity: "legendary" },
  { id: "quantum_leap", name: "Quantum Leap", description: "Swap any two of your pieces once.", rarity: "legendary" },
  { id: "secret_weapon", name: "Secret Weapon", description: "One pawn is secretly a queen in disguise.", rarity: "legendary" },
  { id: "royal_clone", name: "Royal Clone", description: "Spawn a second king that must be checkmated too.", rarity: "legendary" },
  { id: "ethereal_gambit", name: "Ethereal Gambit", description: "Start with an extra bishop placed randomly.", rarity: "legendary" },
  { id: "time_rewind", name: "Time Rewind", description: "Undo both players’ last full moves after a capture.", rarity: "legendary" },
];

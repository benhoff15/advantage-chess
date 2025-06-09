import type { Advantage } from "../shared/types";
import { validateQueensDomainServerMove } from "./logic/advantages/queensDomain";

export const ADVANTAGE_POOL: Advantage[] = [
  // Common (70%)
  { id: "silent_shield", name: "Silent Shield", description: "One random piece (excluding king) cannot be captured.", rarity: "common" }, // done
  { id: "pawn_rush", name: "Pawn Rush", description: "All your pawns can move 2 squares at any time.", rarity: "common" }, // done
  { id: "castle_master", name: "Castle Master", description: "You may castle even if the king or rook has moved once.", rarity: "common" }, // done
  { id: "auto_deflect", name: "Auto-Deflect", description: "Your king cannot be checked by knights.", rarity: "common" }, // done
  { id: "royal_escort", name: "Royal Escort", description: "Your king may move two squares in any direction up to 3 times per game.", rarity: "common" }, // done
  { id: "corner_blitz", name: "Corner Blitz", description: "Your rooks may leap over pawns on their first move.", rarity: "common"}, // done
  { id: "shield_wall", name: "Shield Wall", description: "Your pawns cannot be captured during the first 5 moves.", rarity: "common"}, // done
  { id: "focused_bishop", name: "Focused Bishop", description: "One of your bishops may move like a rook once.", rarity: "common"}, // done
  { id: "opening_swap", name: "Opening Swap", description: "You may swap two non-king pieces on your back rank before turn 1.", rarity: "common"}, // done
  { id: "royal_decree", name: "Royal Decree", description: "Once per game, you can force your opponent's next move to be with a specific piece type", rarity: "common"}, // done
  { id: "sacrificial_blessing", name: "Sacrificial Blessing", description: "The first time one of your Knights or Bishops is captured, you may immediately move another one of your Knights or Bishops (if you have one) to any empty square on the board. Doesn't count as a turn.", rarity: "common"}, // done
  { id: "restless_king", name: "Restless King", description: "If your king moves, your opponent cannot give check on their next turn.", rarity: "common" }, // done
  { id: "queens_domain", name: "Queen’s Domain", description: "Your queen may pass through friendly pieces once per game.", rarity: "common", serverValidation: validateQueensDomainServerMove }, // done
  { id: "coordinated_push", name: "Coordinated Push", description: "When two of your pawns are side by side toggle to move both forward in the same turn.", rarity: "common"}, // done

  // Rare (25%)
  { id: "pawn_ambush", name: "Pawn Ambush", description: "A pawn promotes on reaching 6th rank.", rarity: "rare" }, // done
  { id: "cloak", name: "Cloak", description: "One random piece starts invisible to the opponent. Lasts for 10 moves", rarity: "rare" }, // done
  { id: "queenly_compensation", name: "Queenly Compensation", description: "When your queen is captured, a knight is summoned onto her home square. If the square is occupied, the knight replaces the occupying piece.", rarity: "rare"}, // done
  { id: "knightmare", name: "Knightmare", description: "A knight may make a double L-move once.", rarity: "rare" }, // done
  { id: "void_step", name: "Void Step", description: "One piece can pass through other pieces once.", rarity: "rare"}, // done
  { id: "recall", name: "Recall", description: "Teleport any piece to its position 3 turns ago, once.", rarity: "rare" },
  { id: "lightning_capture", name: "Lightning Capture", description: "One piece captures and instantly moves again. Can be used only once. Must be activated before use.", rarity: "rare" }, // done
  { id: "no_show_bishop", name: "No-Show Bishop", description: "Leave one bishop off the board. You may summon it to any empty square before turn 10.", rarity: "rare" }, // done
  { id: "arcane_reinforcement", name: "Arcane Reinforcement", description: "Start with an extra bishop placed randomly.", rarity: "rare" }, // done

  // Legendary (5%)
  { id: "second_wind", name: "Second Wind", description: "After checkmate, get one move to counter-mate.", rarity: "legendary" },
  { id: "quantum_leap", name: "Quantum Leap", description: "Swap any two of your pieces once. Doesn't count as a turn", rarity: "legendary" },
  { id: "secret_weapon", name: "Secret Weapon", description: "One pawn is secretly a queen in disguise.", rarity: "legendary" },
  { id: "hidden_heir", name: "Hidden Heir", description: "Select one piece before the game starts. This piece must be captured before the opponent can checkmate.", rarity: "legendary" },
  // Rotate in later{ id: "time_rewind", name: "Time Rewind", description: "Undo both players’ last full moves after a capture.", rarity: "legendary" },
  // Rotate in later{ id: "flash_forward", name: "Flash Forward", description: "Skip your opponent’s turn once. Time bends for you.", rarity: "legendary"},
  // Rotate in later{ id: "doppelganger", name: "Doppelgänger", description: "Choose a piece to mimic the abilities of an enemy piece it's facing.", rarity: "legendary"},
  // Rotate in later{ id: "phantom_king", name: "Phantom King", description: "Your king is invisible to your opponent for the first 10 turns.", rarity: "legendary"},
];
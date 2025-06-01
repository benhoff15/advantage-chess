export type Rarity = "common" | "rare" | "legendary";

export interface Advantage {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
}

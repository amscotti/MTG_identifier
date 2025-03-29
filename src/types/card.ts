import { z } from "zod";

/**
 * Zod schema for validating MTG card data
 */
export const MTGCardSchema = z.object({
  cardName: z.string(),
  setCode: z.string(),
  borderColor: z.enum(["Black", "White", "Silver", "Gold", "Borderless"]),
  artist: z.string(),
  rarity: z.enum(["Common", "Uncommon", "Rare", "Mythic Rare"]),
  manaCost: z.string().optional(),
  powerToughness: z.string().optional(),
  type: z.string(),
});

/**
 * Represents a Magic: The Gathering card
 */
export type MTGCard = z.infer<typeof MTGCardSchema>;

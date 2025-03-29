import fs from "node:fs/promises";
import path from "node:path";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import type { InlineDataPart, Part, Schema, TextPart } from "@google/generative-ai";
import type { MTGCard } from "../types/card.ts";
import { MTGCardSchema } from "../types/card.ts";
import { fileUtils } from "../utils/fileUtils.ts";

/**
 * Service for interacting with the Gemini API
 */
class GeminiService {
  private genAI: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  /**
   * Schema definition for structured JSON output of MTG card data
   */
  private readonly responseSchema: Schema = {
    type: SchemaType.OBJECT,
    properties: {
      cardName: {
        type: SchemaType.STRING,
        description: "The name of the card as printed at the top of the card",
      },
      setCode: {
        type: SchemaType.STRING,
        description:
          "The three-letter code for the set determined by the expansion symbol (e.g., 'LEG' for Legends, 'CHR' for Chronicles, 'UMA' for Ultimate Masters, 'DMU' for Dominaria United)",
      },
      borderColor: {
        type: SchemaType.STRING,
        enum: ["Black", "White", "Silver", "Gold", "Borderless"],
        format: "enum",
        description:
          "The color of the card's border. White borders often indicate reprints like Chronicles, while black borders are typically for original printings. If you cannot determine the border color with certainty, do not include this field.",
      },
      powerToughness: {
        type: SchemaType.STRING,
        description:
          "The power and toughness of creature cards, shown as numbers in bottom right corner (e.g., '3/2')",
      },
      artist: {
        type: SchemaType.STRING,
        description:
          "The name of the artist who illustrated the card, printed at the bottom of the illustration",
      },
      rarity: {
        type: SchemaType.STRING,
        enum: ["Common", "Uncommon", "Rare", "Mythic Rare"],
        format: "enum",
        description: "The rarity of the card, usually indicated by the color of the set symbol",
      },
      manaCost: {
        type: SchemaType.STRING,
        description:
          "The mana cost of the card, shown as symbols in the top right corner (e.g., '{1}{U}{B}')",
      },
      type: {
        type: SchemaType.STRING,
        description:
          "The card type line, which may include types, subtypes, and supertypes (e.g., 'Creature — Human Wizard')",
      },
    },
    required: ["cardName", "setCode", "borderColor", "artist", "rarity", "type"],
  };

  /**
   * Load examples from the Examples directory
   * @returns Object containing example images and their corresponding JSON data
   */
  private async loadExamples(): Promise<Array<{ imagePath: string; exampleData: MTGCard }>> {
    try {
      const examplesDir = path.join(process.cwd(), "Examples");
      const files = await fs.readdir(examplesDir);

      // Find JSON files and their corresponding images
      const jsonFiles = files.filter((file) => file.endsWith(".json"));
      const examples: Array<{ imagePath: string; exampleData: MTGCard }> = [];

      for (const jsonFile of jsonFiles) {
        const baseName = jsonFile.replace(".json", "");
        const imageFile = files.find(
          (file) =>
            file.startsWith(baseName) &&
            (file.endsWith(".jpg") || file.endsWith(".jpeg") || file.endsWith(".png"))
        );

        if (imageFile) {
          const jsonPath = path.join(examplesDir, jsonFile);
          const imagePath = path.join(examplesDir, imageFile);

          const jsonContent = await fs.readFile(jsonPath, "utf-8");
          const exampleData = JSON.parse(jsonContent) as MTGCard;

          examples.push({ imagePath, exampleData });
        }
      }

      return examples;
    } catch (error) {
      console.error("Error loading examples:", error);
      return [];
    }
  }

  /**
   * Create a detailed prompt with examples and visual guide for MTG card identification
   * @param examples Array of example cards with their data
   * @returns Prompt text with embedded examples
   */
  private async createPromptWithExamples(
    examples: Array<{ imagePath: string; exampleData: MTGCard }>
  ): Promise<{ text: string; parts: Part[] }> {
    // Base prompt with detailed descriptions of card elements
    const basePrompt = `
Analyze this Magic: The Gathering card and identify all visible information according to the schema.

MTG CARD ANATOMY GUIDE:

1. CARD NAME: Located at the top center of the card. The primary identifier.

2. SET CODE: The three-letter code representing the expansion set (e.g., 'LEG' for Legends, 'STH' for Stronghold).
   - Look for this at the bottom of the card in small print
   - For older white-bordered cards that are reprints (like Chronicles), identify the original set code
   - For cards with NO EXPANSION SYMBOL that have white borders:
     * Check the copyright date at bottom: "© 1995" = 4ED (Fourth Edition)
     * Check the copyright date at bottom: "© 1997" = 5ED (Fifth Edition)
     * These core sets didn't have expansion symbols but can be identified by copyright year
   - For cards from Arabian Nights (ARN), Antiquities (ATQ), Legends (LEG), The Dark (DRK), and Fallen Empires (FEM) with white borders, these are likely Chronicles (CHR) reprints

3. BORDER COLOR: The color of the frame around the card edge.
   - Black: Original printings, most modern cards
   - White: Reprints (like Chronicles, 4th-9th Edition core sets)
   - Silver: Special cards like Un-sets
   - Gold: Special promos and premium cards

4. CARD TYPE: The type line in the middle of the card.
   - Older cards (pre-6th Edition) use wordings like "Summon Legend" instead of "Legendary Creature"
   - Very old cards may have types like "Summon Wall" instead of "Creature — Wall"
   - Format examples: "Instant", "Sorcery", "Creature — Human Wizard", "Legendary Creature — Dragon"

5. RARITY: Determined by the color of the expansion symbol (middle-right of the card).
   - Common: Black/white symbol
   - Uncommon: Silver symbol
   - Rare: Gold symbol
   - Mythic Rare: Orange-red symbol
   - Note: Pre-Exodus sets (before 1998) don't have colored symbols - determine rarity from other sources
   - For cards with NO EXPANSION SYMBOL (4ED, 5ED), you cannot determine rarity from the card itself

6. MANA COST: Symbols in the top right corner. Use standard notation:
   - {W} = White, {U} = Blue, {B} = Black, {R} = Red, {G} = Green
   - {1}, {2}, etc. = Generic mana
   - Example: "{2}{W}{U}" means 2 generic, 1 white, 1 blue

7. POWER/TOUGHNESS: For creature cards only, in bottom right corner as "P/T" format (e.g., "2/2").

8. ARTIST: The artist's name at the bottom of the illustration.
`;

    const parts: Part[] = [];

    for (const example of examples) {
      const imageBase64 = await fileUtils.getImageAsBase64(example.imagePath);

      // Add the example image
      const imagePart: InlineDataPart = {
        inlineData: {
          data: imageBase64,
          mimeType: "image/jpeg",
        },
      };
      parts.push(imagePart);

      // Add the example data
      const textPart: TextPart = {
        text: `EXAMPLE CARD: ${JSON.stringify(example.exampleData, null, 2)}`,
      };
      parts.push(textPart);
    }

    // Add the instructions with card anatomy guide
    const guidePart: TextPart = {
      text: basePrompt,
    };
    parts.push(guidePart);

    return { text: basePrompt, parts };
  }

  /**
   * Identifies an MTG card from an image with retry logic
   * @param imagePath Path to the card image
   * @param retryCount Current retry attempt (used internally for recursion)
   * @param maxRetries Maximum number of retry attempts
   * @param onRetry Optional callback function called when a retry is attempted
   * @returns Identified card data or null if identification failed
   */
  async identifyCard(
    imagePath: string,
    retryCount = 0,
    maxRetries = 3,
    onRetry?: (attempt: number, maxRetries: number, delaySeconds: number) => void
  ): Promise<MTGCard | null> {
    try {
      const imageBase64 = await fileUtils.getImageAsBase64(imagePath);

      const generationConfig = {
        temperature: 1,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseSchema: this.responseSchema,
      };

      const model = this.genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        generationConfig,
      });


      const examples = await this.loadExamples();
      const { parts: promptParts } = await this.createPromptWithExamples(examples);

      const cardImagePart: InlineDataPart = {
        inlineData: {
          data: imageBase64,
          mimeType: "image/jpeg",
        },
      };

      const instructionPart: TextPart = {
        text: "Now analyze the above card following the anatomy guide and examples provided. Return ONLY the JSON data matching the schema.",
      };

      const parts: Part[] = [...promptParts, cardImagePart, instructionPart];
      const result = await model.generateContent({
        contents: [{ role: "user", parts }],
      });

      const jsonStr = result.response.text();
      const parsedData = JSON.parse(jsonStr);

      // Validate the data with Zod schema
      const validationResult = MTGCardSchema.safeParse(parsedData);

      if (validationResult.success) {
        return validationResult.data;
      }
      
      console.error("Invalid card data:", validationResult.error);
      

      if (retryCount < maxRetries) {
        const delay = 2 ** retryCount * 1000;
        const delaySeconds = delay / 1000;
        
        if (onRetry) {
          onRetry(retryCount + 1, maxRetries, delaySeconds);
        } else {
          console.log(
            `Schema validation failed. Retrying in ${delaySeconds} seconds... (Attempt ${
              retryCount + 1
            }/${maxRetries})`
          );
        }
        
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.identifyCard(imagePath, retryCount + 1, maxRetries, onRetry);
      }
      
      return null;
    } catch (error) {
      const errorMessage = String(error);
      const isRateLimitError = errorMessage.includes("429 Too Many Requests");

      if (isRateLimitError && retryCount < maxRetries) {
        const delay = 2 ** retryCount * 1000;
        const delaySeconds = delay / 1000;

        if (onRetry) {
          onRetry(retryCount + 1, maxRetries, delaySeconds);
        } else {
          console.log(
            `Rate limit hit. Retrying in ${delaySeconds} seconds... (Attempt ${
              retryCount + 1
            }/${maxRetries})`
          );
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.identifyCard(imagePath, retryCount + 1, maxRetries, onRetry);
      }

      console.error("Error identifying card:", error);
      return null;
    }
  }
}

export default GeminiService;

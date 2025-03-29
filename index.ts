import path from "node:path";
import chalk from "chalk";
import cliProgress from "cli-progress";
import Table from "cli-table3";
import GeminiService from "./src/services/gemini.ts";
import type { MTGCard } from "./src/types/card.ts";
import { fileUtils } from "./src/utils/fileUtils.ts";

const UNIDENTIFIED_DIR = path.join(process.cwd(), "Unidentified");

/**
 * Formats the identified cards as a table
 * @param cards Array of identified cards with their file names
 */
function displayCardsTable(cards: Array<{ fileName: string; card: MTGCard | null }>) {
  const identified = cards.filter((item) => item.card !== null);
  const failed = cards.filter((item) => item.card === null);

  console.log("\n===== IDENTIFICATION RESULTS =====");
  console.log(`Total cards processed: ${chalk.bold(cards.length)}`);
  console.log(`Successfully identified: ${chalk.green.bold(identified.length)}`);
  console.log(`Failed to identify: ${chalk.red.bold(failed.length)}`);

  if (identified.length === 0) {
    console.log("\nNo cards were successfully identified.");
    return;
  }

  console.log("\n===== IDENTIFIED CARDS =====");

  const table = new Table({
    head: [
      chalk.cyan.bold("Card Name"),
      chalk.cyan.bold("Set (Code)"),
      chalk.cyan.bold("Rarity"),
      chalk.cyan.bold("Border"),
      chalk.cyan.bold("Type"),
      chalk.cyan.bold("Filename"),
    ],
    colWidths: [25, 15, 12, 12, 25, 30],
    style: { compact: true },
  });

  for (const { card, fileName } of identified) {
    if (!card) continue;

    table.push([
      card.cardName || "",
      card.setCode || "",
      card.rarity || "",
      card.borderColor || "",
      card.type || "",
      fileName,
    ]);
  }

  console.log(table.toString());

  if (failed.length > 0) {
    console.log("\n===== FAILED IDENTIFICATIONS =====");
    const failedTable = new Table({
      head: [chalk.red.bold("Filename")],
      colWidths: [50],
      style: { compact: true },
    });

    for (const item of failed) {
      failedTable.push([item.fileName]);
    }

    console.log(failedTable.toString());
  }
}

/**
 * Main function to process MTG cards
 */
async function main() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error(chalk.red.bold("Error: GEMINI_API_KEY not found in .env file"));
    process.exit(1);
  }

  const geminiService = new GeminiService(apiKey);

  // Get all image files from Unidentified directory
  console.log(chalk.blue(`Scanning for unidentified cards in ${UNIDENTIFIED_DIR}...`));
  const imageFiles = await fileUtils.getImageFiles(UNIDENTIFIED_DIR);

  if (imageFiles.length === 0) {
    console.log(chalk.yellow("No unidentified card images found."));
    return;
  }

  console.log(chalk.blue(`Found ${imageFiles.length} unidentified card images.`));

  const results: Array<{ fileName: string; card: MTGCard | null }> = [];

  const progressBar = new cliProgress.SingleBar(
    {
      format: "Processing: [{bar}] {percentage}% | {value}/{total} | {filename} {status}",
      barCompleteChar: "█",
      barIncompleteChar: "░",
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic
  );

  progressBar.start(imageFiles.length, 0, { filename: "", status: "" });

  // Process each image with delay between API calls to avoid rate limits
  for (const [index, imagePath] of imageFiles.entries()) {
    const fileName = path.basename(imagePath);

    progressBar.update(index, { filename: fileName, status: "Processing..." });

    try {
      // Add a small delay between API calls to avoid rate limiting
      if (index > 0) {
        // Wait 1 second between requests to avoid hitting rate limits
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Setup retry status update callback
      const onRetry = (attempt: number, maxRetries: number, delay: number) => {
        progressBar.update(index, {
          filename: fileName,
          status: chalk.yellow(`Retrying ${attempt}/${maxRetries} (${delay}s)...`),
        });
      };

      const cardData = await geminiService.identifyCard(imagePath, 0, 3, onRetry);

      results.push({ fileName, card: cardData });

      progressBar.update(index + 1, {
        filename: fileName,
        status: cardData ? chalk.green("✅ Success") : chalk.red("❌ Failed"),
      });
    } catch (error) {
      progressBar.stop();
      console.error(chalk.red(`\nError processing ${fileName}:`), error);

      progressBar.start(imageFiles.length, index + 1, {
        filename: fileName,
        status: chalk.red("❌ Error"),
      });

      results.push({ fileName, card: null });
    }
  }

  progressBar.stop();

  displayCardsTable(results);
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});

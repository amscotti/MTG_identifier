import { readdir } from "node:fs/promises";
import path from "node:path";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"];

/**
 * Utility functions for working with files
 *
 */
export const fileUtils = {
  /**
   * Gets all image files from a directory
   * @param dirPath Path to the directory
   * @returns Array of image file paths
   */
  async getImageFiles(dirPath: string): Promise<string[]> {
    try {
      const files = await readdir(dirPath);

      const imageFiles = files.filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return IMAGE_EXTENSIONS.includes(ext);
      });

      // Return full paths
      return imageFiles.map((file) => path.join(dirPath, file));
    } catch (error) {
      console.error("Error reading directory:", error);
      return [];
    }
  },

  /**
   * Reads an image file and returns it as a base64 encoded string
   * @param imagePath Path to the image file
   * @returns Base64 encoded string of the image
   */
  async getImageAsBase64(imagePath: string): Promise<string> {
    try {
      const file = Bun.file(imagePath);
      const imageData = await file.arrayBuffer();
      return Buffer.from(imageData).toString("base64");
    } catch (error) {
      console.error("Error reading image file:", error);
      throw error;
    }
  },
};

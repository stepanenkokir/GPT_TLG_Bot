import { httpClient } from "../utils/httpClient.js";
import { createWriteStream } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import ffmpeg from "fluent-ffmpeg";
import installer from "@ffmpeg-installer/ffmpeg";
import { unlink } from "fs/promises";

export async function removeFile(path) {
  if (!path) return;
  try {
    await unlink(path);
  } catch (e) {
    // Ignore errors if file doesn't exist
    if (e.code !== "ENOENT") {
      console.log("Error while removing file:", e.message);
    }
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));

class OggConverter {
  constructor() {
    ffmpeg.setFfmpegPath(installer.path);
  }

  toMP3(input, output) {
    try {
      const outputPath = resolve(dirname(input), `${output}.mp3`);

      return new Promise((resolve, reject) => {
        ffmpeg(input)
          .inputOption("-t 30")
          .output(outputPath)
          .on("end", async () => {
            // Remove input OGG file after successful conversion
            await removeFile(input);
            resolve(outputPath);
          })
          .on("error", async (err) => {
            // Try to cleanup on error
            await removeFile(input);
            reject(err.message);
          })
          .run();
      });
    } catch (e) {
      console.log("Error in convert to mp3", e.message);
      // Ensure cleanup even on exception
      removeFile(input).catch(() => {});
      throw e;
    }
  }

  // removed toOGG as unused

  async create(url, filename) {
    try {
      const oggPath = resolve(__dirname, "../voices", `${filename}.ogg`);
      const response = await httpClient({
        method: "get",
        url,
        responseType: "stream",
      });

      return new Promise((resolve, reject) => {
        const stream = createWriteStream(oggPath);
        response.data.pipe(stream);
        stream.on("finish", () => resolve(oggPath));
        stream.on("error", reject);
      });
    } catch (e) {
      console.log("Error in create file", e.message);
      throw e;
    }
  }
}

export const ogg = new OggConverter();

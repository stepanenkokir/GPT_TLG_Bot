import { httpClient } from "../utils/httpClient.js";
import { createWriteStream } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import ffmpeg from "fluent-ffmpeg";
import installer from "@ffmpeg-installer/ffmpeg";
import { mkdir, unlink } from "fs/promises";

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
const voicesDir = resolve(__dirname, "../voices");

const buildTempAudioName = (baseName, ext) =>
  `${baseName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

class OggConverter {
  constructor() {
    ffmpeg.setFfmpegPath(installer.path);
  }

  async removeFile(path) {
    await removeFile(path);
  }

  toMP3(input, output) {
    try {
      const outputPath = resolve(dirname(input), buildTempAudioName(output, "mp3"));

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
      await mkdir(voicesDir, { recursive: true });
      const oggPath = resolve(voicesDir, buildTempAudioName(filename, "ogg"));
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

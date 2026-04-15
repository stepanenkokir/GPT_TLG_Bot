import fs from "fs/promises";

/**
 * Base class for senders (JokeSender, NewsSender).
 * User list is reloaded from file before each send operation.
 */
export class BaseSender {
  constructor(filePath) {
    this.filePath = filePath;
    this.userIds = [];
  }

  async loadUserIds() {
    try {
      const data = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) {
        console.warn(`Invalid user list format in ${this.filePath}, resetting to empty array`);
        this.userIds = [];
      } else {
        this.userIds = parsed;
        console.log(`User list loaded from ${this.filePath}:`, this.userIds.length, "users");
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        console.warn(`File ${this.filePath} not found, creating empty list`);
        this.userIds = [];
        await fs.writeFile(this.filePath, "[]", "utf-8");
      } else {
        console.error(`Error loading user list from ${this.filePath}:`, error);
        this.userIds = [];
      }
    }
  }
}


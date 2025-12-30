import fs from "fs/promises";

/**
 * Base class for senders (JokeSender, NewsSender)
 * Provides common functionality for loading and watching user lists
 */
export class BaseSender {
  constructor(filePath) {
    this.filePath = filePath;
    this.userIds = [];
    this.watcher = null;
  }

  /**
   * Load user IDs from file
   */
  async loadUserIds() {
    try {
      const data = await fs.readFile(this.filePath, "utf-8");
      this.userIds = JSON.parse(data);
      if (!Array.isArray(this.userIds)) {
        console.warn(`Invalid user list format in ${this.filePath}, resetting to empty array`);
        this.userIds = [];
      }
      console.log(`Список пользователей загружен из ${this.filePath}:`, this.userIds.length, "пользователей");
    } catch (error) {
      if (error.code === "ENOENT") {
        console.warn(`Файл ${this.filePath} не найден, создаю пустой список`);
        this.userIds = [];
        await fs.writeFile(this.filePath, "[]", "utf-8");
      } else {
        console.error(`Ошибка при загрузке списка пользователей из ${this.filePath}:`, error);
        this.userIds = [];
      }
    }
  }

  /**
   * Start watching file for changes and auto-reload user list
   * Note: File watching is optional. User list will be reloaded before each send operation.
   */
  startWatching() {
    // File watching can be implemented with chokidar or fs.watch if needed
    // For now, we rely on reloading before each operation
    console.log(`Будет отслеживаться файл ${this.filePath} (перезагрузка перед каждой отправкой)`);
  }

  /**
   * Stop watching file
   */
  stopWatching() {
    // No-op for now
    if (this.watcher) {
      this.watcher = null;
    }
  }
}


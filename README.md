# Telegram AI Bot - Дилан

Telegram бот с AI помощником на базе OpenAI GPT-4, поддерживающий текстовые и голосовые сообщения, генерацию изображений и realtime голосовое общение.

## Возможности

- 💬 Текстовый диалог с GPT-4
- 🎤 Голосовые сообщения (Whisper → GPT → TTS)
- 🎨 Генерация изображений (`gpt-image-1-mini`)
- 🔴 Realtime голосовое общение через WebRTC
- 📷 Анализ фотографий
- 🔍 Web Search для актуальной информации
- 📰 Автоматическая рассылка анекдотов и новостей

## Установка

1. Клонируйте репозиторий:
```bash
git clone <repository-url>
cd GPT_TLG_Bot
```

2. Установите зависимости:
```bash
npm install
```

3. Настройте переменные окружения:
```bash
cp .env.example .env
```

Отредактируйте `.env` файл и укажите ваши токены:
```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
OPENAI_API_KEY=your_openai_api_key_here
```

4. Запустите бота:
```bash
npm run dev
```

## Конфигурация

### Переменные окружения

Все секретные данные должны храниться в файле `.env`. Файл `.env` не коммитится в репозиторий.

**Обязательные переменные:**
- `TELEGRAM_BOT_TOKEN` - Токен Telegram бота (получить у @BotFather)
- `OPENAI_API_KEY` - API ключ OpenAI

**Опциональные переменные:**
- `OPENAI_MODEL` - Модель GPT (по умолчанию: gpt-4o-mini)
- `OPENAI_REALTIME_MODEL` - Модель для realtime (по умолчанию: gpt-4o-realtime-preview-2025-06-03)
- `WEBAPP_PORT` - Порт для веб-приложения (по умолчанию: 3000)
- `WEBAPP_BASE_URL` - Базовый URL веб-приложения (для Telegram Web App только `https://`)
- `WEBAPP_TEST_MODE` - Режим тестирования (true/false)

Полный список переменных см. в `.env.example`.

### Авторизация пользователей

Добавьте ID пользователей в файл `authorizedUsers.txt` в формате JSON массива:
```json
[1120239873, 123456789]
```

Файлы с runtime-данными (они игнорируются через `.gitignore`):
- `authorizedUsers.txt` — allowlist пользователей Telegram
- `listToSendJoke.txt` — список chat/user id для рассылки анекдотов
- `listToSendNews.txt` — список chat/user id для рассылки новостей

## Структура проекта

```
GPT_TLG_Bot/
├── config/           # Конфигурация
│   ├── default.json  # Конфиг по умолчанию
│   └── loader.js     # Загрузчик конфигурации
├── middleware/       # Middleware
│   ├── checkAuthUser.js    # Проверка авторизации
│   ├── rateLimiter.js     # Rate limiting
│   ├── sessionStore.js    # Хранилище сессий
│   └── validators.js      # Валидация данных
├── routes/           # API маршруты
│   └── api.js        # API endpoints
├── script/           # Основная логика
│   ├── baseSender.js          # Базовый класс для рассылок
│   ├── jokeSender.js          # Рассылка анекдотов
│   ├── newsSender.js          # Рассылка новостей
│   ├── openai.js              # Работа с OpenAI API
│   ├── ogg.js                 # Конвертация аудио
│   ├── telegramBot.js         # Обработчики бота
│   ├── telegramBotInstance.js # Singleton бота
│   └── telegramUtils.js       # Утилиты Telegram
├── utils/            # Утилиты
│   ├── errorHandler.js # Обработка ошибок
│   └── httpClient.js   # HTTP клиент
├── public/           # Веб-интерфейс
├── bot.js            # Инициализация бота
├── server.js          # HTTP сервер
└── index.js           # Точка входа
```

## API Endpoints

Ниже перечисленные HTTP endpoints доступны только если `REALTIME_ENABLED=true`.

### Health Check
```
GET /health
```
Возвращает статус сервиса, uptime и версию.

### Set Role (Realtime)
```
POST /api/set-role
```
Устанавливает роль для realtime сессии.

### Realtime Message
```
POST /api/realtime-message
```
Отправляет сообщение из realtime сессии в Telegram.

### Realtime SDP
```
POST /realtime/sdp
```
WebRTC SDP exchange для realtime соединения.

## Особенности реализации

### Безопасность
- Все секреты хранятся в переменных окружения
- Rate limiting для защиты от злоупотреблений
- Валидация всех входных данных

### Производительность
- Singleton для экземпляра бота
- Кэширование логгеров по chatId
- HTTP клиент с пулом соединений
- Ограничение размера истории сообщений

### Архитектура
- Базовый класс для рассылок (BaseSender)
- Централизованная обработка ошибок
- Абстракция хранилища сессий (готово для Redis)

## Разработка

### Запуск в режиме разработки
```bash
npm run dev
```

### Создание новой ветки для изменений
```bash
git checkout -b feature/your-feature-name
```

## Лицензия

ISC


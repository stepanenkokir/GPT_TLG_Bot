const micButton = document.getElementById("micButton");
const statusLabel = document.getElementById("status");
const roleSelect = document.getElementById("roleSelect");

let pc = null;
let micStream = null;
let remoteAudioEl = null;
let dataChannel = null;
let isActive = false;
let selectedRole = "default";

// Role configurations
const roleConfigs = {
  default: { voice: "echo", name: "Просто Дилан" },
  doctor: { voice: "ash", name: "Доктор наук" },
  teacher: { voice: "sage", name: "Учительница начальной школы" },
  hooligan: { voice: "alloy", name: "Умный хулиган" },
};

// iOS detection
function isIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

// Telegram Web App detection
function isRunningInTelegram() {
  return (
    typeof window !== "undefined" && window.Telegram && window.Telegram.WebApp
  );
}

// iOS Audio Session Management
class IOSAudioSessionManager {
  constructor() {
    this.audioContext = null;
    this.originalAudioSession = null;
    this.isAudioSessionActive = false;
  }

  async activateAudioSession() {
    if (!isIOS()) return;

    try {
      // Store original audio session state
      this.originalAudioSession = {
        audioContext: this.audioContext,
        isActive: this.isAudioSessionActive,
      };

      // Create new audio context for WebRTC
      const AudioContextClass = AudioContext || webkitAudioContext;
      this.audioContext = new AudioContextClass();

      // Resume audio context
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      this.isAudioSessionActive = true;
      console.log("iOS Audio Session activated for WebRTC");
    } catch (error) {
      console.warn("Failed to activate iOS Audio Session:", error);
    }
  }

  async deactivateAudioSession() {
    if (!isIOS() || !this.isAudioSessionActive) return;

    try {
      // Stop all audio tracks
      if (window.currentMicStream) {
        window.currentMicStream.getTracks().forEach((track) => {
          track.stop();
        });
        window.currentMicStream = null;
      }

      // Close audio context
      if (this.audioContext && this.audioContext.state !== "closed") {
        await this.audioContext.close();
        this.audioContext = null;
      }

      // Force iOS to release audio session
      await this.forceIOSAudioSessionRelease();

      this.isAudioSessionActive = false;
      console.log("iOS Audio Session deactivated");
    } catch (error) {
      console.warn("Failed to deactivate iOS Audio Session:", error);
    }
  }

  async forceIOSAudioSessionRelease() {
    if (!isIOS()) return;

    try {
      // Create a silent audio context to force iOS to release the previous session
      const tempAudioContext = new (AudioContext || webkitAudioContext)();

      // Create a silent buffer
      const buffer = tempAudioContext.createBuffer(1, 1, 22050);
      const source = tempAudioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(tempAudioContext.destination);

      // Play and immediately stop to release audio session
      source.start(0);
      source.stop(0);

      // Close temporary context
      await tempAudioContext.close();

      // Small delay to ensure iOS processes the release
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Additional iOS-specific cleanup
      await this.performIOSAudioCleanup();
    } catch (error) {
      console.warn("Failed to force iOS audio session release:", error);
    }
  }

  async performIOSAudioCleanup() {
    if (!isIOS()) return;

    try {
      // Force iOS to release any remaining audio resources
      const audioElements = document.querySelectorAll("audio");
      audioElements.forEach((audio) => {
        try {
          audio.pause();
          audio.src = "";
          audio.load();
        } catch (e) {
          console.warn("Failed to cleanup audio element:", e);
        }
      });

      // Force garbage collection hint for iOS
      if (window.gc) {
        try {
          window.gc();
        } catch (e) {
          // gc() might not be available
        }
      }

      // Additional delay for iOS to process cleanup
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.warn("Failed to perform iOS audio cleanup:", error);
    }
  }

  async restoreTelegramAudioSession() {
    if (!isIOS()) return;

    try {
      // Force iOS to restore default audio session
      await this.forceIOSAudioSessionRelease();

      // Notify Telegram WebApp that we're done with audio
      if (window.Telegram && window.Telegram.WebApp) {
        try {
          // Try to restore Telegram's audio session
          window.Telegram.WebApp.ready();

          // Show notification instead of forcing refresh
          this.showTelegramAudioRestoreNotification();
        } catch (error) {
          console.warn("Failed to restore Telegram audio session:", error);
        }
      }
    } catch (error) {
      console.warn("Failed to restore Telegram audio session:", error);
    }
  }

  showTelegramAudioRestoreNotification() {
    // Create notification element
    const notification = document.createElement("div");
    notification.className = "telegram-restore-notification";
    notification.innerHTML = `
      <div class="notification-content">
        <h3>🔧 Восстановление микрофона</h3>
        <p>Для полного восстановления микрофона в Telegram:</p>
        <ol>
          <li>Закройте это мини-приложение</li>
          <li>Попробуйте записать голосовое сообщение в Telegram</li>
          <li>Если не работает, перезапустите Telegram</li>
        </ol>
        <button class="notification-close">Понятно</button>
      </div>
    `;

    // Add styles
    notification.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    `;

    document.body.appendChild(notification);

    // Add close functionality
    const closeBtn = notification.querySelector(".notification-close");
    closeBtn.addEventListener("click", () => {
      notification.remove();
    });

    // Auto-close after 10 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 10000);
  }
}

// Global audio session manager
const iosAudioManager = new IOSAudioSessionManager();

// Audio session monitoring for iOS
if (isIOS()) {
  // Monitor audio session state
  setInterval(() => {
    if (iosAudioManager.isAudioSessionActive && !isActive) {
      // Audio session is active but app is not, force cleanup
      console.log("Detected orphaned audio session, cleaning up...");
      iosAudioManager.deactivateAudioSession().catch(console.warn);
    }
  }, 5000);

  // Monitor microphone availability
  navigator.mediaDevices.addEventListener("devicechange", () => {
    console.log("Audio devices changed, checking microphone availability...");
    // This can help detect when microphone becomes unavailable
  });

  // Monitor for microphone access issues
  navigator.mediaDevices.addEventListener("devicechange", async () => {
    try {
      // Check if we can still access microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      console.warn("Microphone access issue detected:", error);
      // Try to restore audio session
      await iosAudioManager.forceIOSAudioSessionRelease();
    }
  });
}

// Enhanced microphone constraints for iOS
function getMicrophoneConstraints() {
  const constraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000,
      channelCount: 1,
    },
  };

  // iOS-specific constraints
  if (isIOS()) {
    constraints.audio = {
      ...constraints.audio,
      // iOS Safari requires these specific settings
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
      autoGainControl: { ideal: true },
      // Force mono for better iOS compatibility
      channelCount: { ideal: 1, max: 1 },
      // iOS Safari works better with lower sample rates
      sampleRate: { ideal: 44100, max: 48000 },
      // iOS Safari specific audio processing
      latency: { ideal: 0.01 },
      // Ensure we get the right audio input device
      deviceId: { ideal: "default" },
    };
  }

  return constraints;
}

function setStatus(text) {
  statusLabel.textContent = text;
}

function setActiveUI(active) {
  micButton.setAttribute("aria-pressed", active ? "true" : "false");
  // Disable role selector during active session
  roleSelect.disabled = active;
}

function updateRoleSelection() {
  selectedRole = roleSelect.value;
}

function getInitData() {
  if (!isRunningInTelegram()) return "";
  return window.Telegram.WebApp.initData || "";
}

function getUrlToken() {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get("t");
  } catch (_) {
    return null;
  }
}

function setButtonState(state) {
  micButton.classList.remove("recording", "playing");
  if (state) micButton.classList.add(state);
}

// All OpenAI communication is proxied by the server; no keys on client

// iOS-specific audio session management
async function ensureIOSAudioSession() {
  if (!isIOS()) return;

  try {
    // iOS Safari requires user interaction to start audio context
    if (
      typeof AudioContext !== "undefined" ||
      typeof webkitAudioContext !== "undefined"
    ) {
      const AudioContextClass = AudioContext || webkitAudioContext;
      const audioContext = new AudioContextClass();

      // Resume audio context if suspended
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      // Create a silent buffer to unlock audio
      const buffer = audioContext.createBuffer(1, 1, 22050);
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start(0);

      // Close the context after unlocking
      setTimeout(() => {
        audioContext.close();
      }, 100);
    }
  } catch (error) {
    console.warn("iOS Audio Context setup failed:", error);
  }
}

// Enhanced microphone permission check for iOS
async function checkMicrophonePermission() {
  if (!isIOS()) return true;

  try {
    // Check if we already have permission
    const permissions = await navigator.permissions.query({
      name: "microphone",
    });

    if (permissions.state === "granted") {
      return true;
    } else if (permissions.state === "denied") {
      throw new Error("Доступ к микрофону запрещен в настройках браузера");
    } else if (permissions.state === "prompt") {
      // Will prompt user
      return true;
    }
  } catch (error) {
    console.warn("Permission check failed:", error);
    // Fallback to getUserMedia
    return true;
  }

  return true;
}

async function startRealtime() {
  if (pc) return;
  if (!isRunningInTelegram()) {
    throw new Error("Откройте мини‑приложение внутри Telegram");
  }

  try {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
  } catch (_) {}

  setStatus("Подготовка соединения...");

  // iOS-specific audio session setup
  await iosAudioManager.activateAudioSession();

  // Check microphone permissions
  await checkMicrophonePermission();

  // Send role selection to server
  const sessionToken = await sendRoleToServer();

  const EPHEMERAL_KEY = sessionToken.client_secret.value;

  setStatus("Инициализация WebRTC...");

  // iOS-specific WebRTC configuration
  const rtcConfig = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  // iOS Safari specific WebRTC settings
  if (isIOS()) {
    rtcConfig.bundlePolicy = "max-bundle";
    rtcConfig.rtcpMuxPolicy = "require";
    rtcConfig.iceCandidatePoolSize = 10;
  }

  pc = new RTCPeerConnection(rtcConfig);

  // Remote audio element with iOS-specific settings
  remoteAudioEl = document.createElement("audio");
  remoteAudioEl.autoplay = true;
  remoteAudioEl.playsInline = true;

  // iOS Safari audio settings
  if (isIOS()) {
    remoteAudioEl.preload = "auto";
    remoteAudioEl.controls = false;
    // iOS Safari requires user interaction for audio
    remoteAudioEl.muted = false;
  }

  document.body.appendChild(remoteAudioEl);

  pc.ontrack = (event) => {
    // Attach remote audio
    if (event.streams && event.streams[0]) {
      remoteAudioEl.srcObject = event.streams[0];
    } else {
      const inbound = new MediaStream([event.track]);
      remoteAudioEl.srcObject = inbound;
    }
  };

  // Create data channel to send/receive text
  dataChannel = pc.createDataChannel("oai-events");
  dataChannel.onmessage = (msg) => {
    // You can log events if needed
    //console.log("DC message:", msg.data);
    if (msg.data.includes("input_audio_buffer")) {
      setButtonState("recording");
    } else if (msg.data.includes("output_audio_buffer")) {
      setButtonState("playing");
    }

    if (msg.data.includes("stopped")) {
      setButtonState(null);
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") {
      setStatus("Соединено. Говорите...");
    } else if (
      pc.connectionState === "failed" ||
      pc.connectionState === "disconnected"
    ) {
      setStatus("Соединение разорвано");
    }
  };

  // Enhanced microphone handling for iOS
  setStatus("Запрос доступа к микрофону...");

  try {
    micStream = await navigator.mediaDevices.getUserMedia(
      getMicrophoneConstraints()
    );

    // Store globally for iOS audio session management
    window.currentMicStream = micStream;

    // iOS Safari specific audio track handling
    if (isIOS()) {
      const audioTrack = micStream.getAudioTracks()[0];
      if (audioTrack) {
        // iOS Safari specific audio track settings
        audioTrack.enabled = true;

        // Apply additional iOS-specific constraints if needed
        if (audioTrack.getCapabilities) {
          const capabilities = audioTrack.getCapabilities();
          if (capabilities.volume) {
            audioTrack
              .applyConstraints({
                volume: { ideal: 1.0 },
              })
              .catch(console.warn);
          }
        }

        // iOS Safari specific: ensure track is active
        if (audioTrack.readyState === "ended") {
          throw new Error(
            "Аудио дорожка недоступна. Попробуйте перезапустить приложение."
          );
        }
      }
    }

    for (const track of micStream.getAudioTracks()) {
      pc.addTrack(track, micStream);
    }
  } catch (error) {
    console.error("Microphone access error:", error);
    if (error.name === "NotAllowedError") {
      throw new Error(
        "Доступ к микрофону запрещен. Разрешите доступ в настройках браузера."
      );
    } else if (error.name === "NotFoundError") {
      throw new Error("Микрофон не найден. Проверьте подключение микрофона.");
    } else if (error.name === "NotReadableError") {
      throw new Error(
        "Микрофон занят другим приложением. Закройте другие приложения, использующие микрофон."
      );
    } else if (error.name === "AbortError") {
      throw new Error(
        "Запрос доступа к микрофону был прерван. Попробуйте еще раз."
      );
    } else if (error.name === "SecurityError") {
      throw new Error(
        "Ошибка безопасности при доступе к микрофону. Проверьте настройки безопасности."
      );
    } else {
      throw new Error(`Ошибка доступа к микрофону: ${error.message}`);
    }
  }

  // Create offer with audio receive
  const offerOptions = {
    offerToReceiveAudio: true,
    offerToReceiveVideo: false,
  };

  // iOS Safari specific offer options
  if (isIOS()) {
    offerOptions.voiceActivityDetection = true;
  }

  const offer = await pc.createOffer(offerOptions);
  await pc.setLocalDescription(offer);

  setStatus("Создание SDP...");
  const sdpResponse = await fetch(`/realtime/sdp`, {
    method: "POST",
    body: offer.sdp,
    headers: {
      Authorization: `Bearer ${EPHEMERAL_KEY}`,
      "Content-Type": "application/sdp",
      "x-telegram-init-data": getInitData(),
      "x-webapp-token": getUrlToken() || "",
    },
  });

  if (!sdpResponse.ok) {
    const text = await sdpResponse.text();
    throw new Error(
      `Realtime SDP exchange failed: ${sdpResponse.status} ${text}`
    );
  }

  const answer = { type: "answer", sdp: await sdpResponse.text() };
  await pc.setRemoteDescription(answer);

  setStatus("Готово. Вы в эфире.");
}

async function stopRealtime() {
  console.log("stopRealtime");
  setButtonState(null);

  try {
    if (dataChannel && dataChannel.readyState !== "closed") {
      try {
        dataChannel.close();
      } catch (_) {}
    }
    if (pc) {
      pc.getSenders().forEach((s) => {
        try {
          s.track && s.track.stop();
        } catch (_) {}
      });
      try {
        pc.close();
      } catch (_) {}
    }
    if (micStream) {
      micStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch (_) {}
      });
    }
    if (remoteAudioEl) {
      try {
        remoteAudioEl.srcObject = null;
      } catch (_) {}
      try {
        remoteAudioEl.remove();
      } catch (_) {}
    }
  } finally {
    pc = null;
    micStream = null;
    dataChannel = null;
    remoteAudioEl = null;
    setStatus("Отключено");

    // iOS-specific: Deactivate audio session and restore Telegram's audio
    if (isIOS()) {
      await iosAudioManager.deactivateAudioSession();
      // Show option to restore Telegram audio session
      setTimeout(() => {
        iosAudioManager.restoreTelegramAudioSession();
      }, 500);
    }
  }
}

async function sendRoleToServer() {
  try {
    const response = await fetch("/api/set-role", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-telegram-init-data": getInitData(),
        "x-webapp-token": getUrlToken() || "",
      },
      body: JSON.stringify({
        role: selectedRole,
        voice: roleConfigs[selectedRole].voice,
        name: roleConfigs[selectedRole].name,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to set role: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error("Error sending role to server:", error);
    // Don't throw error, continue with session start
  }
}

// Function to restart microphone on iOS if needed
async function restartMicrophoneOnIOS() {
  if (!isIOS() || !micStream) return;

  try {
    setStatus("Перезапуск микрофона...");

    // Stop current tracks
    if (micStream) {
      micStream.getTracks().forEach((track) => {
        track.stop();
      });
    }

    // Remove tracks from peer connection
    if (pc) {
      pc.getSenders().forEach((sender) => {
        if (sender.track && sender.track.kind === "audio") {
          pc.removeTrack(sender);
        }
      });
    }

    // Get new microphone stream
    micStream = await navigator.mediaDevices.getUserMedia(
      getMicrophoneConstraints()
    );

    // Add new tracks to peer connection
    for (const track of micStream.getAudioTracks()) {
      pc.addTrack(track, micStream);
    }

    setStatus("Микрофон перезапущен");
  } catch (error) {
    console.error("Failed to restart microphone:", error);
    throw new Error("Не удалось перезапустить микрофон");
  }
}

// Enhanced error handling for iOS
function handleIOSAudioError(error) {
  if (!isIOS()) return error;

  // iOS-specific error handling
  if (error.message.includes("microphone") || error.message.includes("audio")) {
    console.warn("iOS audio error detected, attempting recovery...");

    // Try to restart microphone
    restartMicrophoneOnIOS().catch((restartError) => {
      console.error("Microphone restart failed:", restartError);
      setStatus(`Ошибка микрофона: ${restartError.message}`);
    });
  }

  return error;
}

// Event listeners
roleSelect.addEventListener("change", updateRoleSelection);

micButton.addEventListener("click", async () => {
  if (isActive) {
    setActiveUI(false);
    isActive = false;
    await stopRealtime();
    return;
  }

  try {
    setActiveUI(true);
    isActive = true;
    await startRealtime();
  } catch (e) {
    console.error(e);

    // iOS-specific error handling
    const enhancedError = handleIOSAudioError(e);

    setActiveUI(false);
    isActive = false;
    setStatus(`Ошибка: ${enhancedError.message}`);
    await stopRealtime();
  }
});

// iOS-specific event listeners
if (isIOS()) {
  // Handle iOS Safari page visibility changes
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && isActive) {
      console.log("Page hidden, pausing audio");
      if (remoteAudioEl) {
        remoteAudioEl.pause();
      }
    } else if (!document.hidden && isActive) {
      console.log("Page visible, resuming audio");
      if (remoteAudioEl) {
        remoteAudioEl.play().catch(console.warn);
      }
    }
  });

  // Handle iOS Safari audio interruptions
  document.addEventListener(
    "touchstart",
    () => {
      if (isActive && remoteAudioEl) {
        // iOS Safari requires touch to resume audio
        remoteAudioEl.play().catch(console.warn);
      }
    },
    { once: true }
  );

  // Handle page unload to properly release audio session
  window.addEventListener("beforeunload", async (event) => {
    if (isActive) {
      await iosAudioManager.deactivateAudioSession();
    }
  });

  // Handle page hide to release audio session
  window.addEventListener("pagehide", async (event) => {
    if (isActive) {
      await iosAudioManager.deactivateAudioSession();
    }
  });

  // Handle iOS Safari specific events
  document.addEventListener("webkitbeginfullscreen", () => {
    console.log("iOS Safari entering fullscreen");
  });

  document.addEventListener("webkitendfullscreen", async () => {
    console.log("iOS Safari exiting fullscreen");
    if (isActive) {
      await iosAudioManager.deactivateAudioSession();
    }
  });
}

// Initialize role selection
updateRoleSelection();

// Show iOS fix button for iOS devices
if (isIOS()) {
  const iosFixDiv = document.getElementById("iosFix");
  if (iosFixDiv) {
    iosFixDiv.style.display = "block";
  }
}

// Add event listener for fix microphone button
const fixMicrophoneBtn = document.getElementById("fixMicrophoneBtn");
if (fixMicrophoneBtn) {
  fixMicrophoneBtn.addEventListener("click", async () => {
    try {
      fixMicrophoneBtn.disabled = true;
      fixMicrophoneBtn.textContent = "🔧 Восстанавливаю...";

      // Force deactivate any active audio session
      await iosAudioManager.deactivateAudioSession();

      // Force iOS to restore default audio session
      await iosAudioManager.forceIOSAudioSessionRelease();

      // Show success message
      fixMicrophoneBtn.textContent = "✅ Готово!";
      fixMicrophoneBtn.style.background =
        "linear-gradient(135deg, #28a745, #20c997)";

      // Reset button after delay
      setTimeout(() => {
        fixMicrophoneBtn.disabled = false;
        fixMicrophoneBtn.textContent = "🔧 Восстановить микрофон в Telegram";
        fixMicrophoneBtn.style.background =
          "linear-gradient(135deg, #ff4d6d, #ff6b8a)";
      }, 3000);
    } catch (error) {
      console.error("Failed to fix microphone:", error);
      fixMicrophoneBtn.textContent = "❌ Ошибка";
      fixMicrophoneBtn.style.background =
        "linear-gradient(135deg, #dc3545, #c82333)";

      setTimeout(() => {
        fixMicrophoneBtn.disabled = false;
        fixMicrophoneBtn.textContent = "🔧 Восстановить микрофон в Telegram";
        fixMicrophoneBtn.style.background =
          "linear-gradient(135deg, #ff4d6d, #ff6b8a)";
      }, 3000);
    }
  });
}

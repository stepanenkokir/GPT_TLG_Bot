const micButton = document.getElementById("micButton");
const statusLabel = document.getElementById("status");
const roleSelect = document.getElementById("roleSelect");

let pc = null;
let micStream = null;
let remoteAudioEl = null;
let dataChannel = null;
let isActive = false;
let isStopping = false;
let selectedRole = "default";
let outputTextBuffer = "";
let lastSentResponseId = null;

// Role configurations
const roleConfigs = {
  default: { voice: "echo", name: "Просто Дилан" },
  doctor: { voice: "ash", name: "Доктор наук" },
  teacher: { voice: "sage", name: "Учительница начальной школы" },
  hooligan: { voice: "alloy", name: "Умный хулиган" },
};

// iOS detection
// ensure defined only once
if (typeof window !== "undefined" && !window.__APP_IS_IOS_DEFINED__) {
  window.__APP_IS_IOS_DEFINED__ = true;
  function isIOS() {
    if (typeof navigator === "undefined") return false;
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  }
}

// Telegram Web App detection
function isRunningInTelegram() {
  return (
    typeof window !== "undefined" && window.Telegram && window.Telegram.WebApp
  );
}

// (Removed) Heavy iOS audio session management and extra constraints to simplify and reduce risk

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

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function setButtonState(state) {
  micButton.classList.remove("recording", "playing");
  if (state) micButton.classList.add(state);
}

// All OpenAI communication is proxied by the server; no keys on client

// (Removed) iOS AudioContext unlock and permission pre-check; rely on user gesture and getUserMedia

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

  // Keep setup minimal; rely on getUserMedia to request mic access

  // Send role selection to server
  const sessionToken = await sendRoleToServer();
  if (
    !sessionToken ||
    !sessionToken.client_secret ||
    !sessionToken.client_secret.value
  ) {
    throw new Error(
      "Не удалось инициализировать сессию (token). Попробуйте еще раз."
    );
  }
  const EPHEMERAL_KEY = sessionToken.client_secret.value;

  setStatus("Инициализация WebRTC...");

  // Basic ICE servers for NAT traversal
  pc = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  });

  // Remote audio element
  remoteAudioEl = document.createElement("audio");
  remoteAudioEl.autoplay = true;
  remoteAudioEl.playsInline = true;

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
      // отправить сообщение в телеграм
    }
    // Buffer streaming text; send only on final events
    try {
      const evt = JSON.parse(msg.data);
      if (!evt || typeof evt !== "object") return;

      const type = evt.type;

      if (type === "response.output_text.delta") {
        const delta = typeof evt.delta === "string" ? evt.delta : "";
        if (delta) outputTextBuffer += delta;
        return; // do not forward chunks
      }

      const sendBufferedIfAny = (responseId) => {
        const text = outputTextBuffer.trim();
        if (!text) return;
        if (responseId && lastSentResponseId === responseId) {
          outputTextBuffer = "";
          return;
        }
        fetch("/api/realtime-message", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-telegram-init-data": getInitData(),
            "x-webapp-token": getUrlToken() || "",
          },
          body: JSON.stringify({ text }),
        }).catch(() => {});
        lastSentResponseId = responseId || lastSentResponseId;
        outputTextBuffer = "";
      };

      if (type === "response.output_text.done") {
        const respId = evt.response_id || evt.response?.id || null;
        sendBufferedIfAny(respId);
        return;
      }

      if (type === "response.final") {
        const respId = evt.response_id || evt.response?.id || null;
        const finalText =
          typeof evt.text === "string" && evt.text.trim()
            ? evt.text.trim()
            : null;
        if (finalText) {
          if (!respId || lastSentResponseId !== respId) {
            fetch("/api/realtime-message", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-telegram-init-data": getInitData(),
                "x-webapp-token": getUrlToken() || "",
              },
              body: JSON.stringify({ text: finalText }),
            }).catch(() => {});
            lastSentResponseId = respId || lastSentResponseId;
          }
          outputTextBuffer = "";
        } else {
          sendBufferedIfAny(respId);
        }
      }
    } catch (_) {
      // Non-JSON control messages are ignored
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

  // Microphone
  setStatus("Запрос доступа к микрофону...");
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
  const offer = await pc.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: false,
  });
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
  if (isStopping) return;
  isStopping = true;
  console.log("stopRealtime");
  setButtonState(null);

  try {
    isActive = false;
    setActiveUI(false);
    if (dataChannel && dataChannel.readyState !== "closed") {
      try {
        dataChannel.close();
      } catch (_) {}
    }
    if (pc) {
      // Detach and stop tracks before closing pc (iOS is picky)
      try {
        pc.getSenders().forEach((sender) => {
          try {
            if (sender.track) sender.track.stop();
          } catch (_) {}
          try {
            pc.removeTrack(sender);
          } catch (_) {}
        });
      } catch (_) {}
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
        remoteAudioEl.pause && remoteAudioEl.pause();
      } catch (_) {}
      try {
        remoteAudioEl.srcObject = null;
      } catch (_) {}
      try {
        remoteAudioEl.removeAttribute &&
          remoteAudioEl.removeAttribute("srcObject");
      } catch (_) {}
      try {
        remoteAudioEl.remove();
      } catch (_) {}
    }
    // iOS sometimes keeps the AVAudioSession locked; open/close a dummy stream to release it
    if (isIOS()) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((t) => t.stop());
      } catch (_) {}
    }
  } finally {
    pc = null;
    micStream = null;
    dataChannel = null;
    remoteAudioEl = null;
    setStatus("Отключено");
    isStopping = false;
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

// (Removed) iOS-specific restart helpers to keep logic minimal

// Event listeners
roleSelect.addEventListener("change", updateRoleSelection);

micButton.addEventListener("click", async () => {
  if (isActive) {
    await stopRealtime();
    return;
  }

  try {
    setActiveUI(true);
    isActive = true;
    await startRealtime();
  } catch (e) {
    console.error(e);
    setStatus(`Ошибка: ${e.message}`);
    await stopRealtime();
  }
});

// (Removed) iOS-specific DOM event noise; rely on unified cleanup below

// Initialize role selection
updateRoleSelection();

// Ensure we release the microphone when the webview goes to background or closes
function cleanupOnHideOrClose() {
  if (isActive || pc || micStream) {
    stopRealtime();
  }
}

// Page lifecycle hooks (important for iOS)
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cleanupOnHideOrClose();
  }
});

// pagehide is more reliable on iOS/Safari than beforeunload
window.addEventListener("pagehide", () => {
  cleanupOnHideOrClose();
});

// As a last resort
window.addEventListener("beforeunload", () => {
  cleanupOnHideOrClose();
});

// Telegram-specific hooks
try {
  if (isRunningInTelegram()) {
    // Stop session when user taps back button in Telegram
    window.Telegram.WebApp.onEvent("backButtonClicked", () => {
      cleanupOnHideOrClose();
    });
  }
} catch (_) {}

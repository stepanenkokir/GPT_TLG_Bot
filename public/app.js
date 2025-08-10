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

// Role configurations
const roleConfigs = {
  default: { voice: "echo", name: "Просто Дилан" },
  doctor: { voice: "ash", name: "Доктор наук" },
  teacher: { voice: "sage", name: "Учительница начальной школы" },
  hooligan: { voice: "alloy", name: "Умный хулиган" },
};

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

function isRunningInTelegram() {
  return (
    typeof window !== "undefined" && window.Telegram && window.Telegram.WebApp
  );
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

  // Send role selection to server
  const sessionToken = await sendRoleToServer();

  const EPHEMERAL_KEY = sessionToken.client_secret.value;

  setStatus("Инициализация WebRTC...");
  pc = new RTCPeerConnection();

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
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  for (const track of micStream.getAudioTracks()) {
    pc.addTrack(track, micStream);
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
      // Try to detach and stop tracks before closing pc (iOS is picky)
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

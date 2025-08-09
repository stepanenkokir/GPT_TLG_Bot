const micButton = document.getElementById("micButton");
const statusLabel = document.getElementById("status");

let pc = null;
let micStream = null;
let remoteAudioEl = null;
let dataChannel = null;
let isActive = false;

function setStatus(text) {
  statusLabel.textContent = text;
}

function setActiveUI(active) {
  micButton.setAttribute("aria-pressed", active ? "true" : "false");
  micButton.classList.toggle("active-pulse", active);
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

async function fetchEphemeralKey() {
  const initData = getInitData();
  const token = getUrlToken();
  const headers = { "x-telegram-init-data": initData };
  if (token) headers["x-webapp-token"] = token;
  const r = await fetch("/session", { headers });
  if (!r.ok) throw new Error(`Failed to fetch session: ${r.status}`);
  return r.json();
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
  setStatus("Получение ключа...");
  const session = await fetchEphemeralKey();

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
    // console.log("DC message:", msg.data);
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
  const baseUrl = `https://api.openai.com/v1/realtime?model=${encodeURIComponent(
    session.model || "gpt-4o-realtime-preview-2025-06-03"
  )}`;
  const url = new URL(baseUrl);

  const sdpResponse = await fetch(url, {
    method: "POST",
    body: offer.sdp,
    headers: {
      Authorization: `Bearer ${session.client_secret?.value}`,
      "Content-Type": "application/sdp",
      "OpenAI-Beta": "realtime=v1",
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
  }
}

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
    setActiveUI(false);
    isActive = false;
    setStatus(`Ошибка: ${e.message}`);
    await stopRealtime();
  }
});

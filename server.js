const WebSocket = require("ws");

const wss = new WebSocket.Server({
  port: 8080,
});

const clients = new Map();

const bannedWords = [
  "nắc",
  "nac",
  "đụ",
  "du",
  "địt",
  "dit",
  "lồn",
  "lon",
  "cặc",
  "cac",
  "cu",
  "cứt",
  "cut",
  "đéo",
  "deo",
  "buồi",
  "buoi",
  "fuck",
  "fucking",
  "dick",
  "pussy",
  "cock",
  "bitch",
  "sex",
  "porn",
];

function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, "");
}

function containsBannedWord(text) {
  const normalized = normalizeText(text);

  return bannedWords.some((word) => normalized.includes(normalizeText(word)));
}

function broadcast(data) {
  const message = JSON.stringify(data);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function sendOnline() {
  broadcast({
    type: "online",
    count: wss.clients.size,
  });
}

wss.on("connection", (ws) => {
  ws.lastMessage = 0;
  ws.spam = 0;

  ws.on("message", (raw) => {
    let data;

    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (data.type === "join") {
      const username = String(data.username || "").trim();

      if (!username || username.length > 24) {
        ws.send(
          JSON.stringify({
            type: "name_error",
            message: "Tên không hợp lệ.",
          }),
        );

        return;
      }

      if (containsBannedWord(username)) {
        ws.send(
          JSON.stringify({
            type: "name_error",
            message: "Tên chứa từ không phù hợp.",
          }),
        );

        return;
      }

      const exists = [...clients.values()].some(
        (name) => name.toLowerCase() === username.toLowerCase(),
      );

      if (exists) {
        ws.send(
          JSON.stringify({
            type: "name_error",
            message: "Tên này đang được sử dụng.",
          }),
        );

        return;
      }

      clients.set(ws, username);

      broadcast({
        type: "system",
        message: `${username} đã tham gia chat 💗`,
      });

      sendOnline();

      return;
    }

    if (data.type === "message") {
      const username = clients.get(ws);

      if (!username) {
        return;
      }

      const message = String(data.message || "")
        .trim()
        .slice(0, 500);

      if (!message) {
        return;
      }

      if (containsBannedWord(message)) {
        ws.send(
          JSON.stringify({
            type: "system",
            message: "Tin nhắn bị chặn vì chứa nội dung không phù hợp.",
          }),
        );

        return;
      }

      const now = Date.now();

      if (now - ws.lastMessage < 1000) {
        ws.spam++;

        if (ws.spam >= 3) {
          ws.send(
            JSON.stringify({
              type: "system",
              message: "Bạn đang gửi tin quá nhanh.",
            }),
          );

          return;
        }
      } else {
        ws.spam = 0;
      }

      ws.lastMessage = now;

      broadcast({
        type: "message",
        username: username,
        message: message,
        time: new Date().toISOString(),
      });
    }
  });

  ws.on("close", () => {
    const username = clients.get(ws);

    clients.delete(ws);

    if (username) {
      broadcast({
        type: "system",
        message: `${username} đã rời khỏi chat 💕`,
      });
    }

    sendOnline();
  });

  sendOnline();
});

console.log("chatGAY WebSocket running on ws://localhost:8080");

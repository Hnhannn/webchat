const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;

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
    "porn"
];

function normalizeText(text) {
    return String(text)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/[^a-z0-9]/g, "");
}

function containsBannedWord(text) {
    const normalized = normalizeText(text);

    return bannedWords.some((word) =>
        normalized.includes(normalizeText(word))
    );
}

function send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
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
        count: clients.size
    });
}

const server = http.createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, {
            "Content-Type": "text/plain; charset=UTF-8"
        });

        res.end("Method Not Allowed");
        return;
    }

    if (req.url !== "/" && req.url !== "/index.html") {
        res.writeHead(404, {
            "Content-Type": "text/plain; charset=UTF-8"
        });

        res.end("Not Found");
        return;
    }

    const filePath = path.join(__dirname, "index.html");

    fs.readFile(filePath, (error, data) => {
        if (error) {
            console.error(error);

            res.writeHead(500, {
                "Content-Type": "text/plain; charset=UTF-8"
            });

            res.end("Server Error");
            return;
        }

        res.writeHead(200, {
            "Content-Type": "text/html; charset=UTF-8",
            "Cache-Control": "no-store"
        });

        if (req.method === "HEAD") {
            res.end();
            return;
        }

        res.end(data);
    });
});

const wss = new WebSocket.Server({
    server,
    path: "/"
});

wss.on("connection", (ws) => {
    ws.lastMessage = 0;
    ws.spam = 0;
    ws.clientId = null;

    send(ws, {
        type: "connected",
        message: "Đã kết nối máy chủ 💗"
    });

    ws.on("message", (raw) => {
        let data;

        try {
            data = JSON.parse(raw.toString());
        } catch {
            return;
        }

        if (!data || typeof data.type !== "string") {
            return;
        }

        if (data.type === "join") {
            if (clients.has(ws)) {
                return;
            }

            const username = String(data.username || "").trim();
            const clientId = String(data.clientId || "").trim();

            if (!clientId) {
                send(ws, {
                    type: "name_error",
                    message: "Không xác định được phiên trình duyệt."
                });

                return;
            }

            if (username.length < 2 || username.length > 24) {
                send(ws, {
                    type: "name_error",
                    message: "Tên phải từ 2 đến 24 ký tự."
                });

                return;
            }

            if (containsBannedWord(username)) {
                send(ws, {
                    type: "name_error",
                    message: "Tên chứa từ không phù hợp."
                });

                return;
            }

            const existingEntry = [...clients.entries()].find(
                ([, user]) =>
                    user.username.toLowerCase() === username.toLowerCase()
            );

            if (existingEntry) {
                const [oldWs, oldUser] = existingEntry;

                if (oldUser.clientId === clientId) {
                    clients.delete(oldWs);

                    if (
                        oldWs !== ws &&
                        oldWs.readyState === WebSocket.OPEN
                    ) {
                        oldWs.close(1000, "Reconnected");
                    }
                } else {
                    send(ws, {
                        type: "name_error",
                        message: "Tên này đang được sử dụng."
                    });

                    return;
                }
            }

            ws.clientId = clientId;

            clients.set(ws, {
                username,
                clientId
            });

            send(ws, {
                type: "join_success",
                username
            });

            broadcast({
                type: "system",
                message: `${username} đã tham gia chat 💗`
            });

            sendOnline();

            return;
        }

        if (data.type === "message") {
            const user = clients.get(ws);

            if (!user) {
                return;
            }

            const message = String(data.message || "")
                .trim()
                .slice(0, 500);

            if (!message) {
                return;
            }

            if (containsBannedWord(message)) {
                send(ws, {
                    type: "system",
                    message: "Tin nhắn bị chặn vì chứa nội dung không phù hợp."
                });

                return;
            }

            const now = Date.now();

            if (now - ws.lastMessage < 1000) {
                ws.spam++;

                if (ws.spam >= 3) {
                    send(ws, {
                        type: "system",
                        message: "Bạn đang gửi tin quá nhanh 💗"
                    });

                    return;
                }
            } else {
                ws.spam = 0;
            }

            ws.lastMessage = now;

            broadcast({
                type: "message",
                username: user.username,
                message,
                time: new Date().toISOString()
            });
        }
    });

    ws.on("close", () => {
        const user = clients.get(ws);

        if (!user) {
            return;
        }

        clients.delete(ws);

        broadcast({
            type: "system",
            message: `${user.username} đã rời khỏi chat 💕`
        });

        sendOnline();
    });

    ws.on("error", (error) => {
        console.error("WebSocket error:", error.message);
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`chatGAY running on 0.0.0.0:${PORT}`);
});

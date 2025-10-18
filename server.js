const net = require("net");
const EventLoop = require("./eventLoop");
const { parseRESP } = require("./protocol/parser");
const { encode } = require("./protocol/encoder");

const store = {};
const loop = new EventLoop();
const clients = new Map();

const server = net.createServer(socket => {
    console.log("Client connected");
    socket.setEncoding("utf8");

    clients.set(socket, { buffer: "" });

    socket.on("data", data => {
        clients.get(socket).buffer += data;
    });

    socket.on("close", () => {
        console.log("Client disconnected");
        clients.delete(socket);
    });

    loop.onReadable(socket, handleClient);
});

server.listen(8000, () => {
    console.log("Custom Redis server running on port 8000");
});

function handleClient(socket) {
    const client = clients.get(socket);
    if (!client || client.buffer.length === 0) return;

    const data = client.buffer;
    client.buffer = "";

    try {
        const [cmd, ...args] = parseRESP(Buffer.from(data));
        switch (cmd.toLowerCase()) {
            case "set":
                store[args[0]] = args[1];
                socket.write(encode("OK"));
                break;
            case "get":
                socket.write(encode(store[args[0]] ?? null));
                break;
            default:
                socket.write(encode(new Error("Unknown command")));
        }
    } catch (err) {
        socket.write(encode(err));
    }
}

loop.run();


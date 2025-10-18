const net = require("net");
const { parseRESP } = require("./protocol/parser");
const { encode } = require("./protocol/encoder");
const EventLoop = require("./eventLoop");

const store = {};
const buffers = new Map();
const loop = new EventLoop();

const server = net.createServer(socket => {
    console.log("Client connected");
    buffers.set(socket, "");

    loop.onReadable(socket, () => {
        socket.on("data", chunk => {
            let buffer = buffers.get(socket) + chunk;
            try {
                const [cmd, ...args] = parseRESP(Buffer.from(buffer));
                handleCommand(socket, cmd, args);
                buffers.set(socket, "");
            } catch {
                buffers.set(socket, buffer);
            }
        });

        socket.on("close", () => {
            buffers.delete(socket);
        });
    });
});

function handleCommand(socket, cmd, args) {
    switch (cmd.toLowerCase()) {
        case "set":
            store[args[0]] = args[1];
            socket.write(encode("OK"));
            break;
        case "get":
            socket.write(encode(store[args[0]] || null));
            break;
        default:
            socket.write(encode(new Error("Unknown command")));
    }
}

server.listen(8000, () => {
    console.log("Custom Redis server running on port 8000");
    loop.run();
});


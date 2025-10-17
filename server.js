const net = require("net");
const { parseRESP } = require("./protocol/parser");
const { encode } = require("./protocol/encoder");

const store = {};

const clients = new Set()

const server = net.createServer(socket => {
    socket.setNoDelay(true);
    socket.setEncoding("utf8");
    clients.add(socket);
    console.log("Client connected...");

    socket.on("close", () => {
        console.log("Client disconnected");
        clients.delete(socket);
    });

    socket.on("data", data => {
            
    });
});

server.listen(8000, () => {
    console.log("Custom Redis server running on port 8000");
});

function eventLoop() {
    for (const socket of clients) {
        let data;
        try {
            data = socket.read();
        } catch {
            continue;
        }
        if(!data) continue;

        try {
            const [cmd, ...reply] = parseRESP(Buffer.from(data));

            switch (cmd.toLowerCase()) {
                case "set": {
                    const key = reply[0];
                    const value = reply[1];
                    store[key] = value;
                    socket.write(encode("OK"));
                    break;
                }
                case "get": {
                    const key = reply[0];
                    const value = store[key];
                    if (value === undefined) {
                        socket.write(encode(null));
                    } else {
                        socket.write(encode(value));
                    }
                    break;
                }
                default:
                    socket.write(encode(new Error("Unknown command")));
            }
        } catch(err) {
            socket.write(encode(err));
        }
    }

    setImmediate(eventLoop)
}

setImmediate(eventLoop)


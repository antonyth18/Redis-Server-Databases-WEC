const net = require("net");
const EventLoop = require("./eventLoop");
const { parseRESP } = require("./protocol/parser");
const { encode } = require("./protocol/encoder");
const { KVStore } = require("./kvstore");

const store = new KVStore(32);
const loop = new EventLoop();
const clients = new Map();

// Create TCP server
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

// Handle each client's data
function handleClient(socket) {
    const client = clients.get(socket);
    if (!client || client.buffer.length === 0) return;

    const data = client.buffer;
    client.buffer = "";

    try {
        const [cmd, ...args] = parseRESP(Buffer.from(data));
        const command = cmd.toLowerCase();

        switch (command) {
            /* ------ BASIC COMMANDS ------ */
            case "set": {
                const key = args[0];
                const value = args[1];
                let ex = null;

                if (args.length >= 4 && args[2].toUpperCase() === "EX") {
                    ex = parseInt(args[3], 10);
                }

                store.set(key, value, ex);
                socket.write(encode("OK"));
                break;
            }

            case "get": {
                const key = args[0];
                const val = store.get(key);
                socket.write(encode(val ?? null));
                break;
            }

            case "del": {
                const key = args[0];
                const deleted = store.del(key);
                socket.write(encode(deleted));
                break;
            }

            case "exists": {
                socket.write(encode(store.exists(args[0])));
                break;
            }

            case "keys": {
                const pattern = args[0] || "*";
                const keys = store.keys(pattern);
                socket.write(encode(keys));
                break;
            }

            /* ------ MULTI-KEY COMMANDS ------ */
            case "mset": {
                if (args.length % 2 !== 0) {
                    socket.write(encode(new Error("ERR wrong number of arguments for 'mset' command")));
                    break;
                }
                const pairs = {};
                for (let i = 0; i < args.length; i += 2) {
                    pairs[args[i]] = args[i + 1];
                }
                store.mset(pairs);
                socket.write(encode("OK"));
                break;
            }

            case "mget": {
                const keys = args; 
                const result = store.mget(keys);
                socket.write(encode(result));
                break;
            }

            case "append": {
                if (args.length < 2) {
                    socket.write(encode(new Error("ERR wrong number of arguments for 'append' command")));
                    break;
                }
                const key = args[0];
                const suffix = args[1] || '';
                const newLength = store.append(key, suffix);
                socket.write(encode(newLength));
                break;
            }
            
            
            case "rename": {
                const [oldKey, newKey] = args;
                const res = store.rename(oldKey, newKey);
                socket.write(encode(res));
                break;
            }

            /* ------ NUMERIC COMMANDS ------ */
            case "incr": {
                const n = store.incr(args[0]);
                socket.write(encode(n));
                break;
            }

            case "decr": {
                const n = store.decr(args[0]);
                socket.write(encode(n));
                break;
            }

            /* ------ EXPIRY COMMANDS ------ */
            case "expire": {
                const result = store.expire(args[0], parseInt(args[1], 10));
                socket.write(encode(result));
                break;
            }

            case "ttl": {
                const result = store.ttl(args[0]);
                socket.write(encode(result));
                break;
            }

            case "persist": {
                const result = store.persist(args[0]);
                socket.write(encode(result));
                break;
            }

            /* ------ DATABASE COMMANDS ------ */
            case "flushall": {
                const res = store.flushAll();
                socket.write(encode(res));
                break;
            }

            case "dbsize": {
                socket.write(encode(store.dbsize()));
                break;
            }

            /* ------ HELP ------ */
            case "help": {
                const helpText = [
                    "Supported commands:",
                    "SET key value [EX seconds]",
                    "GET key",
                    "DEL key",
                    "EXISTS key",
                    "KEYS [pattern]",
                    "INCR key",
                    "DECR key",
                    "EXPIRE key seconds",
                    "TTL key",
                    "PERSIST key",
                    "MSET key value [key value ...]",
                    "MGET key [key ...]",
                    "RENAME oldKey newKey",
                    "FLUSHALL",
                    "DBSIZE"
                ].join("\n");
                socket.write(encode(helpText));
                break;
            }

            /* ------ DEFAULT ------ */
            default:
                socket.write(encode(new Error(`ERR unknown command '${cmd}'`)));
        }
    } catch (err) {
        socket.write(encode(new Error("ERR " + err.message)));
    }
}

loop.run();


const net = require("net");
const { parseRESP } = require("./protocol/parser");
const { encode } = require("./protocol/encoder");

const store = {};

const server = net.createServer(connection => {
    console.log("Client connected...");

    connection.on("data", data => {
        const [cmd, ...reply] = parseRESP(data);

        try {
            switch (cmd.toLowerCase()) {
                case "set": {
                    const key = reply[0];
                    const value = reply[1];
                    store[key] = value;
                    connection.write(encode("OK"));
                    break;
                }
                case "get": {
                    const key = reply[0];
                    const value = store[key];
                    if (value === undefined) {
                        connection.write(encode(null));
                    } else {
                        connection.write(encode(value));
                    }
                    break;
                }
                default:
                    connection.write(encode(new Error("Unknown command")));
            }
        } catch(err) {
            connection.write(encode(err));
        }     
    });
});

server.listen(8000, () => {
    console.log("Custom Redis server running on port 8000");
});


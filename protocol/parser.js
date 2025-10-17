
function parseRESP(buffer) {
    if (!buffer || buffer.length === 0) {
        throw new Error("Empty input");
    }

    const str = buffer.toString();
    const lines = str.split('\r\n');
    let index = 0;

    function parseNext() {
        if (index >= lines.length) {
            throw new Error("Unexpected end of input");
        }

        const line = lines[index++];
        if (!line) {
            throw new Error("Malformed RESP: empty line");
        }

        const prefix = line[0];
        const content = line.slice(1);

        switch (prefix) {
            case '+': return content; // Simple String
            case '-': return new Error(content);
            case ':': return parseInt(content, 10);

            case '$': { // Bulk String
                const len = parseInt(content, 10);
                if (isNaN(len)) throw new Error("Invalid bulk string length");
                if (len === -1) return null;
                const value = lines[index++];
                if (value === undefined) throw new Error("Incomplete bulk string");
                return value;
            }

            case '*': { // Array
                const len = parseInt(content, 10);
                if (isNaN(len)) throw new Error("Invalid array length");
                if (len === -1) return null;
                const arr = [];
                for (let i = 0; i < len; i++) arr.push(parseNext());
                return arr;
            }

            case '_': return null; // Null
            case '#': return content === 't'; // Boolean
            case ',': return parseFloat(content); // Double
            case '(': return BigInt(content); // Big number

            case '!': { // Bulk error
                const len = parseInt(content, 10);
                const msg = lines[index++];
                return new Error(msg || "Unknown bulk error");
            }

            case '=': { // Verbatim string
                const val = lines[index++];
                if (!val) throw new Error("Malformed verbatim string");
                return val.split(':')[1] || val;
            }

            case '%': { // Map
                const len = parseInt(content, 10);
                const obj = {};
                for (let i = 0; i < len; i++) {
                    const key = parseNext();
                    const value = parseNext();
                    obj[key] = value;
                }
                return obj;
            }

            case '~': { // Set
                const len = parseInt(content, 10);
                const s = new Set();
                for (let i = 0; i < len; i++) s.add(parseNext());
                return s;
            }

            case '>': { // Push
                const len = parseInt(content, 10);
                const arr = [];
                for (let i = 0; i < len; i++) arr.push(parseNext());
                return { type: 'push', data: arr };
            }

            default:
                throw new Error(`Unknown RESP type: ${prefix}`);
        }
    }

    try {
        return parseNext();
    } catch (err) {
        throw new Error("RESP Parse Error: " + err.message);
    }
}

module.exports = { parseRESP };


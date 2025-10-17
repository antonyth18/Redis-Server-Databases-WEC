
function encodeSimpleString(str) {
    return `+${str}\r\n`;
}

function encodeError(err) {
    return `-${err.message}\r\n`;
}

function encodeInteger(num) {
    return `:${num}\r\n`;
}

function encodeBulkString(str) {
    if (str === null) return `$-1\r\n`;
    return `$${Buffer.byteLength(str)}\r\n${str}\r\n`;
}

function encodeArray(arr) {
    return `*${arr.length}\r\n` + arr.map(encode).join('');
}

function encode(value) {
    if (typeof value === "string") {
        if (value === "OK" || /^[A-Z]+$/.test(value)) {
            return `+${value}\r\n`;
        }
        return `$${value.length}\r\n${value}\r\n`;
    }
    if (typeof value === 'number') return encodeInteger(value);
    if (Array.isArray(value)) return encodeArray(value);
    if (value === null) return `$-1\r\n`;
    if (value instanceof Error) return encodeError(value);
    return encodeSimpleString(String(value));
}

module.exports = { encode };

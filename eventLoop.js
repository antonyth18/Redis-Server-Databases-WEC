
class EventLoop {
    constructor() {
        this.readHandlers = new Map();
        this.writeHandlers = new Map();
        this.timers = [];
        this.running = false;
    }

    onReadable(socket, callback) {
        this.readHandlers.set(socket, callback);
    }

    onWritable(socket, callback) {
        this.writeHandlers.set(socket, callback);
    }

    setTimer(delay, callback) {
        this.timers.push({ time: Date.now() + delay, callback });
    }

    run() {
        this.running = true;
        const loop = () => {
            const now = Date.now();
            this.timers = this.timers.filter(timer => {
                if (now >= timer.time) {
                    timer.callback();
                    return false;
                }
                return true;
            });

            for (const [socket, callback] of this.readHandlers) {
                if (socket.destroyed) {
                    this.readHandlers.delete(socket);
                } else {
                    callback(socket);
                }
            }

            if (this.running) setImmediate(loop);
        };

        setImmediate(loop);
    }

    stop() {
        this.running = false;
    }
}

module.exports = EventLoop;

## Redis-like Database from scratch
This project is a high-performance, custom-built, in-memory key-value store server written from scratch in Node.js. It is designed to emulate the core functionality, non-blocking nature, and client-server interaction of Redis, focusing on fundamental concepts of concurrent I/O, custom data structures, and serialization protocols.

## Key Features & Architectural Highlights

This implementation goes beyond standard usage of Node.js libraries by building core components from the ground up:

*   Custom Event Loop (eventLoop.js): Implements a simplified, custom event-driven architecture to manage multiple client connections concurrently without blocking the main process. It explicitly handles I/O readiness for sockets and timer execution.
    
*   Custom Key-Value Engine (kvstore.js): Features an in-memory hash map implementation that uses separate chaining for collision resolution and supports automatic rehashing when the load factor exceeds 0.75, ensuring $O(1)$ average-case performance.
    
*   Time-to-Live (TTL): Supports key expiration (EXPIRE, TTL, PERSIST). Expired keys are automatically and periodically cleaned up in the background without user intervention.
    
*   Asynchronous Persistence (RDB-style): CPU-intensive data serialization and writing to dump.json is offloaded to a Node.js Worker Thread every 5 seconds. This ensures that persistence does not block the main Event Loop, maintaining the server's non-blocking performance.
    
*   Protocol Compliance: Communicates using the RESP (REdis Serialization Protocol), allowing any standard Redis client or simple TCP tool (like netcat) to interact with the server.
    

## Setup and Installation

### Prerequisites

*   Node.js (v14 or higher)
    

### Installation

1.  Clone the repository:  
    git clone https://github.com/antonyth18/Redis-Server-Databases-WEC.git/
    cd Redis-Server-Databases-WEC 
      
2.  The project relies solely on built-in Node.js modules (net, fs, worker\_threads). No external npm install is required.
    


### Running the Server

Start the custom server by running the main entry point:

node server.js  
\# Custom Redis server running on port 8000  
  
  

##  Usage

The server listens for TCP connections on localhost:8000.
 

### Protocol Interaction

While standard Redis clients handle RESP encoding automatically, if using netcat, you must manually format the command as a RESP array.

Example: SET key value

The command SET mykey hello is sent as a RESP array of three Bulk Strings:

\*3  
$3  
SET  
$5  
mykey  
$5  
hello  
  
### Output Screenshots

<img width="669" height="424" alt="Screenshot 2025-10-17 at 5 28 05 PM" src="https://github.com/user-attachments/assets/a1692600-4a1c-4e68-95d5-85307cd5ef22" />

---

<img width="525" height="90" alt="Screenshot 2025-10-18 at 5 01 59 PM" src="https://github.com/user-attachments/assets/98ebfb32-a9ae-4481-96a9-2154fed34352" />

---

<img width="2366" height="1396" alt="image" src="https://github.com/user-attachments/assets/c5960dac-d366-4765-9b16-86db0e25c92b" />

---

<img width="493" height="400" alt="Screenshot 2025-10-19 at 2 44 58 PM" src="https://github.com/user-attachments/assets/d53adb74-8143-40db-bc7f-f27b6b80990e" />

---

<img width="400" height="339" alt="Screenshot 2025-10-19 at 10 08 48 PM" src="https://github.com/user-attachments/assets/53d3563b-6652-4e48-a436-6aa1490bbf61" />


## Supported Commands

The server implements a wide range of commands across several categories:

| Category | Command Syntax | Description |
| --- | --- | --- |
| Basic | SET key value [EX seconds] | Sets a key's value, optionally with expiration. |
|  | GET key | Retrieves the value of a key. |
|  | DEL key [key...] | Deletes one or more keys. |
|  | EXISTS key | Checks if a key exists (returns 1 or 0). |
|  | KEYS * | Returns all keys (only * pattern supported). |
| Numeric | INCR key | Increments the integer value of a key by 1. |
|  | DECR key | Decrements the integer value of a key by 1. |
| Expiry | EXPIRE key seconds | Sets the time-to-live for a key in seconds. |
|  | TTL key | Gets the remaining time-to-live of a key in seconds. |
|  | PERSIST key | Removes the expiration time from a key. |
| Multi-Key | MSET key1 v1 key2 v2... | Sets multiple key-value pairs at once. |
|  | MGET key1 key2... | Gets the values of multiple keys. |
|  | APPEND key suffix | Appends a value to an existing key (creates if not exists). |
|  | RENAME oldKey newKey | Renames a key. |
| Server | FLUSHALL | Deletes all keys in the database. |
|  | DBSIZE | Returns the total number of keys in the database. |
|  | HELP | Prints a list of all supported commands. |

## Project Architecture Overview

| File | Role | Description |
| --- | --- | --- |
| server.js | Entry Point & Network | Initializes the server, handles TCP socket connections (net), manages client buffers, delegates I/O to the custom EventLoop, and executes commands via the KVStore. |
| eventLoop.js | Concurrency Management | Contains the custom, non-blocking event loop logic. It uses setImmediate(loop) to run a continuous cycle, processing queued I/O handlers (onReadable) and scheduled timers (setTimer). |
| kvstore.js | Data Engine & Persistence | Implements the core hash map (KVStore), including custom hashing, collision handling, and rehashing logic. Manages TTL timestamps, runs periodic cleanup, and triggers asynchronous persistence via Worker Threads. |
| parser.js | Protocol Decoding | (Assumed/Required for functionality) Logic to parse the raw byte stream from the socket, transforming the RESP format into executable command arrays (['SET', 'key', 'value']). |
| encoder.js | Protocol Encoding | (Assumed/Required for functionality) Logic to format responses (strings, numbers, arrays, or errors) into the correct RESP byte format for transmission back to the client. |
| dump.json | Persistence File | The file where the entire in-memory dataset is asynchronously saved for durability. |

## Key Takeaways

This project served as a comprehensive exercise in building highly concurrent and performant systems by focusing on the underlying mechanisms:

Concurrency without Threads: The custom implementation of the event loop demonstrates how non-blocking I/O can manage numerous client connections using a single thread, mirroring Node.js's core philosophy.

Data Structure Performance: Building a custom hash map with automatic rehashing highlights the importance of load factor management and collision resolution (separate chaining) for maintaining $O(1)$ average-case performance under dynamic load.

Decoupling I/O: The use of a Worker Thread for persistence successfully decouples the CPU-bound disk write operation from the main application logic, ensuring that the server remains responsive to client requests at all times.

Protocol Implementation: Implementing the RESP parser and encoder provides deep insight into how serialization protocols define client-server communication in high-speed, networked applications.

## Conclusion

This project is a fully functional, custom-built key-value store that satisfies all requirements from Phase 1 (Foundations) through Phase 5 (Persistence). It is a robust demonstration of advanced Node.js and system programming concepts, offering a solid foundation for further exploration into distributed systems and in-memory caching.

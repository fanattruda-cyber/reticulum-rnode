// webflasher/js/rnode.js — RNode KISS protocol over Web Serial.
//
// Provides the RNode class that wraps a Web Serial port and exposes
// async methods for every RNode command the firmware supports.

// KISS framing constants
const FEND  = 0xC0;
const FESC  = 0xDB;
const TFEND = 0xDC;
const TFESC = 0xDD;

// RNode command bytes
const CMD_DATA        = 0x00;
const CMD_FREQUENCY   = 0x01;
const CMD_BANDWIDTH   = 0x02;
const CMD_TXPOWER     = 0x03;
const CMD_SF          = 0x04;
const CMD_CR          = 0x05;
const CMD_RADIO_STATE = 0x06;
const CMD_RADIO_LOCK  = 0x07;
const CMD_DETECT      = 0x08;
const CMD_IMPLICIT    = 0x09;
const CMD_LEAVE       = 0x0A;
const CMD_READY       = 0x0F;

const CMD_STAT_RX     = 0x21;
const CMD_STAT_TX     = 0x22;
const CMD_STAT_RSSI   = 0x23;
const CMD_STAT_SNR    = 0x24;
const CMD_STAT_BAT    = 0x27;

const CMD_BLINK       = 0x30;
const CMD_RANDOM      = 0x40;
const CMD_BOARD       = 0x47;
const CMD_PLATFORM    = 0x48;
const CMD_MCU         = 0x49;
const CMD_FW_VERSION  = 0x50;
const CMD_ROM_READ    = 0x51;
const CMD_ROM_WRITE   = 0x52;
const CMD_CONF_SAVE   = 0x53;
const CMD_CONF_DELETE = 0x54;
const CMD_RESET       = 0x55;
const CMD_DEV_HASH    = 0x56;
const CMD_DEV_SIG     = 0x57;
const CMD_FW_HASH     = 0x58;
const CMD_UNLOCK_ROM  = 0x59;
const CMD_HASHES      = 0x60;
const CMD_FW_UPD      = 0x61;
const CMD_CFG_READ    = 0x6D;
const CMD_BLE_PIN     = 0x70;
const CMD_BLE_NAME    = 0x71;
const CMD_ERROR       = 0x90;

// Detect handshake
const DETECT_REQ  = 0x73;
const DETECT_RESP = 0x46;

// Platform/MCU
const PLATFORM_NRF52 = 0x70;
const MCU_NRF52      = 0x71;

// EEPROM address map (standard RNode layout)
const ADDR_PRODUCT   = 0x00;
const ADDR_MODEL     = 0x01;
const ADDR_HW_REV    = 0x02;
const ADDR_SERIAL    = 0x03;
const ADDR_MADE      = 0x07;
const ADDR_CHKSUM    = 0x0B;
const ADDR_SIGNATURE = 0x1B;
const ADDR_INFO_LOCK = 0x9B;
const ADDR_CONF_SF   = 0x9C;
const ADDR_CONF_CR   = 0x9D;
const ADDR_CONF_TXP  = 0x9E;
const ADDR_CONF_BW   = 0x9F;
const ADDR_CONF_FREQ = 0xA3;
const ADDR_CONF_OK   = 0xA7;
const ADDR_FW_HASH   = 0xB0;

const INFO_LOCK_BYTE = 0x73;
const CONF_OK_BYTE   = 0x73;

// Board definitions for our supported boards
const BOARDS = {
    0x52: { name: "Faketec",         product: 0x18, model: 0x18 },
    0x51: { name: "RAK4631",         product: 0x10, model: 0x12 },
    0x53: { name: "XIAO nRF52840",   product: 0x19, model: 0x19 },
    0x54: { name: "Heltec T114",     product: 0x20, model: 0x20 },
    0x55: { name: "RAK3401 1W",      product: 0x21, model: 0x21 },
    0x44: { name: "T-Echo",          product: 0x15, model: 0x17 },
};

// ---- KISS framing helpers ----------------------------------------

function kissEscape(data) {
    const out = [];
    for (const b of data) {
        if (b === FEND) {
            out.push(FESC, TFEND);
        } else if (b === FESC) {
            out.push(FESC, TFESC);
        } else {
            out.push(b);
        }
    }
    return new Uint8Array(out);
}

function kissUnescape(data) {
    const out = [];
    let escape = false;
    for (const b of data) {
        if (escape) {
            escape = false;
            if (b === TFEND) out.push(FEND);
            else if (b === TFESC) out.push(FESC);
            else out.push(b);
        } else if (b === FESC) {
            escape = true;
        } else {
            out.push(b);
        }
    }
    return new Uint8Array(out);
}

function buildKissFrame(cmd, data) {
    const escaped = kissEscape(data);
    const frame = new Uint8Array(escaped.length + 3);
    frame[0] = FEND;
    frame[1] = cmd;
    frame.set(escaped, 2);
    frame[frame.length - 1] = FEND;
    return frame;
}

function uint32ToBytes(val) {
    return new Uint8Array([
        (val >> 24) & 0xFF,
        (val >> 16) & 0xFF,
        (val >>  8) & 0xFF,
        (val >>  0) & 0xFF,
    ]);
}

function bytesToUint32(bytes, offset = 0) {
    return ((bytes[offset] << 24) | (bytes[offset+1] << 16) |
            (bytes[offset+2] << 8) | bytes[offset+3]) >>> 0;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---- RNode class -------------------------------------------------

class RNode {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this._readLoopRunning = false;
        this._commandCallbacks = new Map();
        this._onLog = null;
        // Serializes every device interaction. The RNode KISS protocol
        // correlates responses purely by command byte, so two operations
        // in flight at once (e.g. an auto read-back racing a button click)
        // can steal each other's responses — the classic cause of the
        // "had to click twice / freq=0 / random timeouts" UX. The lock
        // guarantees one command fully completes (or times out) before the
        // next byte goes on the wire.
        this._lock = Promise.resolve();
    }

    // Run `fn` with exclusive access to the serial link. Returns fn's result.
    // The chain never breaks on rejection: a failed/timed-out command still
    // releases the lock so the queue keeps flowing.
    _withLock(fn) {
        const run = this._lock.then(fn, fn);
        this._lock = run.then(() => {}, () => {});
        return run;
    }

    // Connect to a Web Serial port
    async connect(port) {
        this.port = port;
        await this.port.open({ baudRate: 115200 });
        this.writer = this.port.writable.getWriter();
        this._startReadLoop();
    }

    async disconnect() {
        this._readLoopRunning = false;
        if (this.reader) {
            try { await this.reader.cancel(); } catch {}
            this.reader.releaseLock();
            this.reader = null;
        }
        if (this.writer) {
            this.writer.releaseLock();
            this.writer = null;
        }
        if (this.port) {
            try { await this.port.close(); } catch {}
            this.port = null;
        }
    }

    _log(msg) {
        if (this._onLog) this._onLog(msg);
    }

    // Write a raw KISS frame to the wire. NOT serialized — callers that
    // need exclusivity must already hold the lock (see _send/_sendAndWait).
    async _writeFrame(cmd, data = new Uint8Array(0)) {
        const frame = buildKissFrame(cmd, data);
        await this.writer.write(frame);
    }

    // Fire-and-forget command (no response expected). Serialized so it can't
    // interleave between another command's request and its response.
    async _send(cmd, data = new Uint8Array(0)) {
        return this._withLock(() => this._writeFrame(cmd, data));
    }

    // Send a command and wait for a specific response command. Serialized
    // end-to-end: the lock is held until the response arrives or we time out,
    // so no other command can be matched against this one's response byte.
    _sendAndWait(cmd, data = new Uint8Array(0), responseCmd = cmd, timeoutMs = 3000) {
        return this._withLock(() => new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this._commandCallbacks.delete(responseCmd);
                reject(new Error(`Timeout waiting for response to cmd 0x${cmd.toString(16)}`));
            }, timeoutMs);

            this._commandCallbacks.set(responseCmd, (responseData) => {
                clearTimeout(timer);
                this._commandCallbacks.delete(responseCmd);
                resolve(responseData);
            });

            this._writeFrame(cmd, data).catch((err) => {
                clearTimeout(timer);
                this._commandCallbacks.delete(responseCmd);
                reject(err);
            });
        }));
    }

    // Background read loop that parses KISS frames
    _startReadLoop() {
        this._readLoopRunning = true;
        const self = this;
        let frameBuf = [];
        let inFrame = false;
        let escape = false;

        (async function readLoop() {
            self.reader = self.port.readable.getReader();
            try {
                while (self._readLoopRunning) {
                    const { value, done } = await self.reader.read();
                    if (done) break;
                    for (const byte of value) {
                        if (byte === FEND) {
                            if (inFrame && frameBuf.length > 0) {
                                const cmd = frameBuf[0];
                                const payload = new Uint8Array(frameBuf.slice(1));
                                const cb = self._commandCallbacks.get(cmd);
                                if (cb) cb(payload);
                            }
                            inFrame = true;
                            frameBuf = [];
                            escape = false;
                            continue;
                        }
                        if (!inFrame) continue;
                        if (escape) {
                            escape = false;
                            if (byte === TFEND) frameBuf.push(FEND);
                            else if (byte === TFESC) frameBuf.push(FESC);
                            else frameBuf.push(byte);
                        } else if (byte === FESC) {
                            escape = true;
                        } else {
                            frameBuf.push(byte);
                        }
                    }
                }
            } catch (e) {
                if (self._readLoopRunning) {
                    self._log("Read loop error: " + e.message);
                }
            } finally {
                self.reader.releaseLock();
                self.reader = null;
            }
        })();
    }

    // ---- RNode commands -------------------------------------------

    async detect() {
        const resp = await this._sendAndWait(CMD_DETECT, new Uint8Array([DETECT_REQ]));
        return resp.length >= 1 && resp[0] === DETECT_RESP;
    }

    async getFirmwareVersion() {
        const resp = await this._sendAndWait(CMD_FW_VERSION, new Uint8Array([0x00]));
        if (resp.length >= 2) {
            return { major: resp[0], minor: resp[1] };
        }
        return null;
    }

    async getPlatform() {
        const resp = await this._sendAndWait(CMD_PLATFORM, new Uint8Array([0x00]));
        return resp.length >= 1 ? resp[0] : null;
    }

    async getMCU() {
        const resp = await this._sendAndWait(CMD_MCU, new Uint8Array([0x00]));
        return resp.length >= 1 ? resp[0] : null;
    }

    async getBoard() {
        const resp = await this._sendAndWait(CMD_BOARD, new Uint8Array([0x00]));
        return resp.length >= 1 ? resp[0] : null;
    }

    async getBattery() {
        const resp = await this._sendAndWait(CMD_STAT_BAT);
        return resp.length >= 1 ? resp[0] : null;
    }

    async getRandom() {
        const resp = await this._sendAndWait(CMD_RANDOM);
        return resp.length >= 1 ? resp[0] : null;
    }

    async blink(count = 3) {
        await this._send(CMD_BLINK, new Uint8Array([count]));
    }

    // ---- Radio config commands ------------------------------------

    async setFrequency(hz) {
        const resp = await this._sendAndWait(CMD_FREQUENCY, uint32ToBytes(hz));
        return resp.length >= 4 ? bytesToUint32(resp) : null;
    }

    async getFrequency() {
        const resp = await this._sendAndWait(CMD_FREQUENCY, new Uint8Array([0x00]));
        return resp.length >= 4 ? bytesToUint32(resp) : null;
    }

    async setBandwidth(hz) {
        const resp = await this._sendAndWait(CMD_BANDWIDTH, uint32ToBytes(hz));
        return resp.length >= 4 ? bytesToUint32(resp) : null;
    }

    async getBandwidth() {
        const resp = await this._sendAndWait(CMD_BANDWIDTH, new Uint8Array([0x00]));
        return resp.length >= 4 ? bytesToUint32(resp) : null;
    }

    async setTxPower(dbm) {
        const resp = await this._sendAndWait(CMD_TXPOWER, new Uint8Array([dbm & 0xFF]));
        return resp.length >= 1 ? resp[0] : null;
    }

    async getTxPower() {
        const resp = await this._sendAndWait(CMD_TXPOWER, new Uint8Array([0xFF]));
        return resp.length >= 1 ? resp[0] : null;
    }

    // Read the advertised BLE device name ("RNode XXXX"). Returns null on
    // older firmware that doesn't implement CMD_BLE_NAME (short timeout so
    // the connect flow doesn't stall), or on a BLE-less build (empty reply).
    async getBleName() {
        try {
            const resp = await this._sendAndWait(CMD_BLE_NAME, new Uint8Array([0x00]), CMD_BLE_NAME, 1500);
            if (!resp || resp.length === 0) return null;
            return new TextDecoder().decode(resp);
        } catch (e) {
            return null;
        }
    }

    // Read the current BLE pairing PIN (returns 6-char ASCII string).
    async getBlePin() {
        const resp = await this._sendAndWait(CMD_BLE_PIN, new Uint8Array([0x00]));
        if (resp.length !== 6) return null;
        return new TextDecoder().decode(resp);
    }

    // Store a new BLE pairing PIN (6 ASCII digits). Takes effect after reboot.
    async setBlePin(pin) {
        if (!/^\d{6}$/.test(pin)) throw new Error("PIN must be exactly 6 digits");
        const bytes = new TextEncoder().encode(pin);
        const resp = await this._sendAndWait(CMD_BLE_PIN, bytes);
        if (resp.length !== 6) return null;
        return new TextDecoder().decode(resp);
    }

    async setSpreadingFactor(sf) {
        const resp = await this._sendAndWait(CMD_SF, new Uint8Array([sf]));
        return resp.length >= 1 ? resp[0] : null;
    }

    async getSpreadingFactor() {
        const resp = await this._sendAndWait(CMD_SF, new Uint8Array([0xFF]));
        return resp.length >= 1 ? resp[0] : null;
    }

    async setCodingRate(cr) {
        const resp = await this._sendAndWait(CMD_CR, new Uint8Array([cr]));
        return resp.length >= 1 ? resp[0] : null;
    }

    async getCodingRate() {
        const resp = await this._sendAndWait(CMD_CR, new Uint8Array([0xFF]));
        return resp.length >= 1 ? resp[0] : null;
    }

    async setRadioState(on) {
        const resp = await this._sendAndWait(CMD_RADIO_STATE, new Uint8Array([on ? 0x01 : 0x00]));
        return resp.length >= 1 ? resp[0] === 0x01 : false;
    }

    async getRadioState() {
        const resp = await this._sendAndWait(CMD_RADIO_STATE, new Uint8Array([0xFF]));
        return resp.length >= 1 ? resp[0] === 0x01 : false;
    }

    async saveConfig() {
        await this._send(CMD_CONF_SAVE);
    }

    async deleteConfig() {
        await this._send(CMD_CONF_DELETE);
    }

    // ---- ROM / EEPROM commands ------------------------------------

    async unlockRom() {
        // Hold the lock across the write AND the settle delay so a following
        // read can't fire while the firmware is still processing.
        await this._withLock(async () => {
            await this._writeFrame(CMD_UNLOCK_ROM, new Uint8Array([0xF8]));
            await sleep(100);
        });
    }

    async romRead(addr, length) {
        const req = new Uint8Array([(addr >> 8) & 0xFF, addr & 0xFF, length & 0xFF]);
        // Retry once: right after an identity write the firmware can still be
        // committing EEPROM to flash and briefly miss a request, which used to
        // surface as "Timeout waiting for response to cmd 0x51".
        try {
            return await this._sendAndWait(CMD_ROM_READ, req);
        } catch (e) {
            await sleep(250);
            return await this._sendAndWait(CMD_ROM_READ, req);
        }
    }

    async romWrite(addr, data) {
        const payload = new Uint8Array(2 + data.length);
        payload[0] = (addr >> 8) & 0xFF;
        payload[1] = addr & 0xFF;
        payload.set(data, 2);
        // CMD_ROM_WRITE returns no response, so we pace with a settle delay.
        // Held inside the lock so the firmware's EEPROM flash-commit finishes
        // before the next command — current firmware commits the whole EEPROM
        // on every write, which briefly stalls its serial RX.
        await this._withLock(async () => {
            await this._writeFrame(CMD_ROM_WRITE, payload);
            await sleep(120);
        });
    }

    async getDevHash() {
        return await this._sendAndWait(CMD_DEV_HASH);
    }

    async getDevSig() {
        return await this._sendAndWait(CMD_DEV_SIG);
    }

    async getFwHash() {
        return await this._sendAndWait(CMD_FW_HASH);
    }

    async getHashes() {
        return await this._sendAndWait(CMD_HASHES);
    }

    // ---- Provisioning helpers ------------------------------------

    // Read the full device identity from EEPROM
    async readIdentity() {
        const product = await this.romRead(ADDR_PRODUCT, 1);
        const model   = await this.romRead(ADDR_MODEL, 1);
        const hwRev   = await this.romRead(ADDR_HW_REV, 1);
        const serial  = await this.romRead(ADDR_SERIAL, 4);
        const made    = await this.romRead(ADDR_MADE, 4);
        const chksum  = await this.romRead(ADDR_CHKSUM, 16);
        const lock    = await this.romRead(ADDR_INFO_LOCK, 1);

        return {
            product:  product[0],
            model:    model[0],
            hwRev:    hwRev[0],
            serial:   bytesToUint32(serial),
            made:     bytesToUint32(made),
            checksum: Array.from(chksum).map(b => b.toString(16).padStart(2, '0')).join(''),
            locked:   lock[0] === INFO_LOCK_BYTE,
        };
    }

    // Write device identity to EEPROM and compute MD5 checksum.
    // Requires CryptoJS to be loaded for MD5.
    async writeIdentity(product, model, hwRev, serial, made) {
        await this.unlockRom();

        await this.romWrite(ADDR_PRODUCT, new Uint8Array([product]));
        await this.romWrite(ADDR_MODEL,   new Uint8Array([model]));
        await this.romWrite(ADDR_HW_REV,  new Uint8Array([hwRev]));
        await this.romWrite(ADDR_SERIAL,  uint32ToBytes(serial));
        await this.romWrite(ADDR_MADE,    uint32ToBytes(made));

        // Compute MD5 checksum over identity fields
        const identityBytes = new Uint8Array(11);
        identityBytes[0] = product;
        identityBytes[1] = model;
        identityBytes[2] = hwRev;
        identityBytes.set(uint32ToBytes(serial), 3);
        identityBytes.set(uint32ToBytes(made), 7);

        const wordArray = CryptoJS.lib.WordArray.create(identityBytes);
        const md5 = CryptoJS.MD5(wordArray);
        const md5Bytes = new Uint8Array(16);
        for (let i = 0; i < 4; i++) {
            const word = md5.words[i];
            md5Bytes[i*4]     = (word >> 24) & 0xFF;
            md5Bytes[i*4 + 1] = (word >> 16) & 0xFF;
            md5Bytes[i*4 + 2] = (word >>  8) & 0xFF;
            md5Bytes[i*4 + 3] = (word >>  0) & 0xFF;
        }
        await this.romWrite(ADDR_CHKSUM, md5Bytes);

        // Set info lock
        await this.romWrite(ADDR_INFO_LOCK, new Uint8Array([INFO_LOCK_BYTE]));

        // Let the final EEPROM flash-commit settle before the caller reads
        // identity back, so the read-back doesn't race the commit.
        await sleep(300);

        this._log("Identity provisioned and locked");
    }

    // Write firmware hash to EEPROM
    async setFirmwareHash(hashBytes) {
        await this.unlockRom();
        await this.romWrite(ADDR_FW_HASH, hashBytes);
        this._log("Firmware hash written");
    }

    // ---- Device reset --------------------------------------------

    async reset() {
        await this._send(CMD_RESET, new Uint8Array([0xF8]));
    }

    async leave() {
        await this._send(CMD_LEAVE);
    }
}

// src/Eeprom.cpp — EEPROM emulation backed by LittleFS InternalFS.

#include "Eeprom.h"
#include <Arduino.h>
#include <InternalFileSystem.h>

using namespace Adafruit_LittleFS_Namespace;

namespace rlr { namespace eeprom {

static const char* EEPROM_FILE = "/eeprom.dat";
static uint8_t s_buf[EEPROM_SIZE];
static bool s_initialized = false;

// Deferred-commit state. Committing writes the whole 4 KB buffer to LittleFS
// and blocks the main loop (and therefore serial RX) for tens of ms. A single
// identity provisioning does ~8 byte/field writes back-to-back, which used to
// mean ~8 full flash commits in a row — long enough to starve the KISS RX
// handler and make the host see dropped/late responses ("hit the button twice,
// freq=0, cmd 0x51 timeout"). Instead we mark the buffer dirty and commit once
// the writes settle (or after a hard cap), batching the burst into one commit.
static bool     s_dirty = false;
static uint32_t s_last_write_ms = 0;   // for the settle (debounce) window
static uint32_t s_first_dirty_ms = 0;  // for the max-defer safety cap

// Commit once writes have been quiet this long (ms). Larger than the host's
// inter-write spacing so a provisioning burst coalesces into a single commit.
static const uint32_t COMMIT_DEBOUNCE_MS = 250;
// ...but never hold a dirty buffer longer than this, to bound data loss if the
// host keeps writing or power is pulled.
static const uint32_t COMMIT_MAX_DEFER_MS = 1500;

static void mark_dirty() {
    uint32_t now = millis();
    if (!s_dirty) { s_dirty = true; s_first_dirty_ms = now; }
    s_last_write_ms = now;
}

bool init() {
    // Read existing file or create with 0xFF fill
    File f(InternalFS);
    if (f.open(EEPROM_FILE, FILE_O_READ)) {
        size_t n = f.read(s_buf, EEPROM_SIZE);
        f.close();
        // If file is shorter than EEPROM_SIZE, fill remainder with 0xFF
        if (n < EEPROM_SIZE) {
            memset(s_buf + n, 0xFF, EEPROM_SIZE - n);
        }
        Serial.print("EEPROM: loaded ");
        Serial.print(n);
        Serial.println(" bytes from flash");
    } else {
        // First boot — create blank EEPROM
        memset(s_buf, 0xFF, EEPROM_SIZE);
        commit();
        Serial.println("EEPROM: created new blank EEPROM file");
    }
    s_initialized = true;
    return true;
}

size_t read(uint16_t addr, uint8_t* buf, size_t len) {
    if (addr >= EEPROM_SIZE) return 0;
    if (addr + len > EEPROM_SIZE) len = EEPROM_SIZE - addr;
    memcpy(buf, s_buf + addr, len);
    return len;
}

size_t write(uint16_t addr, const uint8_t* buf, size_t len) {
    if (addr >= EEPROM_SIZE) return 0;
    if (addr + len > EEPROM_SIZE) len = EEPROM_SIZE - addr;
    memcpy(s_buf + addr, buf, len);
    mark_dirty();   // deferred — flushed by tick()/flush(), not inline
    return len;
}

uint8_t read_byte(uint16_t addr) {
    if (addr >= EEPROM_SIZE) return 0xFF;
    return s_buf[addr];
}

void write_byte(uint16_t addr, uint8_t val) {
    if (addr >= EEPROM_SIZE) return;
    s_buf[addr] = val;
    mark_dirty();   // deferred — flushed by tick()/flush(), not inline
}

void commit() {
    File f(InternalFS);
    if (f.open(EEPROM_FILE, FILE_O_WRITE)) {
        f.seek(0);
        f.write(s_buf, EEPROM_SIZE);
        f.close();
    } else {
        Serial.println("EEPROM: failed to write backing file");
    }
    s_dirty = false;
}

void tick() {
    if (!s_dirty) return;
    uint32_t now = millis();
    if ((now - s_last_write_ms) >= COMMIT_DEBOUNCE_MS ||
        (now - s_first_dirty_ms) >= COMMIT_MAX_DEFER_MS) {
        commit();
    }
}

void flush() {
    if (s_dirty) commit();
}

}} // namespace rlr::eeprom

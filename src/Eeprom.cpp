// src/Eeprom.cpp — EEPROM emulation backed by LittleFS InternalFS.

#include "Eeprom.h"
#include <Arduino.h>
#include <InternalFileSystem.h>
#include "Md5.h"

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

static void auto_provision() {
    s_buf[0x00] = 0x18;  // product (Faketec)
    s_buf[0x01] = 0x18;  // model
    s_buf[0x02] = 0x01;  // hw_rev
    
    uint32_t device_id = NRF_FICR->DEVICEID[0];
    s_buf[0x03] = (device_id >> 24) & 0xFF;
    s_buf[0x04] = (device_id >> 16) & 0xFF;
    s_buf[0x05] = (device_id >>  8) & 0xFF;
    s_buf[0x06] = (device_id >>  0) & 0xFF;
    
    uint32_t made = millis();
    s_buf[0x07] = (made >> 24) & 0xFF;
    s_buf[0x08] = (made >> 16) & 0xFF;
    s_buf[0x09] = (made >>  8) & 0xFF;
    s_buf[0x0A] = (made >>  0) & 0xFF;
    
    MD5 md5;
    md5.update(s_buf, 11);
    md5.finalize();
    md5.getBytes(s_buf + 0x0B);
    
    // Blank signature (128 bytes of 0x00) — convention for self-provisioned devices
    memset(s_buf + 0x1B, 0x00, 128);

    s_buf[0x9B] = 0x73;  // INFO_LOCK
    
    commit();
    Serial.print("EEPROM: auto-provisioned, serial=0x");
    Serial.println(device_id, HEX);
}


bool init() {
    File f(InternalFS);
    if (f.open(EEPROM_FILE, FILE_O_READ)) {
        size_t n = f.read(s_buf, EEPROM_SIZE);
        f.close();
        
        if (n < EEPROM_SIZE) {
            memset(s_buf + n, 0xFF, EEPROM_SIZE - n);
        }
        
        // Check if EEPROM is blank (identity fields all 0xFF)
        bool blank = true;
        for (size_t i = 0; i < 11; i++) {  // product + model + hw_rev + serial + made
            if (s_buf[i] != 0xFF) { blank = false; break; }
        }
        
        if (blank) {
            Serial.println("EEPROM: blank, auto-provisioning...");
            auto_provision();
        } else {
            Serial.print("EEPROM: loaded ");
            Serial.print(n);
            Serial.println(" bytes from flash");
        }
    } else {
        // First boot — create blank EEPROM and auto-provision
        memset(s_buf, 0xFF, EEPROM_SIZE);
        Serial.println("EEPROM: first boot, auto-provisioning...");
        auto_provision();
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

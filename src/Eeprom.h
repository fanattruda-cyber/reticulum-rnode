#pragma once
// src/Eeprom.h — EEPROM emulation backed by LittleFS InternalFS.
//
// Provides a contiguous 4 KB virtual EEPROM that rnodeconf can read/write
// via CMD_ROM_READ / CMD_ROM_WRITE. The backing file is
// /eeprom.dat on InternalFS. Writes update the in-memory buffer immediately
// and are flushed to flash by tick()/flush() (deferred + batched) so a burst
// of provisioning writes doesn't stall serial RX with back-to-back commits.

#include <stdint.h>
#include <stddef.h>

namespace rlr { namespace eeprom {

constexpr size_t EEPROM_SIZE = 4096;

// Mount InternalFS (if not already mounted) and load /eeprom.dat
// into the in-memory buffer. Creates the file with 0xFF fill if
// it doesn't exist. Call after rlr::storage::init().
bool init();

// Read `len` bytes starting at `addr` into `buf`.
// Returns bytes read (clamped to EEPROM_SIZE).
size_t read(uint16_t addr, uint8_t* buf, size_t len);

// Write `len` bytes starting at `addr` from `buf`. Updates the in-memory
// buffer and marks it dirty; the flash commit is deferred to tick()/flush().
// Returns bytes written.
size_t write(uint16_t addr, const uint8_t* buf, size_t len);

// Read a single byte.
uint8_t read_byte(uint16_t addr);

// Write a single byte (deferred commit, as with write()).
void write_byte(uint16_t addr, uint8_t val);

// Flush the entire buffer to the backing file unconditionally.
void commit();

// Call frequently from the main loop. Commits the buffer once writes have
// settled (or after a max-defer cap). No-op when nothing is dirty.
void tick();

// Commit now if there are pending writes. Call before reset / DFU handoff so
// nothing buffered is lost. No-op when nothing is dirty.
void flush();

}} // namespace rlr::eeprom

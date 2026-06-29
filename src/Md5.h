#pragma once
// Minimal MD5 implementation, public domain.
// Adapted from Alexander Peslyak's reference implementation.
#include <stdint.h>
#include <stddef.h>

class MD5 {
public:
    MD5();
    void update(const uint8_t* data, size_t len);
    void finalize();
    void getBytes(uint8_t out[16]) const;

private:
    void transform(const uint8_t block[64]);

    uint32_t m_state[4];
    uint64_t m_count;
    uint8_t  m_buffer[64];
    uint8_t  m_digest[16];
    bool     m_finalized;
};
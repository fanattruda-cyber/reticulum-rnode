#pragma once
// =====================================================================
//  include/board/t1000e.h
//  ------------------------------------------------------------------
//  Seeed SenseCAP T1000-E — nRF52840 + Semtech LR1110
//
//  UNLIKE every other board here, the T1000-E carries an LR1110, not an
//  SX1262. The LR1110 speaks the same RadioLib LoRa API (begin/config/
//  startReceive/startTransmit), so the radio core is shared; only the
//  RF-switch setup and the IRQ-action hook differ — selected by
//  RADIO_USE_LR1110 below and handled in Radio.cpp.
//
//  Pins are the raw nRF52840 GPIOs from Meshtastic's tracker-t1000-e
//  variant, and match the bench-validated agnostic-lora-net config
//  (its AGN_BOARD_T1000 / AGN_RADIO_LR1110 path).
//
//  HARDWARE VALIDATION PENDING: the LR1110 radio path is ported from a
//  working HAL but not bench-tested in THIS firmware. First flasher
//  should verify RX/TX end-to-end.
//
//  Key features:
//    * Integrated LR1110 with TCXO (1.6V on DIO3); RX/TX switched
//      internally (no external RXEN/TXEN, no DIO2-as-RF-switch).
//    * Green user LED on P0.24, ACTIVE HIGH.
//    * nRF52840 + SoftDevice (BLE), USB CDC.
// =====================================================================

// ---- Board identity ------------------------------------------------
#define BOARD_NAME              "SenseCAP T1000-E"
#define BOARD_MANUFACTURER      "Seeed"
#define BOARD_T1000E            0x56
#define PRODUCT_T1000E          0x26
#define MODEL_T1000E            0x26
// ---- Capability flags ----------------------------------------------
#define HAS_TCXO                1
#define HAS_RF_SWITCH_RX_TX     1      // switched internally by the LR1110
#define HAS_BUSY                1
#define HAS_LED                 1
#define HAS_BUTTON              0
#define HAS_BATTERY_SENSE       0      // T1000-E battery ADC pin not validated here yet
#define HAS_VEXT_RAIL           0      // LR1110 powered directly — no GPIO power gate
#define HAS_DISPLAY             0
#define HAS_BLE                 1
#define HAS_PMU                 0
// ---- Radio module --------------------------------------------------
#define RADIO_CHIP              "LR1110"
#define RADIO_MODULE            "SenseCAP T1000-E integrated"
#define RADIO_USE_LR1110        1          // select the RadioLib LR1110 class in Radio.cpp
#define RADIO_TCXO_VOLTAGE_MV   1600
#define RADIO_SPI_OVERRIDE_PINS 1          // remap SPI to the LR1110 pins at init
#define RADIO_DIO2_AS_RF_SWITCH 0          // N/A on LR1110 (internal switch)
#define RADIO_MAX_DBM           22         // LR1110 high-power PA
// ---- Pin numbers (pca10056 convention: P0.x == x, P1.x == 32+x) -----
#define PIN_LORA_NSS            12    // P0.12
#define PIN_LORA_SCK            11    // P0.11
#define PIN_LORA_MOSI           41    // P1.09
#define PIN_LORA_MISO           40    // P1.08
#define PIN_LORA_RESET          42    // P1.10
#define PIN_LORA_BUSY            7    // P0.07
#define PIN_LORA_DIO1           33    // P1.01  (IRQ line)
#define PIN_LORA_RXEN           -1    // RX/TX path is internal to the LR1110
#define PIN_LORA_TXEN           -1
// LED — green LED on P0.24, ACTIVE HIGH (matches our T1000-E variant).
#define PIN_LED                 24    // P0.24
#define LED_ACTIVE_HIGH         1
// ---- Default config values for first boot -------------------------
#define DEFAULT_CONFIG_FREQ_HZ          915000000UL
#define DEFAULT_CONFIG_BW_HZ            125000UL
#define DEFAULT_CONFIG_SF               10
#define DEFAULT_CONFIG_CR               5
#define DEFAULT_CONFIG_TXP_DBM          22
#define DEFAULT_CONFIG_BATT_MULT        1.0f
#define DEFAULT_CONFIG_DISPLAY_NAME     "SenseCAP T1000-E RNode"

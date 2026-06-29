#pragma once
// =====================================================================
//  include/board/Faketec_RA01SH.h
//  ------------------------------------------------------------------
//  Nice!Nano-style nRF52840 ProMicro clone + Ai-Thinker RA-01SH
//  (SX1262, XTAL — NO TCXO, external RF switch via DIO2 + P0.17).
//
//  Same pinout as Faketec (E22-900M30S). The only difference is the
//  oscillator: RA-01SH uses a regular XTAL, not a TCXO.
// =====================================================================
// ---- Board identity ------------------------------------------------
#define BOARD_NAME              "Faketec-RA01SH"
#define BOARD_MANUFACTURER      "DIY / Nice!Nano clone"
#define BOARD_Faketec           0x52
#define PRODUCT_Faketec         0x18
#define MODEL_Faketec           0x18
// ---- Capability flags ----------------------------------------------
#define HAS_TCXO                0       // ← RA-01SH uses XTAL, not TCXO
#define HAS_RF_SWITCH_RX_TX     1
#define HAS_BUSY                1
#define HAS_LED                 1
#define HAS_BUTTON              1
#define HAS_BATTERY_SENSE       1
#define HAS_VEXT_RAIL           1
#define HAS_DISPLAY             0
#define HAS_BLE                 1
#define HAS_PMU                 0
// ---- Radio module --------------------------------------------------
#define RADIO_CHIP              "SX1262"
#define RADIO_MODULE            "Ai-Thinker RA-01SH"
// RADIO_TCXO_VOLTAGE_MV intentionally NOT defined — HAS_TCXO=0
#define RADIO_SPI_OVERRIDE_PINS 1
#define RADIO_DIO2_AS_RF_SWITCH 1
#define RADIO_MAX_DBM           22
// ---- Pin numbers (identical to Faketec E22) -----------------------
#define PIN_LORA_NSS            45    // P1.13
#define PIN_LORA_SCK            43    // P1.11
#define PIN_LORA_MOSI           47    // P1.15
#define PIN_LORA_MISO            2    // P0.02
#define PIN_LORA_RESET           9    // P0.09
#define PIN_LORA_BUSY           29    // P0.29
#define PIN_LORA_DIO1           10    // P0.10
#define PIN_LORA_RXEN           17    // P0.17  (external LNA enable)
#define PIN_LORA_TXEN           -1    // handled by DIO2_AS_RF_SWITCH
// Power / peripherals
#define PIN_VEXT_EN             13    // P0.13
#define VEXT_SETTLE_MS          10
#define PIN_BATTERY             31    // P0.31
#define BATTERY_ADC_RESOLUTION  12
// LED
#define PIN_LED                 15    // P0.15
#define LED_ACTIVE_HIGH         1
// Button
#define PIN_BUTTON              32    // P1.00
// ---- Default config -----------------------------------------------
#define DEFAULT_CONFIG_FREQ_HZ          904375000UL
#define DEFAULT_CONFIG_BW_HZ            250000UL
#define DEFAULT_CONFIG_SF               10
#define DEFAULT_CONFIG_CR               5
#define DEFAULT_CONFIG_TXP_DBM          22
#define DEFAULT_CONFIG_BATT_MULT        1.284f
#define DEFAULT_CONFIG_DISPLAY_NAME     "Rptr-Faketec"

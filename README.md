# reticulum-rnode
<img width="368" height="270" alt="08ikgwg5tlrd1" src="https://github.com/user-attachments/assets/86fa66f2-8efc-4253-8377-5460f2a1bbab" />

RNode firmware with KISS serial interface for nRF52840 + SX1262 boards. Acts as a USB-connected LoRa radio modem for [Reticulum](https://reticulum.network/)'s `RNodeInterface`.

| Board | Radio Module | Status |
|-------|-------------|--------|
| Faketec_v4 (NRF52840-Promicro (Nice!nano clone from Ali)  | RA-01SH/HT-RA62 | Tested |
| RAK4631 (WisBlock Core) | SX1262 integrated | Untested |
| Seeed XIAO nRF52840 Kit | Wio-SX1262 | Untested |
| Heltec Mesh Node T114 | SX1262 integrated | Untested |
| RAK3401 1-Watt | SX1262 + 1W PA | Untested |
| LilyGO T-Echo | SX1262 integrated | Untested  |
| Seeed SenseCAP T1000-E |   | Untested |

# Tested on Soft
Columba,
Sideband,
MeshchatX(PC version)
Nomadnet.

## Building

Requires [PlatformIO](https://platformio.org/).

```bash
# Build for a specific board
pio run -e Faketec_HT_RA62
pio run -e Faketec_RA01SH
pio run -e RAK4631
pio run -e XIAO_nRF52840
pio run -e Heltec_T114
pio run -e RAK3401
pio run -e T-Echo
pio run -e T1000E       # Seeed SenseCAP T1000-E (LR1110)

# Flash via nrfutil (USB bootloader)
pio run -e Faketec_RA01SH -t upload --upload-port COMxx

# Serial monitor
pio device monitor -e Faketec_RA01SH --port COMxx
```

The build produces `firmware.hex`, `firmware.zip` (nrfutil DFU package), and `firmware.uf2` (for boards with UF2 bootloader like XIAO).

## Usage with Reticulum

1. Flash the firmware to your board.
2. Connect via USB. The board appears as a USB CDC serial port at 115200 baud.
3. Configure Reticulum to use `RNodeInterface`:

```ini
# ~/.reticulum/config

[interfaces]
  [[RNode LoRa]]
enabled = true
type = RNodeInterface
port = /dev/ttyACM0# or COMxx on Windows
frequency = 868672500
bandwidth = 125000
spreadingfactor = 7
codingrate = 7
txpower = 5
mode = gateway
allow_overall = yes
name = RNode LoRa

```

4. Start `rnsd` or your Reticulum application. The host will auto-detect the RNode and configure it via KISS commands.

## Bluetooth (BLE) Pairing

The firmware advertises itself over BLE as `RNode XXXX` (the suffix is
derived from the device's MAC address). When pairing from a phone, Android
(and iOS) will show a **PIN entry prompt** — the default PIN is:

```
123456
```

After successful pairing the device shows up in your phone's paired
devices list, and apps like Sideband can connect without further prompts.


## Provisioning 

Self-Provisioning on first boot 

If the device is not officially supported, or FW is handmade then we will still not have a valid signature. Therefore: "keep it simple stupid"





## Related Projects

- [reticulum-lora-repeater](https://github.com/thatSFguy/reticulum-lora-repeater) — Same hardware, different personality: runs Reticulum on-device as an autonomous transport node.



## License

See [LICENSE](LICENSE).

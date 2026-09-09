/**
 * FitSense AI / FlexSense - Laptop Local Serial Bridge Client Script
 * -------------------------------------------------------------------
 * Automatically parses raw serial lines from ESP32/Arduino (JSON or plain numbers),
 * and forwards joint angle payloads to the Render Cloud Backend API.
 */

import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import http from 'http';
import https from 'https';
import { URL } from 'url';

const DEFAULT_PORT = process.env.SERIAL_PORT || 'COM3';
const TARGET_URL = process.argv[3] || process.env.RENDER_EXTERNAL_URL || 'https://fitsense-ai-backend-vpak.onrender.com';
const BAUD_RATE = parseInt(process.env.BAUD_RATE || '115200');

const portPath = process.argv[2] || DEFAULT_PORT;
const ingestEndpoint = `${TARGET_URL.replace(/\/$/, '')}/api/telemetry/ingest`;

console.log(`
===================================================================
 🔌 FitSense AI - Laptop Local Serial Bridge Starting...
 ===================================================================
  • Hardware Port: ${portPath} @ ${BAUD_RATE} baud
  • Cloud API Target: ${ingestEndpoint}
 ===================================================================
`);

async function startBridge() {
  try {
    const ports = await SerialPort.list();
    console.log('[Bridge] Available Serial Ports on laptop:');
    ports.forEach(p => console.log(`  - ${p.path} (${p.manufacturer || 'Unknown Manufacturer'})`));

    const serialPort = new SerialPort({
      path: portPath,
      baudRate: BAUD_RATE,
      autoOpen: false
    });

    const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    serialPort.open((err) => {
      if (err) {
        console.error(`\n❌ Error opening serial port '${portPath}':`, err.message);
        console.log('💡 Tip: Make sure Arduino Serial Monitor is closed and check Device Manager for the COM port.\n');
        process.exit(1);
      }

      console.log(`\n✅ Connected to ESP32 on ${portPath}! Listening for sensor packets...\n`);
    });

    let packetCount = 0;

    parser.on('data', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let payload = null;

      // 1. Try parsing JSON format
      if (trimmed.startsWith('{')) {
        try {
          payload = JSON.parse(trimmed);
        } catch (e) {}
      }

      // 2. Fallback: Parse plain text angle format (e.g., "Joint Angle: 45.2 degrees" or "45.2")
      if (!payload) {
        const numberMatch = trimmed.match(/[-+]?\d*\.?\d+/);
        if (numberMatch) {
          const parsedAngle = parseFloat(numberMatch[0]);
          if (!isNaN(parsedAngle) && parsedAngle >= 0 && parsedAngle <= 180) {
            payload = {
              deviceId: 'ESP32-HARDWARE-AUTOPARSED',
              flexion: parsedAngle,
              sensor1: { roll: 0, pitch: Math.round(parsedAngle * 0.6), yaw: 0 },
              sensor2: { roll: 0, pitch: Math.round(-parsedAngle * 0.4), yaw: 0 },
              battery: 95
            };
          }
        }
      }

      if (payload) {
        packetCount++;
        const angleVal = payload.flexion || payload.flexionAngle || 0;
        console.log(`[Packet #${packetCount}] Flexion Angle: ${angleVal}° | Payload: ${JSON.stringify(payload)}`);

        // Push telemetry packet to Render Cloud Backend API
        postTelemetryToBackend(ingestEndpoint, payload);
      } else {
        console.log(`[Raw Serial Line]: ${trimmed}`);
      }
    });

    serialPort.on('error', (err) => {
      console.error('[Bridge] SerialPort Error:', err.message);
    });

  } catch (err) {
    console.error('[Bridge] Initialization failed:', err);
  }
}

function postTelemetryToBackend(endpointUrl, data) {
  try {
    const parsedUrl = new URL(endpointUrl);
    const postData = JSON.stringify(data);

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const client = parsedUrl.protocol === 'https:' ? https : http;

    const req = client.request(options, (res) => {
      res.on('data', () => {});
    });

    req.on('error', (err) => {
      console.warn(`[Bridge HTTP Warning] Backend unreachable at ${endpointUrl}:`, err.message);
    });

    req.write(postData);
    req.end();
  } catch (err) {
    console.error('[Bridge HTTP Error]:', err.message);
  }
}

startBridge();

/**
 * FitSense AI / FlexSense - Smart Universal Serial Bridge Client Script
 * -------------------------------------------------------------------
 * Universal parser for physical ESP32 / Arduino serial outputs.
 * Parses JSON payloads OR plain text lines like:
 *   - "Joint Angle: 45.2 degrees"
 *   - "Angle: 75.4"
 *   - "flexion: 85.0"
 *   - "45.2"
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
 🔌 FitSense AI - Universal Serial Bridge Active
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

      console.log(`\n✅ Connected to ESP32 on ${portPath}! Streaming sensor packets to dashboard...\n`);
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

      // 2. Extract numeric angle from string format (e.g., "Joint Angle: 45.2 degrees")
      if (!payload) {
        const numberMatches = trimmed.match(/[-+]?\d*\.?\d+/g);
        if (numberMatches && numberMatches.length > 0) {
          const parsedAngle = parseFloat(numberMatches[0]);
          if (!isNaN(parsedAngle) && parsedAngle >= 0 && parsedAngle <= 180) {
            payload = {
              deviceId: 'ESP32-HARDWARE-ARDUINO',
              flexion: parsedAngle,
              angle: parsedAngle,
              jointAngle: parsedAngle,
              sensor1: { roll: 0, pitch: Math.round(parsedAngle * 0.6), yaw: 0 },
              sensor2: { roll: 0, pitch: Math.round(-parsedAngle * 0.4), yaw: 0 },
              battery: 95
            };
          }
        }
      }

      if (payload) {
        packetCount++;
        const angleVal = payload.flexion || payload.flexionAngle || payload.angle || payload.jointAngle || 0;
        console.log(`[Packet #${packetCount}] Arduino Joint Angle: ${angleVal}° | Raw Serial: "${trimmed}"`);

        // Post to backend API
        postTelemetryToBackend(ingestEndpoint, payload);

        // Also post to local backend if target is cloud (dual sync)
        if (TARGET_URL.includes('onrender.com')) {
          postTelemetryToBackend('http://localhost:5000/api/telemetry/ingest', payload);
        }
      } else {
        console.log(`[Raw Serial]: ${trimmed}`);
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

    req.on('error', () => {});

    req.write(postData);
    req.end();
  } catch (err) {}
}

startBridge();

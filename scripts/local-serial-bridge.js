/**
 * FitSense AI / FlexSense - Local Laptop Serial Bridge Client Script
 * -------------------------------------------------------------------
 * This script runs locally on your laptop connected to the ESP32 / Arduino via USB Serial.
 * It reads the relative joint angle JSON output from the microcontroller and automatically 
 * forwards/posts the telemetry packets to your Render Cloud Backend or local API server.
 * 
 * Usage:
 *   node scripts/local-serial-bridge.js [COM_PORT] [TARGET_URL]
 * 
 * Example:
 *   node scripts/local-serial-bridge.js COM3 https://fitsense-ai-backend.onrender.com
 *   node scripts/local-serial-bridge.js COM3 http://localhost:5000
 */

import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import http from 'http';
import https from 'https';
import { URL } from 'url';

// CLI Arguments or Environment Defaults
const DEFAULT_PORT = process.env.SERIAL_PORT || 'COM3';
const TARGET_URL = process.argv[3] || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5000';
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
        console.log('💡 Tip: Make sure your ESP32 is plugged in via USB and check device manager for the correct COM port.\n');
        process.exit(1);
      }

      console.log(`\n✅ Connected to ESP32 on ${portPath}! Listening for sensor packets...\n`);
    });

    let packetCount = 0;

    parser.on('data', (line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) return;

      try {
        const payload = JSON.parse(trimmed);
        packetCount++;

        console.log(`[Packet #${packetCount}] Flexion Angle: ${payload.flexion || payload.flexionAngle || 'N/A'}° | Pitch1: ${payload.sensor1?.pitch || 'N/A'}° | Pitch2: ${payload.sensor2?.pitch || 'N/A'}°`);

        // Forward telemetry packet to Render Cloud API Endpoint
        postTelemetryToBackend(ingestEndpoint, payload);
      } catch (e) {
        console.warn('[Bridge] Ignored non-JSON serial line:', trimmed);
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
      // Drain response
      res.on('data', () => {});
    });

    req.on('error', (err) => {
      console.warn(`[Bridge HTTP Warning] Failed to reach backend at ${endpointUrl}:`, err.message);
    });

    req.write(postData);
    req.end();
  } catch (err) {
    console.error('[Bridge HTTP Error]:', err.message);
  }
}

startBridge();

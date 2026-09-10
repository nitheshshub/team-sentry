import { SerialBridgeStatus, TelemetryPacket } from '../types';

let SerialPortClass: any = null;
let ReadlineParserClass: any = null;

try {
  const spModule = require('serialport');
  const parserModule = require('@serialport/parser-readline');
  SerialPortClass = spModule.SerialPort;
  ReadlineParserClass = parserModule.ReadlineParser;
} catch (e) {
  console.warn('[SerialBridge] Native SerialPort module unavailable in cloud environment. Operating in Web / Telemetry Ingestion mode.');
}

export class SerialBridgeService {
  private port: any = null;
  private parser: any = null;
  private isSimulating: boolean = false; // Default to FALSE so no fake angles run unless explicitly enabled
  private connectedPortName: string | null = null;
  private baudRate: number = 115200;
  private packetsIngested: number = 0;
  private lastPacketReceivedTime: string = 'Never';
  private simulatorInterval: NodeJS.Timeout | null = null;
  private onTelemetryCallback: ((packet: TelemetryPacket) => void) | null = null;

  private simTime: number = 0;

  constructor() {
    const envSim = process.env.SIMULATOR_MODE;
    if (envSim === 'true') {
      this.isSimulating = true;
    } else {
      this.isSimulating = false;
    }
  }

  public onTelemetry(callback: (packet: TelemetryPacket) => void): void {
    this.onTelemetryCallback = callback;
  }

  public getStatus(): SerialBridgeStatus {
    return {
      connected: this.port !== null && this.port.isOpen,
      port: this.connectedPortName,
      baudRate: this.baudRate,
      isSimulating: this.isSimulating,
      lastPacketReceived: this.lastPacketReceivedTime,
      packetsIngested: this.packetsIngested
    };
  }

  public async listAvailablePorts(): Promise<{ path: string; manufacturer?: string }[]> {
    if (!SerialPortClass) {
      return [];
    }
    try {
      const ports = await SerialPortClass.list();
      return ports.map((p: any) => ({ path: p.path, manufacturer: p.manufacturer }));
    } catch (err) {
      console.warn('[SerialBridge] Error listing serial ports:', err);
      return [];
    }
  }

  public async connectToPort(portPath: string, baudRate: number = 115200): Promise<boolean> {
    if (!SerialPortClass) {
      console.warn('[SerialBridge] Physical SerialPort not supported in this cloud environment.');
      return false;
    }

    this.stopSimulator();
    this.closeCurrentPort();

    try {
      this.port = new SerialPortClass({
        path: portPath,
        baudRate: baudRate,
        autoOpen: false
      });

      this.parser = this.port.pipe(new ReadlineParserClass({ delimiter: '\r\n' }));

      this.port.open((err: any) => {
        if (err) {
          console.error(`[SerialBridge] Failed to open port ${portPath}:`, err.message);
          return;
        }

        console.log(`[SerialBridge] Successfully connected to serial port: ${portPath} @ ${baudRate} baud`);
        this.connectedPortName = portPath;
        this.baudRate = baudRate;
        this.isSimulating = false;
      });

      this.parser.on('data', (line: string) => {
        this.handleIncomingDataLine(line);
      });

      this.port.on('error', (err: any) => {
        console.error('[SerialBridge] SerialPort error:', err.message);
      });

      return true;
    } catch (err) {
      console.error('[SerialBridge] Error initializing SerialPort:', err);
      return false;
    }
  }

  public setSimulationMode(enable: boolean): void {
    if (enable) {
      this.closeCurrentPort();
      this.startSimulator();
    } else {
      this.stopSimulator();
      this.isSimulating = false;
    }
  }

  public handleExternalPacket(packet: TelemetryPacket): void {
    // Shutdown simulator immediately when real physical packet arrives
    if (this.isSimulating) {
      this.stopSimulator();
      this.isSimulating = false;
    }

    this.packetsIngested++;
    this.lastPacketReceivedTime = new Date().toISOString();
    
    const realPacket: TelemetryPacket = {
      ...packet,
      isSimulated: false
    };

    if (this.onTelemetryCallback) {
      this.onTelemetryCallback(realPacket);
    }
  }

  private handleIncomingDataLine(line: string): void {
    try {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) return;

      const parsed = JSON.parse(trimmed);
      const packet: TelemetryPacket = {
        timestamp: Date.now(),
        deviceId: parsed.deviceId || 'ESP32-HARDWARE',
        sensor1: parsed.sensor1 || { roll: 0, pitch: 0, yaw: 0 },
        sensor2: parsed.sensor2 || { roll: 0, pitch: 0, yaw: 0 },
        flexionAngle: typeof parsed.flexion === 'number' ? parsed.flexion : (parsed.flexionAngle || 0),
        rawAccel1: parsed.accel1,
        rawAccel2: parsed.accel2,
        batteryLevel: parsed.battery || 95,
        isSimulated: false
      };

      this.handleExternalPacket(packet);
    } catch (e) {
      // Ignore malformed lines
    }
  }

  public startSimulator(): void {
    if (this.simulatorInterval) return;
    this.isSimulating = false;

    this.simulatorInterval = setInterval(() => {
      const packet: TelemetryPacket = {
        timestamp: Date.now(),
        deviceId: 'STANDBY',
        sensor1: { roll: 0, pitch: 0, yaw: 0 },
        sensor2: { roll: 0, pitch: 0, yaw: 0 },
        flexionAngle: 0.0,
        rawAccel1: { ax: 0, ay: 1, az: 0, gx: 0, gy: 0, gz: 0 },
        rawAccel2: { ax: 0, ay: 1, az: 0, gx: 0, gy: 0, gz: 0 },
        batteryLevel: 100,
        isSimulated: false
      };

      if (this.onTelemetryCallback) {
        this.onTelemetryCallback(packet);
      }
    }, 500);
  }

  public stopSimulator(): void {
    this.isSimulating = false;
    if (this.simulatorInterval) {
      clearInterval(this.simulatorInterval);
      this.simulatorInterval = null;
    }
    // Hard kill any orphaned intervals in Node.js event loop
    for (let i = 1; i <= 5000; i++) {
      clearInterval(i);
    }
  }

  private closeCurrentPort(): void {
    if (this.port && this.port.isOpen) {
      this.port.close();
    }
    this.port = null;
    this.parser = null;
    this.connectedPortName = null;
  }
}

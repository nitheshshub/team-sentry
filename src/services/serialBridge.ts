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
  private isSimulating: boolean = true;
  private connectedPortName: string | null = null;
  private baudRate: number = 115200;
  private packetsIngested: number = 0;
  private lastPacketReceivedTime: string = 'Never';
  private simulatorInterval: NodeJS.Timeout | null = null;
  private onTelemetryCallback: ((packet: TelemetryPacket) => void) | null = null;

  private simTime: number = 0;

  constructor() {
    const envSim = process.env.SIMULATOR_MODE;
    if (envSim === 'false') {
      this.isSimulating = false;
    } else {
      this.isSimulating = true;
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
      this.startSimulator();
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
          this.startSimulator();
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
        this.startSimulator();
      });

      return true;
    } catch (err) {
      console.error('[SerialBridge] Error initializing SerialPort:', err);
      this.startSimulator();
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
    // CRITICAL FIX: The instant a real physical hardware packet arrives, IMMEDIATELY SHUT OFF the simulator!
    if (this.isSimulating) {
      this.stopSimulator();
      this.isSimulating = false;
      console.log('⚡ [SerialBridge] Physical ESP32 Hardware Packet Received! Disabling Simulator Mode and locking onto REAL Hardware telemetry.');
    }

    this.packetsIngested++;
    this.lastPacketReceivedTime = new Date().toISOString();
    
    // Ensure packet is marked as real physical hardware
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
    this.isSimulating = true;
    console.log('[SerialBridge] Hardware simulator active (Generating synthetic Dual MPU6050 joint telemetry)');

    this.simulatorInterval = setInterval(() => {
      this.simTime += 0.1;
      
      const baseFlexion = Math.max(0, 52.5 * (1 + Math.sin(this.simTime * 0.8)) - 5);
      const noise = (Math.random() - 0.5) * 1.5;
      const flexionAngle = Math.max(0, Math.round((baseFlexion + noise) * 10) / 10);

      const thighPitch = Math.round((flexionAngle * 0.6) * 10) / 10;
      const shinPitch = Math.round((-flexionAngle * 0.4) * 10) / 10;

      const packet: TelemetryPacket = {
        timestamp: Date.now(),
        deviceId: 'ESP32-SIMULATOR-01',
        sensor1: { roll: 2.1, pitch: thighPitch, yaw: 0.5 },
        sensor2: { roll: -1.4, pitch: shinPitch, yaw: -0.2 },
        flexionAngle: flexionAngle,
        rawAccel1: { ax: 0.02, ay: 0.98, az: 0.15, gx: 0.1, gy: 0.5, gz: 0.2 },
        rawAccel2: { ax: -0.05, ay: 0.95, az: -0.20, gx: -0.2, gy: 0.4, gz: -0.1 },
        batteryLevel: 98,
        isSimulated: true
      };

      if (this.onTelemetryCallback && this.isSimulating) {
        this.packetsIngested++;
        this.lastPacketReceivedTime = new Date().toISOString();
        this.onTelemetryCallback(packet);
      }
    }, 100);
  }

  public stopSimulator(): void {
    if (this.simulatorInterval) {
      clearInterval(this.simulatorInterval);
      this.simulatorInterval = null;
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

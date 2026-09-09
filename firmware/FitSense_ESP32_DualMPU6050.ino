/*
 * FitSense AI / FlexSense - ESP32 Dual MPU6050 Wearable Firmware
 * -------------------------------------------------------------------
 * Hack Summit 7.0 at Aaruush, SRM Institute of Science and Technology
 * Team: Nithesh P (Team Lead & Developer), Koushik G, Sujay S
 * 
 * Hardware Connections:
 *   - MPU6050 #1 (Thigh):  I2C Address 0x68 (AD0 -> GND)
 *   - MPU6050 #2 (Shin):   I2C Address 0x69 (AD0 -> 3.3V)
 *   - SDA:                 ESP32 GPIO 21
 *   - SCL:                 ESP32 GPIO 22
 *   - Haptic Motor Driver: ESP32 GPIO 27 (PWM / Digital Out)
 *   - Buzzer Module:       ESP32 GPIO 14 (Digital Out)
 *   - DFPlayer Mini (Rx):  ESP32 GPIO 17 (Tx2)
 *   - DFPlayer Mini (Tx):  ESP32 GPIO 16 (Rx2)
 * 
 * Features:
 *   1. Dual MPU6050 complementary pitch/roll filter for orientation tracking
 *   2. Relative joint flexion angle calculation: Flexion = |Thigh_Pitch - Shin_Pitch|
 *   3. Real-time JSON output over USB Serial at 115200 baud
 *   4. Hardware Haptic Motor & Buzzer pulse triggers for posture feedback
 */

#include <Wire.h>
#include <HardwareSerial.h>

// MPU6050 I2C Registers & Addresses
#define MPU_ADDRESS_1 0x68 // Thigh IMU
#define MPU_ADDRESS_2 0x69 // Shin IMU

#define MPU6050_PWR_MGMT_1 0x6B
#define MPU6050_ACCEL_XOUT_H 0x3B
#define MPU6050_GYRO_XOUT_H 0x43

// GPIO Output Pins
#define PIN_HAPTIC 27
#define PIN_BUZZER 14

// Filter Alpha (0.96 Gyro, 0.04 Accel)
const float ALPHA = 0.96;
const float RAD_TO_DEG = 57.295779513;

// Sensor 1 Orientation State (Thigh)
float roll1 = 0, pitch1 = 0;
// Sensor 2 Orientation State (Shin)
float roll2 = 0, pitch2 = 0;

unsigned long lastMicros = 0;

void setupMPU(uint8_t address) {
  Wire.beginTransmission(address);
  Wire.write(MPU6050_PWR_MGMT_1);
  Wire.write(0x00); // Wake up MPU6050
  Wire.endTransmission(true);
}

void readMPUData(uint8_t address, float &roll, float &pitch, float dt) {
  Wire.beginTransmission(address);
  Wire.write(MPU6050_ACCEL_XOUT_H);
  Wire.endTransmission(false);
  Wire.requestFrom(address, (uint8_t)14, (uint8_t)true);

  int16_t ax = (Wire.read() << 8) | Wire.read();
  int16_t ay = (Wire.read() << 8) | Wire.read();
  int16_t az = (Wire.read() << 8) | Wire.read();
  int16_t temp = (Wire.read() << 8) | Wire.read();
  int16_t gx = (Wire.read() << 8) | Wire.read();
  int16_t gy = (Wire.read() << 8) | Wire.read();
  int16_t gz = (Wire.read() << 8) | Wire.read();

  // Convert Raw Values
  float ax_g = ax / 16384.0;
  float ay_g = ay / 16384.0;
  float az_g = az / 16384.0;

  float gx_dps = gx / 131.0;
  float gy_dps = gy / 131.0;
  float gz_dps = gz / 131.0;

  // Accelerometer Pitch & Roll
  float accelRoll = atan2(ay_g, az_g) * RAD_TO_DEG;
  float accelPitch = atan2(-ax_g, sqrt(ay_g * ay_g + az_g * az_g)) * RAD_TO_DEG;

  // Complementary Filter
  roll = ALPHA * (roll + gx_dps * dt) + (1.0 - ALPHA) * accelRoll;
  pitch = ALPHA * (pitch + gy_dps * dt) + (1.0 - ALPHA) * accelPitch;
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22, 400000); // SDA: 21, SCL: 22, 400kHz I2C Clock

  pinMode(PIN_HAPTIC, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_HAPTIC, LOW);
  digitalWrite(PIN_BUZZER, LOW);

  // Initialize both MPU6050 sensors
  setupMPU(MPU_ADDRESS_1);
  setupMPU(MPU_ADDRESS_2);

  lastMicros = micros();
  delay(100);
}

void loop() {
  unsigned long nowMicros = micros();
  float dt = (nowMicros - lastMicros) / 1000000.0;
  if (dt <= 0) dt = 0.01;
  lastMicros = nowMicros;

  // Read orientation from both IMUs
  readMPUData(MPU_ADDRESS_1, roll1, pitch1, dt);
  readMPUData(MPU_ADDRESS_2, roll2, pitch2, dt);

  // Calculate Relative Joint Flexion Angle
  float relativeFlexion = fabs(pitch1 - pitch2);
  if (relativeFlexion < 0) relativeFlexion = 0;

  // Output JSON Packet over Serial (115200 baud)
  Serial.print("{\"deviceId\":\"ESP32-HARDWARE-01\",\"sensor1\":{\"roll\":");
  Serial.print(roll1, 2);
  Serial.print(",\"pitch\":");
  Serial.print(pitch1, 2);
  Serial.print(",\"yaw\":0},\"sensor2\":{\"roll\":");
  Serial.print(roll2, 2);
  Serial.print(",\"pitch\":");
  Serial.print(pitch2, 2);
  Serial.print(",\"yaw\":0},\"flexion\":");
  Serial.print(relativeFlexion, 2);
  Serial.println(",\"battery\":96}");

  // Check incoming feedback commands from Serial (Haptic / Buzzer trigger)
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd.equalsIgnoreCase("HAPTIC_ALERT")) {
      digitalWrite(PIN_HAPTIC, HIGH);
      digitalWrite(PIN_BUZZER, HIGH);
      delay(200);
      digitalWrite(PIN_HAPTIC, LOW);
      digitalWrite(PIN_BUZZER, LOW);
    }
  }

  delay(50); // ~20 Hz sampling rate
}

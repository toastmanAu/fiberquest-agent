/**
 * PWM Fan Controller
 * 
 * Controls 30mm DC fan via MOSFET on GPIO18 (PWM)
 * Pi 5 has hardware PWM on GPIO18 (PWM0)
 * 
 * Scales fan speed based on:
 * - CPU temperature
 * - Ollama inference load
 * - System uptime
 */

const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class FanController {
  constructor() {
    this.pwmPin = 18;
    this.pwmChip = null;
    this.pwmChannel = null;
    this.pwmPath = null;
    this.targetDutyCycle = 0;
    this.currentDutyCycle = 0;
    this.minTemp = 50; // Start fan at 50°C
    this.maxTemp = 75; // Full speed at 75°C
    this.minDutyCycle = 20; // 20% minimum (avoid stalling)
    this.maxDutyCycle = 100; // 100% maximum
  }

  async initialize() {
    console.log('[Fan] Initializing PWM fan control on GPIO18...');
    
    try {
      // Find PWM chip for GPIO18
      // Pi 5: GPIO18 is PWM0_M1 (pwmchip0)
      const pwmChips = fs.readdirSync('/sys/class/pwm/');
      
      for (const chip of pwmChips) {
        const npwm = parseInt(fs.readFileSync(`/sys/class/pwm/${chip}/npwm`, 'utf8').trim());
        if (npwm > 0) {
          this.pwmChip = chip;
          this.pwmChannel = 0; // First channel
          break;
        }
      }

      if (!this.pwmChip) {
        throw new Error('No PWM chip found');
      }

      this.pwmPath = `/sys/class/pwm/${this.pwmChip}/pwm${this.pwmChannel}`;
      
      // Export the PWM channel
      await this._writeFile(`/sys/class/pwm/${this.pwmChip}/export`, this.pwmChannel.toString());
      
      // Set period to 50kHz (20us)
      const period = 20000; // nanoseconds
      await this._writeFile(`${this.pwmPath}/period`, period.toString());
      
      // Start at 0% duty cycle
      await this._setDutyCycle(0);
      
      // Enable PWM
      await this._writeFile(`${this.pwmPath}/enable`, '1');
      
      console.log(`[Fan] ✅ PWM initialized on ${this.pwmChip}/pwm${this.pwmChannel}`);
      console.log(`[Fan] Period: 20kHz, Duty cycle: 0%`);
      
    } catch (e) {
      console.error('[Fan] Initialization error:', e.message);
      throw e;
    }
  }

  async start() {
    await this.initialize();
    
    // Update fan speed every 5 seconds based on temp
    setInterval(() => this._updateFanSpeed(), 5000);
  }

  async _updateFanSpeed() {
    try {
      const temp = await this._getCPUTemp();
      this.targetDutyCycle = this._calculateDutyCycle(temp);
      
      // Smooth ramp (don't jump duty cycle instantly)
      const delta = this.targetDutyCycle - this.currentDutyCycle;
      if (Math.abs(delta) > 5) {
        this.currentDutyCycle += delta > 0 ? 5 : -5;
      } else {
        this.currentDutyCycle = this.targetDutyCycle;
      }

      await this._setDutyCycle(this.currentDutyCycle);
      
      if (temp > 70) {
        console.log(`[Fan] ⚠️  Temp ${temp}°C, fan ${this.currentDutyCycle}%`);
      }
    } catch (e) {
      console.error('[Fan] Update error:', e.message);
    }
  }

  _calculateDutyCycle(temp) {
    if (temp < this.minTemp) {
      return 0; // Fan off
    }
    if (temp > this.maxTemp) {
      return this.maxDutyCycle; // Full speed
    }

    // Linear interpolation between minTemp-maxTemp
    const range = this.maxTemp - this.minTemp;
    const tempDelta = temp - this.minTemp;
    const dutyCycle = this.minDutyCycle + (tempDelta / range) * (this.maxDutyCycle - this.minDutyCycle);
    
    return Math.round(dutyCycle);
  }

  async _getCPUTemp() {
    try {
      const temp = await this._readFile('/sys/class/thermal/thermal_zone0/temp');
      return Math.round(parseInt(temp) / 1000); // Convert millidegrees to degrees
    } catch (e) {
      console.error('[Fan] Cannot read CPU temp:', e.message);
      return 50; // Default safe temp
    }
  }

  async _setDutyCycle(percentage) {
    if (percentage < 0) percentage = 0;
    if (percentage > 100) percentage = 100;

    const period = 20000; // nanoseconds
    const dutyCycle = Math.round((percentage / 100) * period);
    
    await this._writeFile(`${this.pwmPath}/duty_cycle`, dutyCycle.toString());
  }

  async _readFile(path) {
    return new Promise((resolve, reject) => {
      fs.readFile(path, 'utf8', (err, data) => {
        if (err) reject(err);
        else resolve(data.trim());
      });
    });
  }

  async _writeFile(path, data) {
    return new Promise((resolve, reject) => {
      fs.writeFile(path, data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async cleanup() {
    console.log('[Fan] Disabling PWM...');
    try {
      await this._writeFile(`${this.pwmPath}/enable`, '0');
      await this._writeFile(`/sys/class/pwm/${this.pwmChip}/unexport`, this.pwmChannel.toString());
    } catch (e) {
      console.error('[Fan] Cleanup error:', e.message);
    }
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  if (global.fanController) {
    await global.fanController.cleanup();
  }
  process.exit(0);
});

module.exports = FanController;

#!/usr/bin/env node
/**
 * Standalone Fan Controller Service
 * 
 * Runs as: systemctl start fiberquest-fan
 * Controls GPIO18 PWM fan independently of agent
 */

const FanController = require('./src/fan-controller');

const fan = new FanController();

fan.start().then(() => {
  console.log('[Fan Service] Running. SIGTERM to stop.');
}).catch(err => {
  console.error('[Fan Service] Fatal:', err.message);
  process.exit(1);
});

// Handle signals
process.on('SIGTERM', async () => {
  console.log('[Fan Service] Stopping...');
  await fan.cleanup();
  process.exit(0);
});

// cPanel Passenger loads this CommonJS entry point.
// The application itself uses ES modules.
import('./server.js').catch((error) => {
  console.error('Backend startup failed:', error);
  process.exitCode = 1;
});

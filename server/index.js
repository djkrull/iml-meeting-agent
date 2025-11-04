const express = require('express');
const cors = require('cors');
const path = require('path');
const reviewRoutes = require('./routes/reviews');
const programRoutes = require('./routes/programs');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/reviews', reviewRoutes);
app.use('/api/programs', programRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'IML Meeting Review Server is running' });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Review server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});

// Keep the server running
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
  });
});

module.exports = app;

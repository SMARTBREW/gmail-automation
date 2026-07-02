import express from 'express';
import {
  JOB_SEARCH_RESUME_URL,
  recordResumeClick,
} from './services/resumeTracking.js';

export function startTrackingServer() {
  const app = express();
  const port = parseInt(process.env.PORT || '5001', 10);

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'resume-tracking' });
  });

  app.get('/r/:trackingId', async (req, res) => {
    const { trackingId } = req.params;
    try {
      await recordResumeClick(trackingId, {
        userAgent: req.get('user-agent'),
        ip: req.ip,
      });
    } catch (error) {
      console.error('Resume click tracking error:', error.message || error);
    }
    res.redirect(302, JOB_SEARCH_RESUME_URL);
  });

  app.listen(port, '0.0.0.0', () => {
    console.log(`🔗 Resume tracking server on http://0.0.0.0:${port}`);
  });

  return app;
}

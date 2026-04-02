import cron from 'node-cron';
import { runPipeline } from './pipeline';

// Every Monday at 9am
cron.schedule('0 9 * * 1', async () => {
  try {
    await runPipeline();
  } catch (err) {
    console.error('[cron] pipeline error:', err);
  }
});

console.log('[cron] scheduled: every Monday at 9am');

import { startPolling } from './poll-url-change.mjs';

const subscription = startPolling(JSON.parse(process.env.POLLING_OPTIONS as string))
process.on('exit', () => subscription.unsubscribe());
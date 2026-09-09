import { createApp } from './app';
import { env } from './env';

const app = createApp();

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[nexo-ia] backend ouvindo em http://localhost:${env.PORT}`);
});

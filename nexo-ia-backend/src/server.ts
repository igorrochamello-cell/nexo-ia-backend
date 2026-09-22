import { createApp } from './app';
import { env } from './env';

const app = createApp();

// Para Vercel: exportar a app como default
export default app;

// Para desenvolvimento local: iniciar servidor se não for importado
const isModuleMain = require.main === module;
if (isModuleMain) {
  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[nexo-ia] backend ouvindo em http://localhost:${env.PORT}`);
  });
}

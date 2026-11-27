import { progressGateway } from '../_shared/gateway.ts';
import { loadConfig } from '../_shared/config.ts';

export default { fetch: (request: Request) => progressGateway(request, loadConfig()) };

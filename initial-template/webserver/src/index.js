import http from "node:http";
import fs from "node:fs/promises";
import { join } from "node:path";
import url from "node:url";
import Routes from "./routes.js";
import { logger } from "./util.js";

const PORT = 3000;

const dirName = url.fileURLToPath(new URL(import.meta.url));

const downloadsFolder = join(dirName, "../../", "downloads");

async function defaultRoute(request, response) {
  return response.end("Hello!");
}

function handler(request, response) {
  const routes = new Routes({
    downloadsFolder,
  });

  const validRoute = routes[request.method.toLowerCase()];

  const finalRoute = validRoute || defaultRoute;

  return finalRoute.apply(routes, [request, response]);
}

const server = http.createServer(handler);

await fs.rm(downloadsFolder, { recursive: true, force: true });
await fs.mkdir(downloadsFolder);

function startServer() {
  const { address, port } = server.address();

  logger.info(`app running at http://${address}:${port}`);
}

server.listen(PORT, startServer);

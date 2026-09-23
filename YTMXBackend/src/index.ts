import "dotenv/config";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FastRouter } from "@antalervin19/fastrouter";

const server = Fastify({
    logger: true
});

server.register(cookie);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

server.register(fastifyStatic, {
    root: path.resolve(__dirname, "../../YTMXFrontend"),
    prefix: "/"
});

server.get("/", async () => {
    return {
        name: "YTMX Backend",
        status: "online"
    };
});

server.get("/login", async (request, reply) => {
    return reply.sendFile("Login/index.html");
});

server.get("/register", async (request, reply) => {
    return reply.sendFile("Register/index.html");
});

const router = new FastRouter(server, {
    directory: path.resolve(__dirname, "../routes")
});

router.get("/api/test");
router.get("/auth/google");
router.get("/auth/google/callback");
router.post("/api/auth/register");

await router.load();

await server.listen({
    port: 3000,
    host: "0.0.0.0"
});

console.log("Server is running on http://0.0.0.0:3000");
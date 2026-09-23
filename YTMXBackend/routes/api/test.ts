import type { FastifyRequest, FastifyReply } from "fastify";
import db from "../../src/database.js";

export default async function (
    request: FastifyRequest,
    reply: FastifyReply
) {
    const result = db.prepare("SELECT 1 AS connected").get();

    return reply.send({
        success: true,
        database: result
    });
}
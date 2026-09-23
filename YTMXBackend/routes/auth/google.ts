import type { FastifyRequest, FastifyReply } from "fastify";
import { createGoogleAuthUrl, createState } from "../../src/auth.js";

export default async function (
    request: FastifyRequest,
    reply: FastifyReply
) {
    const state = createState();

    reply.setCookie("google_oauth_state", state, {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: "/"
    });

    const url = createGoogleAuthUrl(state);

    return reply.redirect(url);
}
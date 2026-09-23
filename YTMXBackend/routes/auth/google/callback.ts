import type { FastifyRequest, FastifyReply } from "fastify";
import crypto from "node:crypto";
import { google } from "googleapis";
import db from "../../../src/database.js";
import { googleOAuth } from "../../../src/auth.js";

export default async function (
    request: FastifyRequest,
    reply: FastifyReply
) {
    const query = request.query as {
        code?: string;
        state?: string;
        error?: string;
    };

    if (query.error) {
        return reply.code(400).send({
            error: query.error
        });
    }

    const savedState = request.cookies.google_oauth_state;

    if (!query.state || query.state !== savedState) {
        return reply.code(400).send({
            error: "Invalid OAuth state"
        });
    }

    if (!query.code) {
        return reply.code(400).send({
            error: "Missing authorization code"
        });
    }

    const { tokens } = await googleOAuth.getToken(query.code);

    googleOAuth.setCredentials(tokens);

    const oauth2 = google.oauth2({
        auth: googleOAuth,
        version: "v2"
    });

    const { data } = await oauth2.userinfo.get();

    if (!data.id || !data.email) {
        return reply.code(400).send({
            error: "Google account information is incomplete"
        });
    }

    const existingUser = db.prepare(`
        SELECT id
        FROM users
        WHERE google_id = ?
    `).get(data.id) as { id: number } | undefined;

    if (!existingUser) {
        const registrationId = crypto.randomBytes(32).toString("hex");
        const now = Date.now();
        const expiresAt = now + 10 * 60 * 1000;

        db.prepare(`
            INSERT INTO registration_sessions (
                id,
                google_id,
                email,
                name,
                avatar,
                created_at,
                expires_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            registrationId,
            data.id,
            data.email,
            data.name ?? null,
            data.picture ?? null,
            now,
            expiresAt
        );

        reply.setCookie("ytmx_registration", registrationId, {
            httpOnly: true,
            sameSite: "lax",
            secure: false,
            path: "/",
            maxAge: 10 * 60
        });

        reply.clearCookie("google_oauth_state", {
            path: "/"
        });

        return reply.type("text/html").send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>YTMX Registration</title>
            </head>
            <body>
                <script>
                    window.opener.postMessage(
                        {
                            type: "ytmx-registration-required"
                        },
                        window.location.origin
                    );

                    window.close();
                </script>
            </body>
            </html>
        `);
    }

    const sessionId = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    const expiresAt = now + 30 * 24 * 60 * 60 * 1000;

    db.prepare(`
        INSERT INTO sessions (
            id,
            user_id,
            created_at,
            expires_at
        )
        VALUES (?, ?, ?, ?)
    `).run(
        sessionId,
        existingUser.id,
        now,
        expiresAt
    );

    reply.setCookie("ytmx_session", sessionId, {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: "/",
        maxAge: 30 * 24 * 60 * 60
    });

    reply.clearCookie("google_oauth_state", {
        path: "/"
    });

    return reply.type("text/html").send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>YTMX Login</title>
        </head>
        <body>
            <script>
                window.opener.postMessage(
                    {
                        type: "ytmx-login-success"
                    },
                    window.location.origin
                );

                window.close();
            </script>

            <p>Login successful. You can close this window.</p>
        </body>
        </html>
    `);
}
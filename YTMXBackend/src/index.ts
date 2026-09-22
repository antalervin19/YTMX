import "dotenv/config";
import Fastify from "fastify";
import db from "./database.js";
import cookie from "@fastify/cookie";
import { google } from "googleapis";
import { createGoogleAuthUrl, createState, googleOAuth } from "./auth.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import crypto from "node:crypto";

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

server.get("/api/test", async () => {
    const result = db.prepare("SELECT 1 AS connected").get();

    return {
        success: true,
        database: result
    };
});

server.get("/api/test/user", async () => {
    const googleId = "test-google-id";

    const existingUser = db.prepare(`
        SELECT id, email, name, avatar, created_at
        FROM users
        WHERE google_id = ?
    `).get(googleId);

    if (existingUser) {
        return {
            success: true,
            existing: true,
            user: existingUser
        };
    }

    const result = db.prepare(`
        INSERT INTO users (
            google_id,
            email,
            name,
            avatar,
            created_at
        )
        VALUES (?, ?, ?, ?, ?)
    `).run(
        googleId,
        "test@ytmx.local",
        "Test User",
        null,
        Date.now()
    );

    return {
        success: true,
        existing: false,
        userId: result.lastInsertRowid
    };
});

server.get("/auth/google", async (request, reply) => {
    const state = createState();

    reply.setCookie("google_oauth_state", state, {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: "/"
    });

    const url = createGoogleAuthUrl(state);

    return reply.redirect(url);
});

server.get("/login", async (request, reply) => {
    return reply.sendFile("Login/index.html");
});

server.get("/auth/google/callback", async (request, reply) => {
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

    // Check if the Google account already has a YTMX account
    const existingUser = db.prepare(`
        SELECT id
        FROM users
        WHERE google_id = ?
    `).get(data.id) as { id: number } | undefined;

    // New Google account → registration
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

    // Existing YTMX account → create login session
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
});

server.post("/api/auth/register", async (request, reply) => {
    const registrationId = request.cookies.ytmx_registration;

    if (!registrationId) {
        return reply.code(401).send({
            error: "Registration session expired."
        });
    }

    const body = request.body as {
        name?: string;
    };

    const name = body.name?.trim();

    if (!name) {
        return reply.code(400).send({
            error: "Name is required."
        });
    }

    if (name.length > 32) {
        return reply.code(400).send({
            error: "Name must be 32 characters or less."
        });
    }

    const registration = db.prepare(`
        SELECT *
        FROM registration_sessions
        WHERE id = ?
          AND expires_at > ?
    `).get(registrationId, Date.now()) as {
        id: string;
        google_id: string;
        email: string;
        avatar: string | null;
    } | undefined;

    if (!registration) {
        return reply.code(401).send({
            error: "Registration session expired."
        });
    }

    const now = Date.now();

    const result = db.prepare(`
        INSERT INTO users (
            google_id,
            email,
            name,
            avatar,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        registration.google_id,
        registration.email,
        name,
        registration.avatar,
        now,
        now
    );

    const sessionId = crypto.randomBytes(32).toString("hex");
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
        result.lastInsertRowid,
        now,
        expiresAt
    );

    db.prepare(`
        DELETE FROM registration_sessions
        WHERE id = ?
    `).run(registrationId);

    reply.clearCookie("ytmx_registration", {
        path: "/"
    });

    reply.setCookie("ytmx_session", sessionId, {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: "/",
        maxAge: 30 * 24 * 60 * 60
    });

    return {
        success: true
    };
});

server.listen({
    port: 3000,
    host: "0.0.0.0"
}).then(() => {
    console.log("Server is running on http://0.0.0.0:3000");
});
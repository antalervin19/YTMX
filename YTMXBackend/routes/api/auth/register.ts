import type { FastifyRequest, FastifyReply } from "fastify";
import crypto from "node:crypto";
import db from "../../../src/database.js";

export default async function (
    request: FastifyRequest,
    reply: FastifyReply
) {
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
}
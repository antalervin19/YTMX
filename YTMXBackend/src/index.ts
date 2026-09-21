import Fastify from "fastify";
import db from "./database.js";

const server = Fastify({
    logger: true
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

server.listen({
    port: 3000,
    host: "0.0.0.0"
}).then(() => {
    console.log("Server is running on http://0.0.0.0:3000");
});
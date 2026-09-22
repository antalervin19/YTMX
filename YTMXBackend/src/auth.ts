import { google } from "googleapis";
import crypto from "node:crypto";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = process.env.GOOGLE_REDIRECT_URI;

if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth environment variables are missing");
}

export const googleOAuth = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
);

export function createGoogleAuthUrl(state: string) {
    return googleOAuth.generateAuthUrl({
        access_type: "offline",
        scope: [
            "openid",
            "email",
            "profile"
        ],
        state,
        include_granted_scopes: true
    });
}

export function createState() {
    return crypto.randomBytes(32).toString("hex");
}
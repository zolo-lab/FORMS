import { NextResponse } from "next/server";

export const unauthorized = () => NextResponse.json({ error: "unauthorized", message: "Send an API key as `Authorization: Bearer fk_…`" }, { status: 401, headers: { "www-authenticate": "Bearer" } });
export const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });

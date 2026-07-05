import { NextRequest } from "next/server";
import { handleWebhook } from "@/lib/lineWebhook";

export async function POST(req: NextRequest) {
  return handleWebhook(req, "school2");
}

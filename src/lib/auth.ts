import { cookies } from "next/headers";
import { verifyToken } from "@/lib/sessionAuth";
export { signToken, verifyToken } from "@/lib/sessionAuth";

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth-token")?.value;
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

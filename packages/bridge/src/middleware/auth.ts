import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const authMiddleware = async (c: any, next: any) => {
  const authHeader = c.req.header("Authorization");
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid authorization header" }, 401);
  }

  const token = authHeader.split(" ")[1];

  // Check if it is a Personal Access Token (PAT) for MCP
  if (token.startsWith("fm_")) {
    const { data, error } = await supabase
      .from("personal_access_tokens")
      .select("user_id, profiles(role)")
      .eq("token", token)
      .single();
      
    if (error || !data) {
      return c.json({ error: "Invalid personal access token" }, 401);
    }
    
    c.set("user", { id: data.user_id, role: Array.isArray(data.profiles) ? data.profiles[0]?.role : (data.profiles as any)?.role });
    await next();
    return;
  }

  // Otherwise, verify as a standard Supabase JWT
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return c.json({ error: "Invalid token" }, 401);
  }

  // Fetch role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  c.set("user", { id: user.id, role: profile?.role || "user" });
  await next();
};


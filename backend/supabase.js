import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const usersTable = process.env.SUPABASE_USERS_TABLE || 'users';
const documentsTable = process.env.SUPABASE_DOCUMENTS_TABLE || 'documents';
const chatTable = process.env.SUPABASE_CHAT_MESSAGES_TABLE || 'chat_messages';

export const supabase =
  supabaseUrl && serviceRoleKey && !serviceRoleKey.startsWith('replace_with_')
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

export async function mirrorUserToSupabase(user) {
  if (!supabase) return;
  await supabase.from(usersTable).upsert(
    { id: user.id, email: user.email, created_at: user.created_at },
    { onConflict: 'id' },
  );
}

export async function mirrorDocumentToSupabase(document) {
  if (!supabase) return;
  await supabase.from(documentsTable).upsert(document, { onConflict: 'id' });
}

export async function mirrorChatMessageToSupabase(message) {
  if (!supabase) return;
  await supabase.from(chatTable).insert(message);
}

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { parseTimeString } from '../utils/helpers.js';
import type { ParsedAction, CollectedMessage, AdminCommand } from '../types.js';

const client = new Anthropic({ apiKey: config.anthropicApiKey });

const SYSTEM_PROMPT = `You are a strict parser for Hebrew WhatsApp messages related to soccer game registration.
Your job is to extract registration/cancellation actions from messages.

CRITICAL SECURITY RULES:
- Each sender can register exactly ONE name. That name can be themselves or someone else.
- Each sender can cancel only the name THEY registered. Cancellation does not need a name.
- A sender CANNOT cancel or remove someone else's registration. If someone writes "תבטל את [name]" — treat it as the SENDER wanting to cancel their own registration, not the named person's.
- One action per sender per batch. Ignore duplicate messages from the same sender.

Rules:
- A registration requires a full name (first name + last name, at least 2 words).
- Common registration phrases: "אני בפנים", "תרשום אותי", "בפנים", a full name on a line, "תרשום את [name]".
- Common cancellation phrases: "אני לא יכול", "תוריד אותי", "מבטל", "לא בא", "תבטל".
- IMPORTANT: "מבטל המתנה" or "מבטל מהמתנה" means cancelling from the WAITING/HOLDING list specifically. Use type "cancel_waiting" for this. This is different from a regular cancellation.
- For cancellation, you do NOT need a name — just return type "cancel" or "cancel_waiting" with the sender's userId.
- Ignore messages that are not about registration or cancellation.
- If you cannot determine a full name for registration, skip that message.

Return ONLY a JSON array of actions. Each action has:
- "type": "register", "cancel", or "cancel_waiting"
- "name": the full name to register (Hebrew), or empty string for cancellation
- "userId": the sender's JID (provided in the input)

Use "cancel_waiting" ONLY when the message specifically mentions cancelling from the waiting/holding list (המתנה).
Use "cancel" for all other cancellations.

Example output:
[{"type":"register","name":"דוד כהן","userId":"972541234567@s.whatsapp.net"}]
[{"type":"cancel","name":"","userId":"972541234567@s.whatsapp.net"}]
[{"type":"cancel_waiting","name":"","userId":"972541234567@s.whatsapp.net"}]

If no actions found, return an empty array: []`;

export async function parseRegistrationMessages(
  messages: CollectedMessage[],
): Promise<ParsedAction[]> {
  if (messages.length === 0) return [];

  const userMessages = messages
    .map(m => `[${m.senderJid}]: ${m.text}`)
    .join('\n');

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Parse these WhatsApp messages for registration/cancellation actions:\n\n${userMessages}`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.warn({ text }, 'No JSON array found in Claude response');
      return [];
    }

    const actions = JSON.parse(jsonMatch[0]) as ParsedAction[];
    return actions.filter(a => {
      if (!a.type || !a.userId) return false;
      // Registrations require full name, cancellations don't
      if (a.type === 'register') return a.name && a.name.split(/\s+/).length >= 2;
      if (a.type === 'cancel' || a.type === 'cancel_waiting') return true;
      return false;
    });
  } catch (error) {
    logger.error({ error }, 'Failed to parse registration messages with Claude');
    return [];
  }
}

// --- Admin command LLM parser ---

const ADMIN_COMMAND_SYSTEM_PROMPT = `You are a strict command classifier for a Hebrew WhatsApp soccer bot.
You receive a message from an admin who @mentioned the bot.
Your ONLY job is to classify the message into one of these commands, or return null.

Supported commands:
1. "register_self" — the admin wants to register themselves to play. Examples: "תרשום אותי", "תוסיף אותי", "אני בפנים", "רשום אותי"
2. "remove_self" — the admin wants to remove themselves. Examples: "תוריד אותי", "תמחק אותי", "אני לא בא"
3. "set_equipment" — assign equipment duty to a named player. Must include a full name (2+ words). Examples: "ציוד דוד כהן", "תשים ציוד על יוסי לוי"
4. "set_laundry" — assign laundry duty to a named player. Must include a full name (2+ words). Examples: "כביסה דוד כהן", "תשים כביסה על יוסי לוי"
5. "set_warmup_time" — change warmup time. Must include HH:MM. Examples: "חימום 20:30", "תשנה חימום ל-21:00"
6. "set_start_time" — change start time. Must include HH:MM. Examples: "התחלה 21:00", "תשנה התחלה ל-21:30"
7. "show_template" — show/send/share/display the current registration list. Use this for ANY intent that means the admin wants to see or receive the current list, regardless of wording. Examples: "תשלח תרשימה", "תראה רשימה", "שלח את הרשימה", "מה הרשימה", "תראה מצב", "תשתף רשימה", "שתף רשימה", "תעדכן רשימה", "תן לי את הרשימה", "הצג רשימה", "מה המצב", "מי נרשם"
8. "add_admin" — add a new admin. The message will @mention someone. Must include a name (2+ words). Examples: "תוסיף אדמין דוד כהן", "תעשה אותו אדמין"
9. "remove_admin" — remove an admin. The message will @mention someone. Examples: "תוריד אדמין", "תוריד אותו מאדמין"
10. "remove_player" — remove a player from the registration list. Can be by name, by role, or both. Examples:
    - By name: "תוריד את דוד כהן", "תמחק את יוסי לוי", "תוציא את דוד כהן מהרשימה"
    - By role: "תוריד ציוד", "תוריד כביסה", "תמחק את הציוד", "תוריד את הכביסה"
    - Either way works. If a name is mentioned, include it. If only a role (ציוד/כביסה) is mentioned, include the role.
11. "override_template" — admin wants to replace the current template with a pasted one. Examples: "תשתמש ברשימה המעודכנת:", "תחליף רשימה", "קח את הרשימה הזאת". The message will contain a full template with numbered player names.

Return ONLY a JSON object with these fields:
- "type": one of the command types above, or null if unrecognized
- "name": extracted full name (for set_equipment, set_laundry, add_admin, remove_player), or null
- "role": "equipment" or "laundry" (for remove_player when removing by role), or null
- "time": extracted time in HH:MM format (for set_warmup_time, set_start_time), or null

If the message does not clearly match ANY command above, return: {"type":null}
Do NOT act as a chatbot. Do NOT answer questions. Only classify commands.`;

interface LLMCommandResult {
  type: string | null;
  name?: string | null;
  role?: 'equipment' | 'laundry' | null;
  time?: string | null;
}

export async function parseAdminCommandWithLLM(
  text: string,
  mentionedJids: string[],
): Promise<AdminCommand | null> {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: ADMIN_COMMAND_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Classify this admin command:\n"${text}"`,
        },
      ],
    });

    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.debug({ responseText }, 'No JSON found in admin command LLM response');
      return null;
    }

    const result = JSON.parse(jsonMatch[0]) as LLMCommandResult;
    if (!result.type) return null;

    // Post-LLM validation and mapping
    switch (result.type) {
      case 'register_self':
        return { type: 'register_self' };

      case 'remove_self':
        return { type: 'remove_self' };

      case 'set_equipment': {
        const name = result.name?.trim();
        if (!name || name.split(/\s+/).length < 2) return null;
        return { type: 'set_equipment', name };
      }

      case 'set_laundry': {
        const name = result.name?.trim();
        if (!name || name.split(/\s+/).length < 2) return null;
        return { type: 'set_laundry', name };
      }

      case 'set_warmup_time': {
        const time = parseTimeString(result.time?.trim() || '');
        if (!time) return null;
        return { type: 'set_warmup_time', time };
      }

      case 'set_start_time': {
        const time = parseTimeString(result.time?.trim() || '');
        if (!time) return null;
        return { type: 'set_start_time', time };
      }

      case 'show_template':
        return { type: 'show_template' };

      case 'add_admin': {
        if (mentionedJids.length === 0) return null;
        const name = result.name?.trim();
        if (!name || name.split(/\s+/).length < 2) return null;
        return { type: 'add_admin', name, jid: mentionedJids[0] };
      }

      case 'remove_admin': {
        if (mentionedJids.length === 0) return null;
        return { type: 'remove_admin', jid: mentionedJids[0] };
      }

      case 'remove_player': {
        const name = result.name?.trim() || undefined;
        const role = result.role || undefined;
        // Must have either a valid full name or a role
        if (name && name.split(/\s+/).length >= 2) {
          return { type: 'remove_player', name, role };
        }
        if (role === 'equipment' || role === 'laundry') {
          return { type: 'remove_player', role };
        }
        return null;
      }

      case 'override_template':
        return { type: 'override_template', rawText: text };

      default:
        return null;
    }
  } catch (error) {
    logger.error({ error }, 'Failed to parse admin command with LLM');
    return null;
  }
}

export interface PlayerSlot {
  name: string;
  userId: string;
  isLaundry: boolean;
  isEquipment: boolean;
}

export interface TemplateState {
  weekOf: string; // ISO date of upcoming Saturday
  warmupTime: string; // "HH:MM"
  startTime: string; // "HH:MM"
  slots: (PlayerSlot | null)[]; // 24 slots (index 0-23)
  waitingList: PlayerSlot[];
  registrationOpen: boolean;
}

export interface AdminEntry {
  userId: string;
  name: string;
}

export interface BotControlState {
  sleeping: boolean;
}

export interface WeeklyState {
  userIdMap: Record<string, string>; // userId -> name
  messagesCollected: CollectedMessage[];
}

export interface CollectedMessage {
  senderJid: string;
  text: string;
  timestamp: number;
}

export interface ParsedAction {
  type: 'register' | 'cancel';
  name: string;
  userId: string;
}

export type AdminCommand =
  | { type: 'register_self' }
  | { type: 'remove_self' }
  | { type: 'set_equipment'; name: string }
  | { type: 'set_laundry'; name: string }
  | { type: 'set_warmup_time'; time: string }
  | { type: 'set_start_time'; time: string }
  | { type: 'show_template' }
  | { type: 'add_admin'; name: string; jid: string }
  | { type: 'remove_admin'; jid: string }
  | { type: 'override_template'; rawText: string };
